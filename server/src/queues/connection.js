'use strict';

const { Queue, Worker, FlowProducer } = require('bullmq');

// Shared Redis connection config for all BullMQ queues
const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null,
};

// Queue names (BullMQ does not allow colons in queue names)
const QUEUE_NAMES = {
  SOURCING: 'gtm-sourcing',
  ENRICHMENT: 'gtm-enrichment',
  SIGNAL: 'gtm-signal',
  SCORING: 'gtm-scoring',
};

// Default job options
const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { age: 86400, count: 1000 }, // Keep completed jobs for 24h, max 1000
  removeOnFail: { age: 604800, count: 5000 },    // Keep failed jobs for 7 days
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
};

// Create a queue instance (lazy — only connects when a job is added)
function createQueue(name) {
  return new Queue(name, {
    connection: REDIS_CONNECTION,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
}

// Create a worker instance
function createWorker(name, processor, opts = {}) {
  return new Worker(name, processor, {
    connection: REDIS_CONNECTION,
    concurrency: opts.concurrency || 3,
    limiter: opts.limiter || undefined,
    ...opts,
  });
}

// Lazy FlowProducer singleton
let _flowProducer = null;
function getFlowProducer() {
  if (!_flowProducer) {
    _flowProducer = new FlowProducer({ connection: REDIS_CONNECTION });
    _flowProducer.on('error', (err) => {
      console.warn('[FLOW PRODUCER] Connection error (will retry):', err.message);
    });
  }
  return _flowProducer;
}

module.exports = {
  REDIS_CONNECTION,
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  createQueue,
  createWorker,
  get flowProducer() { return getFlowProducer(); },
};
