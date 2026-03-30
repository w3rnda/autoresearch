'use strict';

const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const { validate } = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const segmentsController = require('../controllers/segments.controller');

router.use(authenticate);

// GET /segments
router.get('/', segmentsController.getSegments);

// POST /segments/preview  — must be before /:id
router.post('/preview', segmentsController.previewSegment);

// POST /segments
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Segment name is required'),
    body('description').optional().trim(),
    body('filters').optional().isObject(),
  ],
  validate,
  segmentsController.createSegment
);

// GET /segments/:id
router.get('/:id', segmentsController.getSegmentById);

// GET /segments/:id/leads
router.get(
  '/:id/leads',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  segmentsController.getSegmentLeads
);

// PUT /segments/:id
router.put(
  '/:id',
  [
    body('name').optional().trim().notEmpty(),
    body('description').optional().trim(),
    body('filters').optional().isObject(),
  ],
  validate,
  segmentsController.updateSegment
);

// DELETE /segments/:id
router.delete('/:id', segmentsController.deleteSegment);

module.exports = router;
