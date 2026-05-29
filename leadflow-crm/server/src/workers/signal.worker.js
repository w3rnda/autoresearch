'use strict';

const { createWorker, QUEUE_NAMES } = require('../queues/connection');
const { captureSnapshot, detectSignals } = require('../services/gtm/signal.service');
const prisma = require('../prisma');

/**
 * Signal Worker — runs the continuous-intelligence side of the GTM Engine.
 *
 * Job types:
 *   - snapshot-workspace : capture a metrics snapshot for every entity
 *   - detect-workspace   : compute deltas + fire signals for every entity
 *   - scan-workspace     : re-source (Apify) then snapshot then detect
 */
async function processSignalJob(job) {
  const { workspaceId } = job.data;

  switch (job.name) {
    case 'snapshot-workspace':
      return snapshotWorkspace(workspaceId, job);
    case 'detect-workspace':
      return detectWorkspace(workspaceId, job);
    case 'scan-workspace':
      return scanWorkspace(workspaceId, job);
    default:
      throw new Error(`Unknown signal job type: ${job.name}`);
  }
}

async function snapshotWorkspace(workspaceId, job) {
  const entities = await prisma.gtmEntity.findMany({
    where: { workspaceId, status: { not: 'REJECTED' } },
    select: { id: true, rawData: true, enrichedData: true, website: true },
  });

  let captured = 0;
  for (const entity of entities) {
    try {
      await captureSnapshot(entity);
      captured++;
    } catch (err) {
      job.log(`Snapshot failed for ${entity.id}: ${err.message}`);
    }
  }

  job.log(`Captured ${captured}/${entities.length} snapshots`);
  return { workspaceId, captured, total: entities.length };
}

async function detectWorkspace(workspaceId, job) {
  const entities = await prisma.gtmEntity.findMany({
    where: { workspaceId, status: { not: 'REJECTED' } },
    select: { id: true, workspaceId: true },
  });

  let totalSignals = 0;
  let entitiesWithSignals = 0;

  for (const entity of entities) {
    try {
      const signals = await detectSignals(entity);
      if (signals.length > 0) {
        entitiesWithSignals++;
        totalSignals += signals.length;
        // Boost gtmScore for entities showing intent — hot leads bubble up.
        await boostScoreForSignals(entity.id, signals);
      }
    } catch (err) {
      job.log(`Signal detection failed for ${entity.id}: ${err.message}`);
    }
  }

  job.log(`Detected ${totalSignals} signals across ${entitiesWithSignals} entities`);
  return { workspaceId, totalSignals, entitiesWithSignals, total: entities.length };
}

/**
 * Full periodic scan = the "continuous pipeline" (revenue driver #4).
 * Re-runs sourcing queries, then snapshots, then detects signals.
 */
async function scanWorkspace(workspaceId, job) {
  const workspace = await prisma.gtmWorkspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, status: true, sourcingConfig: true },
  });

  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  // 1. Snapshot current state BEFORE re-sourcing (so we capture the "before").
  await snapshotWorkspace(workspaceId, job);

  // 2. Re-run sourcing queries to pick up fresh data + new businesses.
  const queries = workspace.sourcingConfig?.queries || [];
  if (queries.length > 0) {
    try {
      const { sourcingQueue } = require('../queues');
      for (const query of queries) {
        const run = await prisma.sourcingRun.create({
          data: { workspaceId, source: 'GOOGLE_MAPS', query, config: { periodic: true }, status: 'RUNNING' },
        });
        await sourcingQueue.add(
          'google-maps-search',
          { workspaceId, sourcingRunId: run.id, query, source: 'GOOGLE_MAPS', maxResults: 100 },
          { jobId: `scan-${run.id}` }
        );
      }
      job.log(`Re-queued ${queries.length} sourcing queries for periodic scan`);
    } catch (err) {
      job.log(`Periodic re-sourcing failed: ${err.message}`);
    }
  }

  // 3. Detect signals from the snapshot history we have so far.
  const detection = await detectWorkspace(workspaceId, job);

  return { workspaceId, periodicScan: true, ...detection };
}

/**
 * Raise an entity's gtmScore when fresh intent signals appear, so growing
 * businesses are prioritized for outreach (revenue driver #2).
 */
async function boostScoreForSignals(entityId, signals) {
  const maxStrength = Math.max(...signals.map((s) => s.strength || 0));
  const boost = Math.round(maxStrength * 0.2); // up to +20 points

  const entity = await prisma.gtmEntity.findUnique({
    where: { id: entityId },
    select: { gtmScore: true, scoreBreakdown: true },
  });
  if (!entity) return;

  const newScore = Math.min(100, (entity.gtmScore || 0) + boost);
  await prisma.gtmEntity.update({
    where: { id: entityId },
    data: {
      gtmScore: newScore,
      scoreBreakdown: {
        ...(entity.scoreBreakdown || {}),
        signalBoost: boost,
        signals: signals.map((s) => ({ type: s.type, strength: s.strength })),
      },
    },
  });
}

function startSignalWorker() {
  const worker = createWorker(QUEUE_NAMES.SIGNAL, processSignalJob, {
    concurrency: 2,
  });

  worker.on('completed', (job, result) => {
    console.log(`[SIGNAL] Job ${job.id} (${job.name}) completed:`, JSON.stringify(result));
  });
  worker.on('failed', (job, err) => {
    console.error(`[SIGNAL] Job ${job?.id} failed:`, err.message);
  });
  worker.on('error', (err) => {
    console.error('[SIGNAL] Worker error:', err.message);
  });

  console.log('[SIGNAL] Worker started');
  return worker;
}

module.exports = { startSignalWorker, processSignalJob };
