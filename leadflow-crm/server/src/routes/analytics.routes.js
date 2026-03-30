'use strict';

const express = require('express');
const router = express.Router();
const { query } = require('express-validator');
const { validate } = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const analyticsController = require('../controllers/analytics.controller');

router.use(authenticate);

const daysValidation = query('days').optional().isInt({ min: 1, max: 365 }).toInt();

// GET /analytics/funnel — pipeline stage funnel with conversion rates
router.get('/funnel', [daysValidation], validate, analyticsController.getFunnel);

// GET /analytics/velocity — avg days per stage
router.get('/velocity', [daysValidation], validate, analyticsController.getVelocity);

// GET /analytics/aging — stale deals exceeding threshold days
router.get(
  '/aging',
  [
    daysValidation,
    query('threshold').optional().isInt({ min: 1, max: 365 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  analyticsController.getAging
);

// GET /analytics/overview — win rate, avg deal size, pipeline value summary
router.get('/overview', [daysValidation], validate, analyticsController.getOverview);

module.exports = router;
