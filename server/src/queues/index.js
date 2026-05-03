'use strict';

const { QUEUE_NAMES, REDIS_CONNECTION, flowProducer } = require('./connection');
const { sourcingQueue } = require('./sourcing.queue');
const { enrichmentQueue } = require('./enrichment.queue');

module.exports = {
  QUEUE_NAMES,
  REDIS_CONNECTION,
  flowProducer,
  sourcingQueue,
  enrichmentQueue,
};
