'use strict';

const { Router } = require('express');
const { body, param, query } = require('express-validator');
const { authenticate } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const {
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  activateWorkspace,
  listEntities,
  getEntity,
  promoteEntity,
  triggerSourcing,
  listSourcingRuns,
  ingestEntities,
  scoreWorkspaceEntities,
  scoreEntity,
  findEntityEmails,
  scanWorkspace,
  detectWorkspaceSignals,
  listSignals,
  generateEntityOutreach,
} = require('../controllers/gtm-workspace.controller');

const router = Router();
router.use(authenticate);

// ─── GTM Workspaces ──────────────────────────────────────────────────────────

// GET    /gtm/workspaces
router.get('/workspaces', listWorkspaces);

// GET    /gtm/workspaces/:id
router.get('/workspaces/:id', [param('id').notEmpty()], validate, getWorkspace);

// POST   /gtm/workspaces
router.post(
  '/workspaces',
  [body('name').notEmpty().withMessage('Name is required')],
  validate,
  createWorkspace
);

// PUT    /gtm/workspaces/:id
router.put(
  '/workspaces/:id',
  [param('id').notEmpty()],
  validate,
  updateWorkspace
);

// DELETE /gtm/workspaces/:id
router.delete(
  '/workspaces/:id',
  [param('id').notEmpty()],
  validate,
  deleteWorkspace
);

// ─── Workspace Activation & Sourcing ─────────────────────────────────────────

// POST   /gtm/workspaces/:id/activate
router.post(
  '/workspaces/:id/activate',
  [param('id').notEmpty()],
  validate,
  activateWorkspace
);

// POST   /gtm/workspaces/:id/source
router.post(
  '/workspaces/:id/source',
  [
    param('id').notEmpty(),
    body('query').notEmpty().withMessage('Search query is required'),
  ],
  validate,
  triggerSourcing
);

// POST   /gtm/workspaces/:id/ingest — bypass Apify, accept pre-scraped entities
router.post(
  '/workspaces/:id/ingest',
  [param('id').notEmpty(), body('entities').isArray({ min: 1 })],
  validate,
  ingestEntities
);

// GET    /gtm/workspaces/:id/runs
router.get(
  '/workspaces/:id/runs',
  [param('id').notEmpty()],
  validate,
  listSourcingRuns
);

// ─── GTM Entities ────────────────────────────────────────────────────────────

// GET    /gtm/workspaces/:id/entities
router.get(
  '/workspaces/:id/entities',
  [param('id').notEmpty()],
  validate,
  listEntities
);

// GET    /gtm/workspaces/:id/entities/:entityId
router.get(
  '/workspaces/:id/entities/:entityId',
  [param('id').notEmpty(), param('entityId').notEmpty()],
  validate,
  getEntity
);

// POST   /gtm/workspaces/:id/entities/:entityId/promote
router.post(
  '/workspaces/:id/entities/:entityId/promote',
  [param('id').notEmpty(), param('entityId').notEmpty()],
  validate,
  promoteEntity
);

// ─── AI Scoring ──────────────────────────────────────────────────────────────

// POST   /gtm/workspaces/:id/score — score all ENRICHED/NEW entities
router.post(
  '/workspaces/:id/score',
  [param('id').notEmpty(), body('autoPromote').optional().isBoolean()],
  validate,
  scoreWorkspaceEntities
);

// POST   /gtm/workspaces/:id/entities/:entityId/score — score single entity
router.post(
  '/workspaces/:id/entities/:entityId/score',
  [
    param('id').notEmpty(),
    param('entityId').notEmpty(),
    body('autoPromote').optional().isBoolean(),
  ],
  validate,
  scoreEntity
);

// ─── Email Finder ────────────────────────────────────────────────────────────

// POST   /gtm/workspaces/:id/entities/:entityId/find-emails — Hunter.io lookup
router.post(
  '/workspaces/:id/entities/:entityId/find-emails',
  [param('id').notEmpty(), param('entityId').notEmpty()],
  validate,
  findEntityEmails
);

// ─── Signal Engine ───────────────────────────────────────────────────────────

// POST   /gtm/workspaces/:id/scan — full periodic scan (re-source + snapshot + detect)
router.post(
  '/workspaces/:id/scan',
  [param('id').notEmpty()],
  validate,
  scanWorkspace
);

// POST   /gtm/workspaces/:id/detect-signals — snapshot + detect (no re-source)
router.post(
  '/workspaces/:id/detect-signals',
  [param('id').notEmpty()],
  validate,
  detectWorkspaceSignals
);

// GET    /gtm/workspaces/:id/signals — list detected intent signals
router.get(
  '/workspaces/:id/signals',
  [param('id').notEmpty()],
  validate,
  listSignals
);

// POST   /gtm/workspaces/:id/entities/:entityId/outreach — signal-driven outreach copy
router.post(
  '/workspaces/:id/entities/:entityId/outreach',
  [param('id').notEmpty(), param('entityId').notEmpty()],
  validate,
  generateEntityOutreach
);

module.exports = router;
