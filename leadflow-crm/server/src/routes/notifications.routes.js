'use strict'
const router = require('express').Router()
const { authenticate } = require('../middleware/auth.middleware')
const { getNotifications, markRead, markAllRead } = require('../controllers/notifications.controller')

router.use(authenticate)
router.get('/', getNotifications)
router.put('/read-all', markAllRead)
router.put('/:id/read', markRead)

module.exports = router
