'use strict';

const { createQueue, QUEUE_NAMES } = require('./connection');

const signalQueue = createQueue(QUEUE_NAMES.SIGNAL);

// Prevent unhandled error crash when Redis is unavailable
signalQueue.on('error', (err) => {
  console.warn('[SIGNAL QUEUE] Connection error (will retry):', err.message);
});

// Job types:
// - snapshot-workspace: capture snapshots for all entities in a workspace
// - detect-workspace: detect signals for all entities in a workspace
// - scan-workspace: full periodic scan (re-source + snapshot + detect)
// - snapshot-entity / detect-entity: single-entity variants

module.exports = { signalQueue };
