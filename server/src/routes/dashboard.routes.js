'use strict'
const router = require('express').Router()
const { authenticate } = require('../middleware/auth.middleware')
const { getStats } = require('../controllers/dashboard.controller')

router.use(authenticate)
router.get('/stats', getStats)

module.exports = router
