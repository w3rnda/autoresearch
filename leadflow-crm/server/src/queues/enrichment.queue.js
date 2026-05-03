'use strict';

const { createQueue, QUEUE_NAMES } = require('./connection');

const enrichmentQueue = createQueue(QUEUE_NAMES.ENRICHMENT);

// Prevent unhandled error crash when Redis is unavailable
enrichmentQueue.on('error', (err) => {
  console.warn('[ENRICHMENT QUEUE] Connection error (will retry):', err.message);
});

// Job types:
// - enrich-entity: Run waterfall enrichment on a single entity
// - enrich-batch: Run enrichment on all NEW entities in a workspace

module.exports = { enrichmentQueue };
