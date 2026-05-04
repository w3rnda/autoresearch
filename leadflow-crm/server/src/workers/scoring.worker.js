'use strict';

const { createWorker, QUEUE_NAMES } = require('../queues/connection');
const { scoreEntity } = require('../services/gtm/scoring.service');
const prisma = require('../prisma');

/**
 * Scoring Worker
 *
 * Job types:
 *   - score-entity: Score a single entity by ID
 *   - score-batch: Score all ENRICHED entities in a workspace
 *   - score-and-promote: Score then auto-promote if above threshold
 */
async function processScoringJob(job) {
  const { workspaceId, entityId, autoPromote = false } = job.data;

  if (job.name === 'score-batch') {
    return processBatch(workspaceId, autoPromote, job);
  }

  if (job.name === 'score-entity' || job.name === 'score-and-promote') {
    return processSingle(entityId, autoPromote || job.name === 'score-and-promote', job);
  }

  throw new Error(`Unknown scoring job type: ${job.name}`);
}

async function processSingle(entityId, autoPromote, job) {
  const entity = await prisma.gtmEntity.findUnique({
    where: { id: entityId },
    include: { workspace: true },
  });

  if (!entity) throw new Error(`Entity ${entityId} not found`);

  const scoreResult = await scoreEntity(entity, entity.workspace);

  // Persist score + log
  await prisma.gtmEntity.update({
    where: { id: entityId },
    data: {
      gtmScore: scoreResult.score,
      scoreBreakdown: scoreResult.scoreBreakdown,
      outreachAngles: scoreResult.outreachAngles,
      status: 'SCORED',
    },
  });

  await prisma.enrichmentLog.create({
    data: {
      entityId,
      provider: scoreResult.provider,
      action: 'score',
      status: 'SUCCESS',
      output: {
        score: scoreResult.score,
        fitTier: scoreResult.fitTier,
        reasons: scoreResult.reasons,
        outreachAngles: scoreResult.outreachAngles,
        scoreBreakdown: scoreResult.scoreBreakdown,
      },
      durationMs: scoreResult.durationMs || 0,
    },
  });

  job.log(`Scored entity ${entityId}: ${scoreResult.score} (${scoreResult.fitTier}) via ${scoreResult.provider}`);

  // Auto-promote if requested and score is above threshold
  if (autoPromote) {
    const threshold = entity.workspace.autoPromoteThreshold;
    if (threshold && scoreResult.score >= threshold) {
      await autoPromoteEntity(entity, scoreResult, job);
    }
  }

  return { entityId, score: scoreResult.score, fitTier: scoreResult.fitTier };
}

async function processBatch(workspaceId, autoPromote, job) {
  const entities = await prisma.gtmEntity.findMany({
    where: {
      workspaceId,
      status: { in: ['ENRICHED', 'NEW'] },
    },
    select: { id: true },
  });

  job.log(`Scoring ${entities.length} entities in workspace ${workspaceId}`);

  let scored = 0;
  let promoted = 0;
  let failed = 0;

  for (const e of entities) {
    try {
      const result = await processSingle(e.id, autoPromote, job);
      scored++;
      if (autoPromote) {
        const updated = await prisma.gtmEntity.findUnique({
          where: { id: e.id },
          select: { status: true },
        });
        if (updated?.status === 'PROMOTED') promoted++;
      }
    } catch (err) {
      failed++;
      job.log(`Failed to score ${e.id}: ${err.message}`);
    }
  }

  return { workspaceId, scored, promoted, failed, total: entities.length };
}

/**
 * Auto-promote a scored entity to a CRM Lead.
 * Mirrors the logic in the promoteEntity controller endpoint.
 */
async function autoPromoteEntity(entity, scoreResult, job) {
  if (entity.status === 'PROMOTED') return;

  const rawData = entity.rawData || {};
  const fallbackEmail = entity.domain
    ? `info@${entity.domain}`
    : `${entity.id}@gtm-pending.local`;

  try {
    const lead = await prisma.lead.create({
      data: {
        organizationId: entity.workspace.organizationId,
        firstName: entity.name.split(' ')[0] || entity.name,
        lastName: entity.name.split(' ').slice(1).join(' ') || '-',
        email: entity.email || fallbackEmail,
        phone: entity.phone || null,
        company: rawData.title || entity.name,
        website: entity.website || null,
        city: rawData.city || null,
        country: rawData.country || null,
        category: rawData.categoryName || rawData.category || null,
        source: 'GTM_ENGINE',
        score: scoreResult.score,
        status: scoreResult.fitTier === 'HIGH' ? 'WARM' : 'COLD',
        customFields: {
          gtmEntityId: entity.id,
          gtmWorkspaceId: entity.workspace.id,
          autoPromoted: true,
          promotedAt: new Date().toISOString(),
          fitTier: scoreResult.fitTier,
          reasons: scoreResult.reasons,
          outreachAngles: scoreResult.outreachAngles,
          scoreBreakdown: scoreResult.scoreBreakdown,
          rawData: entity.rawData,
          enrichedData: entity.enrichedData,
        },
      },
    });

    await prisma.gtmEntity.update({
      where: { id: entity.id },
      data: { status: 'PROMOTED', leadId: lead.id },
    });

    job.log(`Auto-promoted entity ${entity.id} → Lead ${lead.id} (score ${scoreResult.score})`);
  } catch (err) {
    job.log(`Failed to auto-promote ${entity.id}: ${err.message}`);
  }
}

function startScoringWorker() {
  const worker = createWorker(QUEUE_NAMES.SCORING, processScoringJob, {
    concurrency: 2,
    limiter: { max: 10, duration: 60000 }, // 10 Claude calls/min to respect rate limits
  });

  worker.on('completed', (job, result) => {
    console.log(`[SCORING] Job ${job.id} completed:`, JSON.stringify(result));
  });

  worker.on('failed', (job, err) => {
    console.error(`[SCORING] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[SCORING] Worker error:', err.message);
  });

  console.log('[SCORING] Worker started');
  return worker;
}

module.exports = { startScoringWorker, processScoringJob };
