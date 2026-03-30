'use strict';

const { Router } = require('express');
const { body, param } = require('express-validator');
const { authenticate } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const {
  getOrCreateWorkspace,
  updateStage,
  updateNotes,
  upsertSummary,
  uploadDocument,
  updateDocument,
  deleteDocument,
  createPayment,
  updatePayment,
  deletePayment,
} = require('../controllers/workspace.controller');

const router = Router();
router.use(authenticate);

// ─── Workspace ────────────────────────────────────────────────────────────────

// GET  /workspace/lead/:leadId  — get or auto-create workspace for a lead
router.get('/lead/:leadId', param('leadId').notEmpty(), validate, getOrCreateWorkspace);

// PUT  /workspace/:id/stage
router.put(
  '/:id/stage',
  [
    param('id').notEmpty(),
    body('stage').notEmpty().withMessage('stage is required'),
  ],
  validate,
  updateStage
);

// PUT  /workspace/:id/notes
router.put('/:id/notes', [param('id').notEmpty()], validate, updateNotes);

// ─── Deal Summary ─────────────────────────────────────────────────────────────

// PUT  /workspace/:id/summary
router.put('/:id/summary', [param('id').notEmpty()], validate, upsertSummary);

// ─── Documents ────────────────────────────────────────────────────────────────

// POST   /workspace/:id/documents  (multipart)
router.post('/:id/documents', [param('id').notEmpty()], validate, uploadDocument);

// PUT    /workspace/:id/documents/:docId
router.put(
  '/:id/documents/:docId',
  [param('id').notEmpty(), param('docId').notEmpty()],
  validate,
  updateDocument
);

// DELETE /workspace/:id/documents/:docId
router.delete(
  '/:id/documents/:docId',
  [param('id').notEmpty(), param('docId').notEmpty()],
  validate,
  deleteDocument
);

// ─── Payments ─────────────────────────────────────────────────────────────────

// POST   /workspace/:id/payments
router.post(
  '/:id/payments',
  [
    param('id').notEmpty(),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  ],
  validate,
  createPayment
);

// PUT    /workspace/:id/payments/:paymentId
router.put(
  '/:id/payments/:paymentId',
  [param('id').notEmpty(), param('paymentId').notEmpty()],
  validate,
  updatePayment
);

// DELETE /workspace/:id/payments/:paymentId
router.delete(
  '/:id/payments/:paymentId',
  [param('id').notEmpty(), param('paymentId').notEmpty()],
  validate,
  deletePayment
);

module.exports = router;
