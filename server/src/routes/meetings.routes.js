'use strict'
const router = require('express').Router()
const { body, query } = require('express-validator')
const { validate } = require('../middleware/validate.middleware')
const { authenticate } = require('../middleware/auth.middleware')
const {
  getMeetings,
  createMeeting,
  getMeetingById,
  updateMeeting,
  deleteMeeting,
  getAvailability,
  bookMeeting,
} = require('../controllers/meetings.controller')

// Public routes (no auth)
router.get('/availability/:userId', getAvailability)
router.post(
  '/book',
  [
    body('userId').notEmpty().withMessage('User ID is required'),
    body('scheduledAt').isISO8601().withMessage('scheduledAt must be a valid ISO date'),
    body('leadName').trim().notEmpty().withMessage('leadName is required'),
    body('leadEmail').isEmail().normalizeEmail().withMessage('Valid leadEmail is required'),
    body('leadCompany').optional().trim(),
    body('notes').optional().trim(),
  ],
  validate,
  bookMeeting
)

// Protected routes
router.use(authenticate)
router.get('/', [query('leadId').optional().notEmpty()], validate, getMeetings)
router.post(
  '/',
  [
    body('leadId').notEmpty().withMessage('Lead ID is required'),
    body('scheduledAt').isISO8601().withMessage('scheduledAt must be a valid ISO date'),
    body('notes').optional().trim(),
  ],
  validate,
  createMeeting
)
router.get('/:id', getMeetingById)
router.put(
  '/:id',
  [body('scheduledAt').optional().isISO8601(), body('notes').optional().trim()],
  validate,
  updateMeeting
)
router.delete('/:id', deleteMeeting)

module.exports = router
