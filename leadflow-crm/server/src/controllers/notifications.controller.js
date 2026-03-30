'use strict'
const prisma = require('../prisma')
const { successResponse, errorResponse } = require('../utils/response.utils')

const getNotifications = async (req, res, next) => {
  try {
    const { id: userId } = req.user
    const { read } = req.query
    const where = { userId, ...(read !== undefined && { read: read === 'true' }) }
    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const unreadCount = await prisma.notification.count({ where: { userId, read: false } })
    return res.json(successResponse({ notifications, unreadCount }))
  } catch (err) { next(err) }
}

const markRead = async (req, res, next) => {
  try {
    const { id: userId } = req.user
    const notif = await prisma.notification.findFirst({ where: { id: req.params.id, userId } })
    if (!notif) return res.status(404).json(errorResponse('Notification not found'))
    const updated = await prisma.notification.update({ where: { id: req.params.id }, data: { read: true } })
    return res.json(successResponse(updated))
  } catch (err) { next(err) }
}

const markAllRead = async (req, res, next) => {
  try {
    const { id: userId } = req.user
    await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } })
    return res.json(successResponse(null, 'All notifications marked as read'))
  } catch (err) { next(err) }
}

module.exports = { getNotifications, markRead, markAllRead }
