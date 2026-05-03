'use strict'
const router = require('express').Router()
const { trackOpen, trackClick } = require('../controllers/tracking.controller')

router.get('/open/:eventId', trackOpen)
router.get('/click/:eventId', trackClick)

module.exports = router
