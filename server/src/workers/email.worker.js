'use strict'
const prisma = require('../prisma')

/**
 * Process the next pending step for a sequence enrollment.
 * Called after enrollment or after a step delay expires.
 *
 * @param {string} enrollmentId - SequenceEnrollment.id
 */
async function processEnrollmentStep(enrollmentId) {
  try {
    const enrollment = await prisma.sequenceEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        lead: true,
        sequence: { include: { steps: { orderBy: { order: 'asc' } } } },
      },
    })

    if (!enrollment || enrollment.status !== 'ACTIVE') return

    const { steps } = enrollment.sequence
    const stepIndex = enrollment.currentStep

    if (stepIndex >= steps.length) {
      // All steps done
      await prisma.sequenceEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'COMPLETED' },
      })
      return
    }

    const step = steps[stepIndex]
    const lead = enrollment.lead

    // Replace template placeholders
    const body = step.body
      .replace(/\{\{first_name\}\}/gi, lead.firstName)
      .replace(/\{\{last_name\}\}/gi, lead.lastName)
      .replace(/\{\{company\}\}/gi, lead.company || '')
      .replace(/\{\{email\}\}/gi, lead.email)

    // Mock send: log to console (replace with real email provider in production)
    const trackId = Buffer.from(lead.id).toString('base64')
    console.log(`[EMAIL WORKER] Sending step ${step.order} to ${lead.email}`)
    console.log(`  Subject: ${step.subject}`)
    console.log(`  Body preview: ${body.slice(0, 100)}`)
    console.log(`  Open pixel: GET /api/v1/track/open/${trackId}`)

    // Record email event
    await prisma.emailEvent.create({
      data: { leadId: lead.id, type: 'SENT', metadata: { stepId: step.id, subject: step.subject } },
    })

    // Advance enrollment to next step
    await prisma.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: { currentStep: stepIndex + 1 },
    })

    // Schedule next step after delayDays
    const nextStep = steps[stepIndex + 1]
    if (nextStep) {
      const delayMs = process.env.NODE_ENV === 'development'
        ? 5000
        : (nextStep.delayDays || 0) * 24 * 60 * 60 * 1000
      setTimeout(() => processEnrollmentStep(enrollmentId), delayMs)
    } else {
      // Mark complete after last step is sent
      await prisma.sequenceEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'COMPLETED' },
      })
    }
  } catch (err) {
    console.error('[EMAIL WORKER ERROR]', err.message)
  }
}

/**
 * Enroll a lead into a sequence and kick off the first step.
 *
 * @param {string} enrollmentId - SequenceEnrollment.id
 */
function scheduleEnrollment(enrollmentId) {
  // Start first step after 1 second to allow the HTTP response to complete
  setTimeout(() => processEnrollmentStep(enrollmentId), 1000)
}

/**
 * Called at server startup. No-op for in-memory queue (no external connection needed).
 * Stub is here so server.js can call it uniformly regardless of queue implementation.
 */
async function initializeWorkers() {
  console.log('[EMAIL WORKER] In-memory queue initialized (setTimeout-based)')
}

module.exports = { scheduleEnrollment, processEnrollmentStep, initializeWorkers }
