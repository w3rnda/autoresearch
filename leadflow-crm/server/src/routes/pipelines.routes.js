const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const pipelinesController = require('../controllers/pipelines.controller');

router.use(authenticate);

// GET /pipelines/templates — must be before /:id
router.get('/templates', pipelinesController.getTemplates);

// GET /pipelines
router.get('/', pipelinesController.getPipelines);

// POST /pipelines
router.post(
  '/',
  [
    body('name').optional().isString().trim().notEmpty(),
    body('type').optional().isIn(['STANDARD', 'CONTENT_DOWNLOAD', 'FREE_TRIAL', 'EVENT_WEBINAR', 'SOURCE_BASED']),
    body('description').optional().isString(),
  ],
  validate,
  pipelinesController.createPipeline
);

// PUT /pipelines/:id
router.put(
  '/:id',
  [
    body('name').optional().isString().trim().notEmpty(),
    body('description').optional().isString(),
  ],
  validate,
  pipelinesController.updatePipeline
);

// PUT /pipelines/:id/default
router.put('/:id/default', pipelinesController.setDefaultPipeline);

// DELETE /pipelines/:id
router.delete('/:id', pipelinesController.deletePipeline);

module.exports = router;
