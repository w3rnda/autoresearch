'use strict';

const { createWorker, QUEUE_NAMES } = require('../queues/connection');
const { deduplicateAndInsert } = require('../services/gtm/dedup.service');
const { runGoogleMapsSearch } = require('../services/providers/apify.provider');
const prisma = require('../prisma');

/**
 * Sourcing Worker
 *
 * Processes sourcing jobs from the BullMQ queue:
 * - google-maps-search: Runs Apify Google Maps scraper, deduplicates results, creates entities
 * - vibe-fetch: Fetches entities from Vibe Prospecting (future)
 * - periodic-scan: Re-runs active workspace queries (future)
 */
async function processSourcingJob(job) {
  const { workspaceId, query, source, maxResults = 100 } = job.data;
  let { sourcingRunId } = job.data;

  // Create sourcing run if not provided (e.g. from workspace activation)
  if (!sourcingRunId) {
    const run = await prisma.sourcingRun.create({
      data: {
        workspaceId,
        source: source || 'GOOGLE_MAPS',
        query,
        config: { maxResults },
        status: 'RUNNING',
      },
    });
    sourcingRunId = run.id;
  }

  job.log(`Starting sourcing: "${query}" (source=${source}, max=${maxResults}, run=${sourcingRunId})`);

  try {
    let entities = [];

    switch (source) {
      case 'GOOGLE_MAPS': {
        const result = await runGoogleMapsSearch({ query, maxResults });
        entities = result.entities;
        job.log(`Apify returned ${entities.length} results (run: ${result.runId})`);
        break;
      }

      case 'VIBE_PROSPECTING': {
        // TODO: Integrate Vibe Prospecting MCP
        job.log('Vibe Prospecting not yet implemented');
        break;
      }

      default:
        throw new Error(`Unknown source type: ${source}`);
    }

    // Deduplicate and insert into database
    const dedupResult = await deduplicateAndInsert(
      workspaceId,
      entities,
      source,
      sourcingRunId
    );

    job.log(`Dedup complete: ${dedupResult.created} new, ${dedupResult.duplicates} duplicates`);

    // Update sourcing run with results
    await prisma.sourcingRun.update({
      where: { id: sourcingRunId },
      data: {
        status: 'COMPLETED',
        entitiesFound: dedupResult.total,
        entitiesNew: dedupResult.created,
        entitiesDuplicate: dedupResult.duplicates,
        completedAt: new Date(),
      },
    });

    // Trigger enrichment for new entities
    if (dedupResult.created > 0) {
      const { enrichmentQueue } = require('../queues');
      await enrichmentQueue.add(
        'enrich-batch',
        { workspaceId, sourcingRunId },
        { delay: 2000 } // Small delay to let DB settle
      );
      job.log(`Queued enrichment batch for ${dedupResult.created} new entities`);
    }

    return {
      success: true,
      created: dedupResult.created,
      duplicates: dedupResult.duplicates,
      total: dedupResult.total,
    };
  } catch (err) {
    // Mark sourcing run as failed
    await prisma.sourcingRun.update({
      where: { id: sourcingRunId },
      data: {
        status: 'FAILED',
        error: err.message,
        completedAt: new Date(),
      },
    });

    throw err; // Re-throw so BullMQ handles retries
  }
}

/**
 * Create and start the sourcing worker.
 * Call this from server startup.
 */
function startSourcingWorker() {
  const worker = createWorker(QUEUE_NAMES.SOURCING, processSourcingJob, {
    concurrency: 2,
    limiter: { max: 5, duration: 60000 }, // Max 5 jobs per minute (Apify rate limit)
  });

  worker.on('completed', (job, result) => {
    console.log(`[SOURCING] Job ${job.id} completed: ${result.created} new entities`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[SOURCING] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[SOURCING] Worker error:', err.message);
  });

  console.log('[SOURCING] Worker started');
  return worker;
}

module.exports = { startSourcingWorker, processSourcingJob };
