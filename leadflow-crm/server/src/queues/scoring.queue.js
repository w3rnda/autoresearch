'use strict';

const { createQueue, QUEUE_NAMES } = require('./connection');

const scoringQueue = createQueue(QUEUE_NAMES.SCORING);

// Prevent unhandled error crash when Redis is unavailable
scoringQueue.on('error', (err) => {
  console.warn('[SCORING QUEUE] Connection error (will retry):', err.message);
});

// Job types:
// - score-entity: Claude-score a single entity
// - score-batch: Score all ENRICHED entities in a workspace
// - score-and-promote: Score then auto-promote if above threshold

module.exports = { scoringQueue };
