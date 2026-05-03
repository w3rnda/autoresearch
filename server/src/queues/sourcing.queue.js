'use strict';

const { createQueue, QUEUE_NAMES } = require('./connection');

const sourcingQueue = createQueue(QUEUE_NAMES.SOURCING);

// Prevent unhandled error crash when Redis is unavailable
sourcingQueue.on('error', (err) => {
  console.warn('[SOURCING QUEUE] Connection error (will retry):', err.message);
});

// Job types:
// - google-maps-search: Run Apify Google Maps scraper
// - vibe-fetch: Fetch entities from Vibe Prospecting
// - periodic-scan: Re-run active workspace queries on schedule

module.exports = { sourcingQueue };
