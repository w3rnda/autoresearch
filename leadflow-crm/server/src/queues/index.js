'use strict';

const { QUEUE_NAMES, REDIS_CONNECTION, flowProducer } = require('./connection');
const { sourcingQueue } = require('./sourcing.queue');
const { enrichmentQueue } = require('./enrichment.queue');
const { scoringQueue } = require('./scoring.queue');

module.exports = {
  QUEUE_NAMES,
  REDIS_CONNECTION,
  flowProducer,
  sourcingQueue,
  enrichmentQueue,
  scoringQueue,
};
