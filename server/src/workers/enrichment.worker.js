'use strict';

const { createWorker, QUEUE_NAMES } = require('../queues/connection');
const prisma = require('../prisma');

/**
 * Enrichment Worker
 *
 * Processes enrichment jobs:
 * - enrich-batch: Run enrichment on all NEW entities in a workspace
 * - enrich-entity: Run waterfall enrichment on a single entity
 *
 * Enrichment waterfall:
 * 1. Website scrape (extract emails, tech stack, social links)
 * 2. Vibe Prospecting data (company info, revenue, employees)
 * 3. Social profile enrichment (LinkedIn, Twitter)
 *
 * Each step only runs if previous steps left fields empty.
 */
async function processEnrichmentJob(job) {
  const { workspaceId, sourcingRunId, entityId } = job.data;

  if (job.name === 'enrich-batch') {
    return processBatchEnrichment(workspaceId, sourcingRunId, job);
  }

  if (job.name === 'enrich-entity') {
    return processSingleEnrichment(entityId, job);
  }

  throw new Error(`Unknown enrichment job type: ${job.name}`);
}

/**
 * Enrich all NEW entities in a workspace.
 */
async function processBatchEnrichment(workspaceId, sourcingRunId, job) {
  const entities = await prisma.gtmEntity.findMany({
    where: {
      workspaceId,
      status: 'NEW',
      ...(sourcingRunId && { sourceRef: sourcingRunId }),
    },
    select: { id: true, website: true, domain: true, email: true },
  });

  job.log(`Enriching ${entities.length} entities in workspace ${workspaceId}`);

  let enriched = 0;
  let failed = 0;

  for (const entity of entities) {
    try {
      // Mark as enriching
      await prisma.gtmEntity.update({
        where: { id: entity.id },
        data: { status: 'ENRICHING' },
      });

      // Run waterfall enrichment
      const enrichedData = await runWaterfallEnrichment(entity);

      // Update entity with enriched data
      await prisma.gtmEntity.update({
        where: { id: entity.id },
        data: {
          enrichedData,
          status: 'ENRICHED',
        },
      });

      enriched++;
    } catch (err) {
      failed++;
      job.log(`Failed to enrich entity ${entity.id}: ${err.message}`);

      // Log the failure
      await prisma.enrichmentLog.create({
        data: {
          entityId: entity.id,
          provider: 'waterfall',
          action: 'enrich-batch',
          status: 'FAILED',
          error: err.message,
        },
      });
    }
  }

  job.log(`Batch enrichment complete: ${enriched} enriched, ${failed} failed`);
  return { enriched, failed, total: entities.length };
}

/**
 * Enrich a single entity through the waterfall.
 */
async function processSingleEnrichment(entityId, job) {
  const entity = await prisma.gtmEntity.findUnique({
    where: { id: entityId },
    select: { id: true, website: true, domain: true, email: true, rawData: true },
  });

  if (!entity) {
    throw new Error(`Entity ${entityId} not found`);
  }

  await prisma.gtmEntity.update({
    where: { id: entityId },
    data: { status: 'ENRICHING' },
  });

  const enrichedData = await runWaterfallEnrichment(entity);

  await prisma.gtmEntity.update({
    where: { id: entityId },
    data: { enrichedData, status: 'ENRICHED' },
  });

  job.log(`Entity ${entityId} enriched successfully`);
  return { entityId, enrichedData };
}

/**
 * Waterfall enrichment pipeline.
 * Each provider fills in gaps left by previous providers.
 *
 * For MVP, this uses basic extraction from rawData.
 * Future: integrate real providers (Hunter, Clearbit, Apollo, etc.)
 */
async function runWaterfallEnrichment(entity) {
  const startTime = Date.now();
  const enrichedData = {};
  const rawData = entity.rawData || {};

  // Step 1: Extract from rawData (Google Maps data is very rich)
  if (rawData.categories) {
    enrichedData.categories = rawData.categories;
  }
  if (rawData.rating || rawData.totalScore) {
    enrichedData.rating = rawData.rating || rawData.totalScore;
  }
  if (rawData.reviewCount || rawData.reviewsCount) {
    enrichedData.reviewCount = rawData.reviewCount || rawData.reviewsCount;
  }
  if (rawData.address) {
    enrichedData.address = rawData.address;
  }
  if (rawData.openingHours) {
    enrichedData.openingHours = rawData.openingHours;
  }
  if (rawData.socialProfiles) {
    enrichedData.socials = rawData.socialProfiles;
  }

  // Step 2: Domain-based enrichment (placeholder for future providers)
  if (entity.domain) {
    enrichedData.domain = entity.domain;
    enrichedData.domainEnriched = true;
    // Future: Hunter.io email finder, Clearbit company data, BuiltWith tech stack
  }

  // Step 3: Extract contact info
  if (rawData.phone || rawData.phoneUnformatted) {
    enrichedData.phone = rawData.phone || rawData.phoneUnformatted;
  }
  if (rawData.email || rawData.emails) {
    enrichedData.emails = rawData.emails || (rawData.email ? [rawData.email] : []);
  }

  // Log enrichment
  await prisma.enrichmentLog.create({
    data: {
      entityId: entity.id,
      provider: 'rawdata-extract',
      action: 'waterfall-step-1',
      status: 'SUCCESS',
      output: enrichedData,
      durationMs: Date.now() - startTime,
    },
  });

  return enrichedData;
}

/**
 * Create and start the enrichment worker.
 */
function startEnrichmentWorker() {
  const worker = createWorker(QUEUE_NAMES.ENRICHMENT, processEnrichmentJob, {
    concurrency: 3,
  });

  worker.on('completed', (job, result) => {
    console.log(`[ENRICHMENT] Job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`[ENRICHMENT] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[ENRICHMENT] Worker error:', err.message);
  });

  console.log('[ENRICHMENT] Worker started');
  return worker;
}

module.exports = { startEnrichmentWorker, processEnrichmentJob };
