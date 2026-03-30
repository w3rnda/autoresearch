'use strict'
const prisma = require('../prisma')
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response.utils')
const { getPaginationParams, getPaginationMeta } = require('../utils/pagination.utils')
const { scheduleEnrollment } = require('../workers/email.worker')

/**
 * GET /sequences
 */
const getSequences = async (req, res, next) => {
  try {
    const { organizationId } = req.user
    const { page, limit, skip } = getPaginationParams(req.query)

    const [sequences, total] = await Promise.all([
      prisma.emailSequence.findMany({
        where: { organizationId },
        include: { _count: { select: { steps: true, enrollments: true } } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.emailSequence.count({ where: { organizationId } }),
    ])

    return res.status(200).json(
      paginatedResponse(sequences, getPaginationMeta({ page, limit, total }))
    )
  } catch (error) {
    next(error)
  }
}

/**
 * POST /sequences
 */
const createSequence = async (req, res, next) => {
  try {
    const { name } = req.body
    const { organizationId } = req.user

    const sequence = await prisma.emailSequence.create({
      data: { name, organizationId },
    })

    return res.status(201).json(successResponse(sequence, 'Sequence created'))
  } catch (error) {
    next(error)
  }
}

/**
 * GET /sequences/:id
 */
const getSequenceById = async (req, res, next) => {
  try {
    const { id } = req.params
    const { organizationId } = req.user

    const sequence = await prisma.emailSequence.findFirst({
      where: { id, organizationId },
      include: {
        steps: { orderBy: { order: 'asc' } },
        _count: { select: { enrollments: true } },
      },
    })

    if (!sequence) {
      return res.status(404).json(errorResponse('Sequence not found'))
    }

    return res.status(200).json(successResponse(sequence))
  } catch (error) {
    next(error)
  }
}

/**
 * PUT /sequences/:id
 */
const updateSequence = async (req, res, next) => {
  try {
    const { id } = req.params
    const { name } = req.body
    const { organizationId } = req.user

    const existing = await prisma.emailSequence.findFirst({ where: { id, organizationId } })
    if (!existing) {
      return res.status(404).json(errorResponse('Sequence not found'))
    }

    const updated = await prisma.emailSequence.update({ where: { id }, data: { name } })

    return res.status(200).json(successResponse(updated, 'Sequence updated'))
  } catch (error) {
    next(error)
  }
}

/**
 * DELETE /sequences/:id
 */
const deleteSequence = async (req, res, next) => {
  try {
    const { id } = req.params
    const { organizationId } = req.user

    const existing = await prisma.emailSequence.findFirst({ where: { id, organizationId } })
    if (!existing) {
      return res.status(404).json(errorResponse('Sequence not found'))
    }

    await prisma.emailSequence.delete({ where: { id } })

    return res.status(200).json(successResponse(null, 'Sequence deleted'))
  } catch (error) {
    next(error)
  }
}

/**
 * POST /sequences/:id/steps
 */
const addStep = async (req, res, next) => {
  try {
    const { id } = req.params
    const { subject, body: emailBody, delayDays, order } = req.body
    const { organizationId } = req.user

    const sequence = await prisma.emailSequence.findFirst({ where: { id, organizationId } })
    if (!sequence) {
      return res.status(404).json(errorResponse('Sequence not found'))
    }

    // Auto-assign order if not provided
    let stepOrder = order
    if (stepOrder === undefined) {
      const lastStep = await prisma.sequenceStep.findFirst({
        where: { sequenceId: id },
        orderBy: { order: 'desc' },
      })
      stepOrder = lastStep ? lastStep.order + 1 : 1
    }

    const step = await prisma.sequenceStep.create({
      data: { sequenceId: id, subject, body: emailBody, delayDays, order: stepOrder },
    })

    return res.status(201).json(successResponse(step, 'Step added'))
  } catch (error) {
    next(error)
  }
}

/**
 * PUT /sequences/:id/steps/:stepId
 */
const updateStep = async (req, res, next) => {
  try {
    const { id, stepId } = req.params
    const { subject, body: emailBody, delayDays, order } = req.body
    const { organizationId } = req.user

    const sequence = await prisma.emailSequence.findFirst({ where: { id, organizationId } })
    if (!sequence) {
      return res.status(404).json(errorResponse('Sequence not found'))
    }

    const existing = await prisma.sequenceStep.findFirst({
      where: { id: stepId, sequenceId: id },
    })
    if (!existing) {
      return res.status(404).json(errorResponse('Step not found'))
    }

    const updated = await prisma.sequenceStep.update({
      where: { id: stepId },
      data: {
        ...(subject !== undefined && { subject }),
        ...(emailBody !== undefined && { body: emailBody }),
        ...(delayDays !== undefined && { delayDays }),
        ...(order !== undefined && { order }),
      },
    })

    return res.status(200).json(successResponse(updated, 'Step updated'))
  } catch (error) {
    next(error)
  }
}

/**
 * DELETE /sequences/:id/steps/:stepId
 */
const deleteStep = async (req, res, next) => {
  try {
    const { id, stepId } = req.params
    const { organizationId } = req.user

    const sequence = await prisma.emailSequence.findFirst({ where: { id, organizationId } })
    if (!sequence) {
      return res.status(404).json(errorResponse('Sequence not found'))
    }

    const existing = await prisma.sequenceStep.findFirst({
      where: { id: stepId, sequenceId: id },
    })
    if (!existing) {
      return res.status(404).json(errorResponse('Step not found'))
    }

    await prisma.sequenceStep.delete({ where: { id: stepId } })

    return res.status(200).json(successResponse(null, 'Step deleted'))
  } catch (error) {
    next(error)
  }
}

/**
 * POST /sequences/:id/enroll
 * Body: { leadIds: string[] }
 * Enrolls leads and schedules the first email step for each.
 * Upserts: reactivates PAUSED/COMPLETED enrollments, skips already ACTIVE ones.
 */
const enrollLeads = async (req, res, next) => {
  try {
    const { id } = req.params
    const { leadIds } = req.body
    const { organizationId } = req.user

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json(errorResponse('leadIds must be a non-empty array'))
    }

    const sequence = await prisma.emailSequence.findFirst({
      where: { id, organizationId },
      include: { steps: { orderBy: { order: 'asc' } } },
    })
    if (!sequence) {
      return res.status(404).json(errorResponse('Sequence not found'))
    }

    if (sequence.steps.length === 0) {
      return res.status(400).json(errorResponse('Sequence has no steps'))
    }

    // Validate leads belong to org
    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds }, organizationId },
    })

    const validLeadIds = leads.map(l => l.id)
    const invalidIds = leadIds.filter(lid => !validLeadIds.includes(lid))

    // Skip already ACTIVE enrollments
    const existingActive = await prisma.sequenceEnrollment.findMany({
      where: { sequenceId: id, leadId: { in: validLeadIds }, status: 'ACTIVE' },
      select: { leadId: true },
    })
    const alreadyActiveSet = new Set(existingActive.map(e => e.leadId))

    const toEnroll = validLeadIds.filter(lid => !alreadyActiveSet.has(lid))

    const enrollments = []
    for (const leadId of toEnroll) {
      // Upsert: reactivate paused/completed or create new
      const existing = await prisma.sequenceEnrollment.findFirst({
        where: { sequenceId: id, leadId },
      })

      let enrollment
      if (existing) {
        enrollment = await prisma.sequenceEnrollment.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', currentStep: 0 },
        })
      } else {
        enrollment = await prisma.sequenceEnrollment.create({
          data: { leadId, sequenceId: id, currentStep: 0, status: 'ACTIVE' },
        })
      }

      enrollments.push(enrollment)
      scheduleEnrollment(enrollment.id)
    }

    return res.status(200).json(
      successResponse(
        {
          enrolled: toEnroll.length,
          alreadyActive: alreadyActiveSet.size,
          invalid: invalidIds.length,
          invalidIds,
          enrollments,
        },
        `${toEnroll.length} leads enrolled`
      )
    )
  } catch (error) {
    next(error)
  }
}

/**
 * GET /sequences/:id/enrollments
 */
const getEnrollments = async (req, res, next) => {
  try {
    const { id } = req.params
    const { organizationId } = req.user
    const { page, limit, skip } = getPaginationParams(req.query)

    const sequence = await prisma.emailSequence.findFirst({ where: { id, organizationId } })
    if (!sequence) {
      return res.status(404).json(errorResponse('Sequence not found'))
    }

    const [enrollments, total] = await Promise.all([
      prisma.sequenceEnrollment.findMany({
        where: { sequenceId: id },
        include: {
          lead: { select: { id: true, firstName: true, lastName: true, email: true, company: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.sequenceEnrollment.count({ where: { sequenceId: id } }),
    ])

    return res.status(200).json(
      paginatedResponse(enrollments, getPaginationMeta({ page, limit, total }))
    )
  } catch (error) {
    next(error)
  }
}

/**
 * PUT /sequences/:id/steps/reorder
 * Body: { steps: [ { id: string, order: number }, ... ] }
 *
 * Updates the order field of multiple sequence steps in parallel.
 * Verifies that the sequence belongs to the authenticated user's organization.
 */
const reorderSteps = async (req, res, next) => {
  try {
    const { id } = req.params
    const { steps } = req.body
    const { organizationId } = req.user

    if (!Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json(errorResponse('steps must be a non-empty array'))
    }

    const sequence = await prisma.emailSequence.findFirst({ where: { id, organizationId } })
    if (!sequence) {
      return res.status(404).json(errorResponse('Sequence not found'))
    }

    await Promise.all(
      steps.map(({ id: stepId, order }) =>
        prisma.sequenceStep.update({
          where: { id: stepId },
          data: { order },
        })
      )
    )

    return res.status(200).json({ success: true, message: 'Steps reordered' })
  } catch (error) {
    next(error)
  }
}

module.exports = {
  getSequences,
  createSequence,
  getSequenceById,
  updateSequence,
  deleteSequence,
  addStep,
  updateStep,
  deleteStep,
  enrollLeads,
  getEnrollments,
  reorderSteps,
}
