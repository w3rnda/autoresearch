const prisma = require('../prisma');
const { successResponse, errorResponse } = require('../utils/response.utils');

/**
 * Built-in pipeline templates.
 * Each template defines an ordered list of stage objects:
 *   { key, label, color, order, isWon?, isLost? }
 */
const PIPELINE_TEMPLATES = {
  STANDARD: {
    name: 'Standard Sales',
    description: 'New → Contacted → Meeting → Proposal → Close',
    stages: [
      { key: 'NEW',           label: 'New',           color: 'blue',   order: 0 },
      { key: 'CONTACTED',     label: 'Contacted',     color: 'amber',  order: 1 },
      { key: 'MEETING_BOOKED',label: 'Meeting Booked',color: 'orange', order: 2 },
      { key: 'PROPOSAL_SENT', label: 'Proposal Sent', color: 'purple', order: 3 },
      { key: 'CLOSED_WON',    label: 'Closed Won',    color: 'green',  order: 4, isWon: true },
      { key: 'CLOSED_LOST',   label: 'Closed Lost',   color: 'red',    order: 5, isLost: true },
    ],
  },
  CONTENT_DOWNLOAD: {
    name: 'Content Download',
    description: 'Ebook / whitepaper lead → nurture sequence → book a call → opportunity → close',
    stages: [
      { key: 'CAPTURED',    label: 'Captured',     color: 'blue',   order: 0 },
      { key: 'NURTURED',    label: 'In Nurture',   color: 'indigo', order: 1 },
      { key: 'CALL_BOOKED', label: 'Call Booked',  color: 'amber',  order: 2 },
      { key: 'OPPORTUNITY', label: 'Opportunity',  color: 'orange', order: 3 },
      { key: 'CLOSED_WON',  label: 'Closed Won',   color: 'green',  order: 4, isWon: true },
      { key: 'CLOSED_LOST', label: 'Closed Lost',  color: 'red',    order: 5, isLost: true },
    ],
  },
  EVENT_WEBINAR: {
    name: 'Event / Webinar',
    description: 'Registrant added → attendance tracked → no-shows follow-up → qualify → close',
    stages: [
      { key: 'REGISTERED',     label: 'Registered',     color: 'blue',   order: 0 },
      { key: 'ATTENDED',       label: 'Attended',        color: 'indigo', order: 1 },
      { key: 'NO_SHOW',        label: 'No Show',         color: 'yellow', order: 2 },
      { key: 'FOLLOW_UP_SENT', label: 'Follow-up Sent',  color: 'amber',  order: 3 },
      { key: 'SALES_QUALIFIED',label: 'Sales Qualified', color: 'orange', order: 4 },
      { key: 'CLOSED_WON',     label: 'Closed Won',      color: 'green',  order: 5, isWon: true },
      { key: 'CLOSED_LOST',    label: 'Closed Lost',     color: 'red',    order: 6, isLost: true },
    ],
  },
  FREE_TRIAL: {
    name: 'Free Trial',
    description: 'Trial signup → activation monitored → usage checked → convert or churn follow-up',
    stages: [
      { key: 'TRIAL_SIGNUP',   label: 'Trial Signup',    color: 'blue',   order: 0 },
      { key: 'ACTIVATED',      label: 'Activated',       color: 'indigo', order: 1 },
      { key: 'ACTIVE_USER',    label: 'Active User',     color: 'amber',  order: 2 },
      { key: 'CONVERTED',      label: 'Converted',       color: 'green',  order: 3, isWon: true },
      { key: 'CHURN_FOLLOWUP', label: 'Churn Follow-up', color: 'yellow', order: 4 },
      { key: 'CLOSED_LOST',    label: 'Churned',         color: 'red',    order: 5, isLost: true },
    ],
  },
  SOURCE_BASED: {
    name: 'Source-Based',
    description: 'Separate pipeline per channel — capture → verify → assign → contact → nurture → qualify → close',
    stages: [
      { key: 'CAPTURED',       label: 'Captured',        color: 'blue',   order: 0 },
      { key: 'VERIFIED',       label: 'Verified',        color: 'indigo', order: 1 },
      { key: 'ASSIGNED',       label: 'Assigned',        color: 'purple', order: 2 },
      { key: 'CONTACTED',      label: 'Contacted',       color: 'amber',  order: 3 },
      { key: 'NURTURED',       label: 'Nurtured',        color: 'orange', order: 4 },
      { key: 'SALES_QUALIFIED',label: 'Sales Qualified', color: 'teal',   order: 5 },
      { key: 'CLOSED_WON',     label: 'Closed',          color: 'green',  order: 6, isWon: true },
      { key: 'CLOSED_LOST',    label: 'Rejected',        color: 'red',    order: 7, isLost: true },
    ],
  },
};

/**
 * GET /pipelines/templates
 * Returns the list of available templates (no DB required).
 */
const getTemplates = async (req, res, next) => {
  try {
    const templates = Object.entries(PIPELINE_TEMPLATES).map(([type, tmpl]) => ({
      type,
      name: tmpl.name,
      description: tmpl.description,
      stageCount: tmpl.stages.length,
      stages: tmpl.stages,
    }));
    return res.status(200).json(successResponse(templates));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /pipelines
 * Returns all pipelines for the org, with deal counts.
 */
const getPipelines = async (req, res, next) => {
  try {
    const { organizationId } = req.user;

    const pipelines = await prisma.pipeline.findMany({
      where: { organizationId },
      include: { _count: { select: { deals: true } } },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    return res.status(200).json(successResponse(pipelines));
  } catch (error) {
    next(error);
  }
};

/**
 * POST /pipelines
 * Creates a new pipeline, optionally from a template type.
 * Body: { name?, description?, type?, stages? }
 */
const createPipeline = async (req, res, next) => {
  try {
    const { organizationId } = req.user;
    const { name, description, type, stages } = req.body;

    // Determine stages: custom > template > default STANDARD
    let resolvedStages = stages;
    const tmplType = type && PIPELINE_TEMPLATES[type] ? type : null;
    if (!resolvedStages && tmplType) {
      resolvedStages = PIPELINE_TEMPLATES[tmplType].stages;
    }
    if (!resolvedStages) {
      resolvedStages = PIPELINE_TEMPLATES.STANDARD.stages;
    }

    // Validate stages array
    if (!Array.isArray(resolvedStages) || resolvedStages.length < 2) {
      return res.status(400).json(errorResponse('Pipeline must have at least 2 stages'));
    }

    // First pipeline for this org becomes the default
    const existingCount = await prisma.pipeline.count({ where: { organizationId } });

    const resolvedName = name || (tmplType ? PIPELINE_TEMPLATES[tmplType].name : 'New Pipeline');
    const resolvedDesc = description ?? (tmplType ? PIPELINE_TEMPLATES[tmplType].description : null);

    const pipeline = await prisma.pipeline.create({
      data: {
        name: resolvedName,
        description: resolvedDesc,
        type: tmplType || 'STANDARD',
        stages: resolvedStages,
        organizationId,
        isDefault: existingCount === 0,
      },
    });

    return res.status(201).json(successResponse(pipeline, 'Pipeline created'));
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /pipelines/:id
 * Updates name or description of a pipeline.
 */
const updatePipeline = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;
    const { name, description } = req.body;

    const existing = await prisma.pipeline.findFirst({ where: { id, organizationId } });
    if (!existing) {
      return res.status(404).json(errorResponse('Pipeline not found'));
    }

    const updated = await prisma.pipeline.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
      },
    });

    return res.status(200).json(successResponse(updated, 'Pipeline updated'));
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /pipelines/:id/default
 * Sets a pipeline as the default for the org.
 */
const setDefaultPipeline = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;

    const existing = await prisma.pipeline.findFirst({ where: { id, organizationId } });
    if (!existing) {
      return res.status(404).json(errorResponse('Pipeline not found'));
    }

    // Unset all defaults then set this one
    await prisma.$transaction([
      prisma.pipeline.updateMany({ where: { organizationId }, data: { isDefault: false } }),
      prisma.pipeline.update({ where: { id }, data: { isDefault: true } }),
    ]);

    return res.status(200).json(successResponse(null, 'Default pipeline updated'));
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /pipelines/:id
 * Deletes a pipeline. Cannot delete the last one.
 */
const deletePipeline = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;

    const existing = await prisma.pipeline.findFirst({ where: { id, organizationId } });
    if (!existing) {
      return res.status(404).json(errorResponse('Pipeline not found'));
    }

    const count = await prisma.pipeline.count({ where: { organizationId } });
    if (count <= 1) {
      return res.status(400).json(errorResponse('Cannot delete the last pipeline'));
    }

    await prisma.pipeline.delete({ where: { id } });

    // Promote the next oldest pipeline to default if needed
    if (existing.isDefault) {
      const nextPipeline = await prisma.pipeline.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
      });
      if (nextPipeline) {
        await prisma.pipeline.update({ where: { id: nextPipeline.id }, data: { isDefault: true } });
      }
    }

    return res.status(200).json(successResponse(null, 'Pipeline deleted'));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTemplates,
  getPipelines,
  createPipeline,
  updatePipeline,
  setDefaultPipeline,
  deletePipeline,
  PIPELINE_TEMPLATES,
};
