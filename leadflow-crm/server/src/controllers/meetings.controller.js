'use strict'
const prisma = require('../prisma')
const { successResponse, errorResponse } = require('../utils/response.utils')

// GET /meetings - list meetings for org
const getMeetings = async (req, res, next) => {
  try {
    const { organizationId, id: userId, role } = req.user
    const { leadId } = req.query
    const where = {
      lead: { organizationId },
      ...(leadId && { leadId }),
      // Sales reps see only their meetings; admins see all
      ...(role === 'SALES_REP' && { userId }),
    }
    const meetings = await prisma.meeting.findMany({
      where,
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, company: true } },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    })
    return res.json(successResponse(meetings))
  } catch (err) { next(err) }
}

// POST /meetings
const createMeeting = async (req, res, next) => {
  try {
    const { leadId, scheduledAt, notes } = req.body
    const { organizationId, id: userId } = req.user
    const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId } })
    if (!lead) return res.status(404).json(errorResponse('Lead not found'))

    const meeting = await prisma.meeting.create({
      data: { leadId, userId, scheduledAt: new Date(scheduledAt), notes: notes || null },
    })
    // +50 score
    await prisma.lead.update({ where: { id: leadId }, data: { score: { increment: 50 } } })
    // notify
    await prisma.notification.create({
      data: {
        userId,
        message: `Meeting scheduled with ${lead.firstName} ${lead.lastName} on ${new Date(scheduledAt).toLocaleDateString()}`,
        type: 'SUCCESS',
      },
    })
    return res.status(201).json(successResponse(meeting, 'Meeting scheduled'))
  } catch (err) { next(err) }
}

// GET /meetings/:id
const getMeetingById = async (req, res, next) => {
  try {
    const { organizationId } = req.user
    const meeting = await prisma.meeting.findFirst({
      where: { id: req.params.id, lead: { organizationId } },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, company: true, email: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    })
    if (!meeting) return res.status(404).json(errorResponse('Meeting not found'))
    return res.json(successResponse(meeting))
  } catch (err) { next(err) }
}

// PUT /meetings/:id
const updateMeeting = async (req, res, next) => {
  try {
    const { organizationId } = req.user
    const existing = await prisma.meeting.findFirst({ where: { id: req.params.id, lead: { organizationId } } })
    if (!existing) return res.status(404).json(errorResponse('Meeting not found'))
    const { scheduledAt, notes } = req.body
    const updated = await prisma.meeting.update({
      where: { id: req.params.id },
      data: {
        ...(scheduledAt && { scheduledAt: new Date(scheduledAt) }),
        ...(notes !== undefined && { notes }),
      },
    })
    return res.json(successResponse(updated, 'Meeting updated'))
  } catch (err) { next(err) }
}

// DELETE /meetings/:id
const deleteMeeting = async (req, res, next) => {
  try {
    const { organizationId } = req.user
    const existing = await prisma.meeting.findFirst({ where: { id: req.params.id, lead: { organizationId } } })
    if (!existing) return res.status(404).json(errorResponse('Meeting not found'))
    await prisma.meeting.delete({ where: { id: req.params.id } })
    return res.json(successResponse(null, 'Meeting deleted'))
  } catch (err) { next(err) }
}

// GET /meetings/availability/:userId  (PUBLIC - no auth)
const getAvailability = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, name: true, email: true },
    })
    if (!user) return res.status(404).json(errorResponse('User not found'))
    // Generate available 30-min slots for the next 7 days: 09:00-17:00 Mon-Fri
    const slots = []
    const now = new Date()
    for (let d = 1; d <= 7; d++) {
      const day = new Date(now)
      day.setDate(now.getDate() + d)
      const dow = day.getDay()
      if (dow === 0 || dow === 6) continue // skip weekends
      for (let h = 9; h < 17; h++) {
        const slot = new Date(day)
        slot.setHours(h, 0, 0, 0)
        slots.push(slot.toISOString())
        const slot2 = new Date(day)
        slot2.setHours(h, 30, 0, 0)
        slots.push(slot2.toISOString())
      }
    }
    // Remove slots already booked by this user
    const booked = await prisma.meeting.findMany({
      where: { userId: req.params.userId, scheduledAt: { gte: now } },
      select: { scheduledAt: true },
    })
    const bookedSet = new Set(booked.map(m => m.scheduledAt.toISOString()))
    const available = slots.filter(s => !bookedSet.has(s))
    return res.json(successResponse({ user, slots: available }))
  } catch (err) { next(err) }
}

// POST /meetings/book  (PUBLIC - no auth)
const bookMeeting = async (req, res, next) => {
  try {
    const { userId, leadEmail, leadName, leadCompany, scheduledAt, notes } = req.body
    if (!userId || !leadEmail || !leadName || !scheduledAt) {
      return res.status(400).json(errorResponse('userId, leadEmail, leadName, and scheduledAt are required'))
    }
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return res.status(404).json(errorResponse('User not found'))

    // Find or create lead in user's org
    let lead = await prisma.lead.findFirst({ where: { email: leadEmail, organizationId: user.organizationId } })
    if (!lead) {
      const [firstName, ...rest] = leadName.trim().split(' ')
      lead = await prisma.lead.create({
        data: {
          firstName,
          lastName: rest.join(' ') || '(unknown)',
          email: leadEmail,
          company: leadCompany || null,
          source: 'API',
          status: 'WARM',
          score: 50,
          tags: [],
          organizationId: user.organizationId,
        },
      })
    } else {
      // +50 score for existing lead
      await prisma.lead.update({ where: { id: lead.id }, data: { score: { increment: 50 } } })
    }

    const meeting = await prisma.meeting.create({
      data: { leadId: lead.id, userId, scheduledAt: new Date(scheduledAt), notes: notes || null },
    })
    await prisma.notification.create({
      data: {
        userId,
        message: `${leadName} booked a meeting for ${new Date(scheduledAt).toLocaleDateString()}`,
        type: 'SUCCESS',
      },
    })
    return res.status(201).json(successResponse(meeting, 'Meeting booked successfully'))
  } catch (err) { next(err) }
}

module.exports = { getMeetings, createMeeting, getMeetingById, updateMeeting, deleteMeeting, getAvailability, bookMeeting }
