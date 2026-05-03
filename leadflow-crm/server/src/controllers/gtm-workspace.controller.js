'use strict';

const prisma = require('../prisma');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response.utils');
const { sourcingQueue } = require('../queues');
const { deduplicateAndInsert } = require('../services/gtm/dedup.service');

// ─── List GTM Workspaces ─────────────────────────────────────────────────────

const listWorkspaces = async (req, res, next) => {
  try {
    const { organizationId } = req.user;
    const { status, page = 1, limit = 20 } = req.query;

    const where = { organizationId };
    if (status) where.status = status;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10);

    const [workspaces, total] = await Promise.all([
      prisma.gtmWorkspace.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: { select: { entities: true, sourcingRuns: true, signals: true } },
        },
      }),
      prisma.gtmWorkspace.count({ where }),
    ]);

    return res.status(200).json(paginatedResponse(workspaces, {
      total,
      page: parseInt(page, 10),
      limit: take,
      totalPages: Math.ceil(total / take),
    }));
  } catch (error) {
    next(error);
  }
};

// ─── Get Single GTM Workspace ────────────────────────────────────────────────

const getWorkspace = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;

    const workspace = await prisma.gtmWorkspace.findFirst({
      where: { id, organizationId },
      include: {
        _count: { select: { entities: true, sourcingRuns: true, signals: true } },
        sourcingRuns: {
          orderBy: { startedAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!workspace) {
      return res.status(404).json(errorResponse('GTM workspace not found'));
    }

    // Compute entity status breakdown for dashboard stat cards
    const statusGroups = await prisma.gtmEntity.groupBy({
      by: ['status'],
      where: { workspaceId: id },
      _count: { id: true },
    });

    const entityStatusBreakdown = statusGroups.reduce(
      (acc, row) => ({ ...acc, [row.status]: row._count.id }),
      {}
    );

    return res.status(200).json(successResponse({ ...workspace, entityStatusBreakdown }));
  } catch (error) {
    next(error);
  }
};

// ─── Create GTM Workspace ────────────────────────────────────────────────────

const createWorkspace = async (req, res, next) => {
  try {
    const { organizationId } = req.user;
    const {
      name,
      description,
      icpDefinition,
      icpNatural,
      sourcingConfig,
      enrichConfig,
      scoringConfig,
      autoSequenceId,
      autoPipelineId,
      autoPromoteThreshold,
    } = req.body;

    const workspace = await prisma.gtmWorkspace.create({
      data: {
        name,
        description: description || null,
        organizationId,
        icpDefinition: icpDefinition || null,
        icpNatural: icpNatural || null,
        sourcingConfig: sourcingConfig || null,
        enrichConfig: enrichConfig || null,
        scoringConfig: scoringConfig || null,
        autoSequenceId: autoSequenceId || null,
        autoPipelineId: autoPipelineId || null,
        autoPromoteThreshold: autoPromoteThreshold ? parseInt(autoPromoteThreshold, 10) : null,
      },
      include: {
        _count: { select: { entities: true, sourcingRuns: true, signals: true } },
      },
    });

    return res.status(201).json(successResponse(workspace, 'GTM workspace created'));
  } catch (error) {
    next(error);
  }
};

// ─── Update GTM Workspace ────────────────────────────────────────────────────

const updateWorkspace = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;
    const {
      name,
      description,
      status,
      icpDefinition,
      icpNatural,
      sourcingConfig,
      enrichConfig,
      scoringConfig,
      autoSequenceId,
      autoPipelineId,
      autoPromoteThreshold,
    } = req.body;

    const existing = await prisma.gtmWorkspace.findFirst({ where: { id, organizationId } });
    if (!existing) {
      return res.status(404).json(errorResponse('GTM workspace not found'));
    }

    const data = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (status !== undefined) data.status = status;
    if (icpDefinition !== undefined) data.icpDefinition = icpDefinition;
    if (icpNatural !== undefined) data.icpNatural = icpNatural;
    if (sourcingConfig !== undefined) data.sourcingConfig = sourcingConfig;
    if (enrichConfig !== undefined) data.enrichConfig = enrichConfig;
    if (scoringConfig !== undefined) data.scoringConfig = scoringConfig;
    if (autoSequenceId !== undefined) data.autoSequenceId = autoSequenceId;
    if (autoPipelineId !== undefined) data.autoPipelineId = autoPipelineId;
    if (autoPromoteThreshold !== undefined) {
      data.autoPromoteThreshold = autoPromoteThreshold ? parseInt(autoPromoteThreshold, 10) : null;
    }

    const workspace = await prisma.gtmWorkspace.update({
      where: { id },
      data,
      include: {
        _count: { select: { entities: true, sourcingRuns: true, signals: true } },
      },
    });

    return res.status(200).json(successResponse(workspace));
  } catch (error) {
    next(error);
  }
};

// ─── Delete GTM Workspace ────────────────────────────────────────────────────

const deleteWorkspace = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;

    const existing = await prisma.gtmWorkspace.findFirst({ where: { id, organizationId } });
    if (!existing) {
      return res.status(404).json(errorResponse('GTM workspace not found'));
    }

    await prisma.gtmWorkspace.delete({ where: { id } });

    return res.status(200).json(successResponse(null, 'GTM workspace deleted'));
  } catch (error) {
    next(error);
  }
};

// ─── Activate Workspace (start sourcing) ─────────────────────────────────────

const activateWorkspace = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;

    const workspace = await prisma.gtmWorkspace.findFirst({ where: { id, organizationId } });
    if (!workspace) {
      return res.status(404).json(errorResponse('GTM workspace not found'));
    }

    if (workspace.status === 'ACTIVE') {
      return res.status(400).json(errorResponse('Workspace is already active'));
    }

    // Validate workspace has minimum configuration
    if (!workspace.sourcingConfig) {
      return res.status(400).json(errorResponse('Sourcing configuration is required before activation'));
    }

    // Update status to ACTIVE
    const updated = await prisma.gtmWorkspace.update({
      where: { id },
      data: { status: 'ACTIVE' },
      include: {
        _count: { select: { entities: true, sourcingRuns: true, signals: true } },
      },
    });

    // Trigger initial sourcing run
    const sourcingConfig = workspace.sourcingConfig;
    const queries = sourcingConfig.queries || [];

    for (const query of queries) {
      await sourcingQueue.add(
        'google-maps-search',
        {
          workspaceId: id,
          organizationId,
          query,
          source: 'GOOGLE_MAPS',
        },
        { jobId: `sourcing-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
      );
    }

    return res.status(200).json(successResponse(updated, `Workspace activated. ${queries.length} sourcing job(s) queued.`));
  } catch (error) {
    next(error);
  }
};

// ─── List Entities in a Workspace ────────────────────────────────────────────

const listEntities = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;
    const { status, page = 1, limit = 50, sortBy = 'gtmScore', sortDir = 'desc' } = req.query;

    const workspace = await prisma.gtmWorkspace.findFirst({ where: { id, organizationId } });
    if (!workspace) {
      return res.status(404).json(errorResponse('GTM workspace not found'));
    }

    const where = { workspaceId: id };
    if (status) where.status = status;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10);

    const orderBy = {};
    orderBy[sortBy] = sortDir;

    const [entities, total] = await Promise.all([
      prisma.gtmEntity.findMany({
        where,
        skip,
        take,
        orderBy,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          website: true,
          domain: true,
          source: true,
          status: true,
          gtmScore: true,
          scoreBreakdown: true,
          outreachAngles: true,
          createdAt: true,
          updatedAt: true,
          leadId: true,
          _count: { select: { signals: true, enrichmentLogs: true } },
        },
      }),
      prisma.gtmEntity.count({ where }),
    ]);

    return res.status(200).json(paginatedResponse(entities, {
      total,
      page: parseInt(page, 10),
      limit: take,
      totalPages: Math.ceil(total / take),
    }));
  } catch (error) {
    next(error);
  }
};

// ─── Get Single Entity Detail ────────────────────────────────────────────────

const getEntity = async (req, res, next) => {
  try {
    const { id, entityId } = req.params;
    const { organizationId } = req.user;

    const workspace = await prisma.gtmWorkspace.findFirst({ where: { id, organizationId } });
    if (!workspace) {
      return res.status(404).json(errorResponse('GTM workspace not found'));
    }

    const entity = await prisma.gtmEntity.findFirst({
      where: { id: entityId, workspaceId: id },
      include: {
        signals: { orderBy: { detectedAt: 'desc' }, take: 20 },
        enrichmentLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
        snapshots: { orderBy: { capturedAt: 'desc' }, take: 5 },
      },
    });

    if (!entity) {
      return res.status(404).json(errorResponse('Entity not found'));
    }

    return res.status(200).json(successResponse(entity));
  } catch (error) {
    next(error);
  }
};

// ─── Promote Entity to Lead ──────────────────────────────────────────────────

const promoteEntity = async (req, res, next) => {
  try {
    const { id, entityId } = req.params;
    const { organizationId } = req.user;

    const workspace = await prisma.gtmWorkspace.findFirst({ where: { id, organizationId } });
    if (!workspace) {
      return res.status(404).json(errorResponse('GTM workspace not found'));
    }

    const entity = await prisma.gtmEntity.findFirst({
      where: { id: entityId, workspaceId: id },
    });

    if (!entity) {
      return res.status(404).json(errorResponse('Entity not found'));
    }

    if (entity.status === 'PROMOTED') {
      return res.status(400).json(errorResponse('Entity is already promoted'));
    }

    // Create a Lead from this entity
    const enriched = entity.enrichedData || {};
    const raw = entity.rawData || {};

    // Email is required on Lead — fall back to a placeholder using the domain
    // (downstream enrichment / manual research will replace this)
    const fallbackEmail = entity.domain
      ? `info@${entity.domain}`
      : `${entity.id}@gtm-pending.local`;

    const lead = await prisma.lead.create({
      data: {
        organizationId,
        firstName: entity.name.split(' ')[0] || entity.name,
        lastName: entity.name.split(' ').slice(1).join(' ') || '-',
        email: entity.email || enriched.email || fallbackEmail,
        phone: entity.phone || enriched.phone || null,
        company: raw.title || raw.company || entity.name,
        website: entity.website || null,
        city: raw.city || raw.address?.city || null,
        country: raw.country || null,
        category: raw.categoryName || raw.category || raw.type || null,
        industry: raw.industry || null,
        source: 'GTM_ENGINE',
        score: entity.gtmScore || 0,
        status: 'COLD',
        customFields: {
          gtmEntityId: entity.id,
          gtmWorkspaceId: id,
          scoreBreakdown: entity.scoreBreakdown,
          outreachAngles: entity.outreachAngles,
          rawData: entity.rawData,
          enrichedData: entity.enrichedData,
          rating: raw.totalScore || null,
          reviewsCount: raw.reviewsCount || null,
          placeId: entity.placeId,
        },
      },
    });

    // Update entity with lead link and status
    await prisma.gtmEntity.update({
      where: { id: entityId },
      data: { status: 'PROMOTED', leadId: lead.id },
    });

    return res.status(201).json(successResponse(lead, 'Entity promoted to lead'));
  } catch (error) {
    next(error);
  }
};

// ─── Trigger Manual Sourcing Run ─────────────────────────────────────────────

const triggerSourcing = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;
    const { query, source = 'GOOGLE_MAPS', maxResults = 100 } = req.body;

    const workspace = await prisma.gtmWorkspace.findFirst({ where: { id, organizationId } });
    if (!workspace) {
      return res.status(404).json(errorResponse('GTM workspace not found'));
    }

    if (!query) {
      return res.status(400).json(errorResponse('Query is required'));
    }

    // Create sourcing run record for tracking
    const sourcingRun = await prisma.sourcingRun.create({
      data: {
        workspaceId: id,
        source,
        query,
        config: { maxResults },
        status: 'RUNNING',
      },
    });

    await sourcingQueue.add(
      'google-maps-search',
      {
        workspaceId: id,
        sourcingRunId: sourcingRun.id,
        organizationId,
        query,
        source,
        maxResults,
      },
      { jobId: `sourcing-${sourcingRun.id}` }
    );

    return res.status(202).json(successResponse(sourcingRun, 'Sourcing job queued'));
  } catch (error) {
    next(error);
  }
};

// ─── List Sourcing Runs ──────────────────────────────────────────────────────

const listSourcingRuns = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;
    const { page = 1, limit = 20 } = req.query;

    const workspace = await prisma.gtmWorkspace.findFirst({ where: { id, organizationId } });
    if (!workspace) {
      return res.status(404).json(errorResponse('GTM workspace not found'));
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10);

    const [runs, total] = await Promise.all([
      prisma.sourcingRun.findMany({
        where: { workspaceId: id },
        skip,
        take,
        orderBy: { startedAt: 'desc' },
      }),
      prisma.sourcingRun.count({ where: { workspaceId: id } }),
    ]);

    return res.status(200).json(paginatedResponse(runs, {
      total,
      page: parseInt(page, 10),
      limit: take,
      totalPages: Math.ceil(total / take),
    }));
  } catch (error) {
    next(error);
  }
};

// ─── Ingest Pre-scraped Entities ─────────────────────────────────────────────
// Bypasses Apify by accepting raw entities directly (e.g. from MCP scrapes)

const ingestEntities = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;
    const { entities, query, source = 'GOOGLE_MAPS' } = req.body;

    const workspace = await prisma.gtmWorkspace.findFirst({ where: { id, organizationId } });
    if (!workspace) {
      return res.status(404).json(errorResponse('GTM workspace not found'));
    }

    if (!Array.isArray(entities) || entities.length === 0) {
      return res.status(400).json(errorResponse('entities array is required and must not be empty'));
    }

    // Create sourcing run record
    const sourcingRun = await prisma.sourcingRun.create({
      data: {
        workspaceId: id,
        source,
        query: query || 'manual-ingest',
        config: { ingestedCount: entities.length },
        status: 'RUNNING',
      },
    });

    // Run dedup and insert
    const result = await deduplicateAndInsert(id, entities, source, sourcingRun.id);

    // Mark run complete
    await prisma.sourcingRun.update({
      where: { id: sourcingRun.id },
      data: {
        status: 'COMPLETED',
        entitiesFound: result.total,
        entitiesNew: result.created,
        entitiesDuplicate: result.duplicates,
        completedAt: new Date(),
      },
    });

    return res.status(201).json(successResponse({
      sourcingRunId: sourcingRun.id,
      ...result,
    }, `Ingested ${result.created} new entities (${result.duplicates} duplicates)`));
  } catch (error) {
    next(error);
  }
};

module.exports = {
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
};
