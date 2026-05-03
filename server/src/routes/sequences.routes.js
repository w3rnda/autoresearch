const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const sequencesController = require('../controllers/sequences.controller');

router.use(authenticate);

// GET /sequences
router.get('/', sequencesController.getSequences);

// POST /sequences
router.post(
  '/',
  [body('name').trim().notEmpty().withMessage('Sequence name is required')],
  validate,
  sequencesController.createSequence
);

// GET /sequences/:id
router.get('/:id', sequencesController.getSequenceById);

// PUT /sequences/:id
router.put(
  '/:id',
  [body('name').trim().notEmpty().withMessage('Sequence name is required')],
  validate,
  sequencesController.updateSequence
);

// DELETE /sequences/:id
router.delete('/:id', sequencesController.deleteSequence);

// POST /sequences/:id/steps
router.post(
  '/:id/steps',
  [
    body('subject').trim().notEmpty().withMessage('Step subject is required'),
    body('body').trim().notEmpty().withMessage('Step body is required'),
    body('delayDays').isInt({ min: 0 }).toInt().withMessage('delayDays must be a non-negative integer'),
    body('order').optional().isInt({ min: 1 }).toInt(),
  ],
  validate,
  sequencesController.addStep
);

// PUT /sequences/:id/steps/reorder  — must be before /:id/steps/:stepId to avoid collision
router.put('/:id/steps/reorder', sequencesController.reorderSteps);

// PUT /sequences/:id/steps/:stepId
router.put(
  '/:id/steps/:stepId',
  [
    body('subject').optional().trim().notEmpty(),
    body('body').optional().trim().notEmpty(),
    body('delayDays').optional().isInt({ min: 0 }).toInt(),
    body('order').optional().isInt({ min: 1 }).toInt(),
  ],
  validate,
  sequencesController.updateStep
);

// DELETE /sequences/:id/steps/:stepId
router.delete('/:id/steps/:stepId', sequencesController.deleteStep);

// POST /sequences/:id/enroll
router.post(
  '/:id/enroll',
  [body('leadIds').isArray({ min: 1 }).withMessage('leadIds must be a non-empty array')],
  validate,
  sequencesController.enrollLeads
);

// GET /sequences/:id/enrollments
router.get('/:id/enrollments', sequencesController.getEnrollments);

module.exports = router;
