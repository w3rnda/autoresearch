const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const pipelineController = require('../controllers/pipeline.controller');

router.use(authenticate);

// GET /pipeline?pipelineId=xxx&source=WEBSITE
router.get('/', pipelineController.getDeals);

// POST /pipeline
router.post(
  '/',
  [
    body('leadId').notEmpty().withMessage('Lead ID is required'),
    body('pipelineId').optional().isString(),
    body('stage').optional().isString().trim(),
    body('value').optional().isFloat({ min: 0 }).toFloat(),
    body('probability').optional().isFloat({ min: 0, max: 100 }).toFloat(),
  ],
  validate,
  pipelineController.createDeal
);

// PUT /pipeline/:id
router.put(
  '/:id',
  [
    body('stage').optional().isString().trim(),
    body('value').optional().isFloat({ min: 0 }).toFloat(),
    body('probability').optional().isFloat({ min: 0, max: 100 }).toFloat(),
  ],
  validate,
  pipelineController.updateDeal
);

// DELETE /pipeline/:id
router.delete('/:id', pipelineController.deleteDeal);

module.exports = router;
