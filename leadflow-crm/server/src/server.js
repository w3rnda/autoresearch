'use strict';

// Server entry point - initializes database, workers, and starts Express
require('dotenv').config();
const app = require('./app');
const { initializeWorkers } = require('./workers/email.worker');
const { startSourcingWorker } = require('./workers/sourcing.worker');
const { startEnrichmentWorker } = require('./workers/enrichment.worker');
const { startScoringWorker } = require('./workers/scoring.worker');

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    // Initialize background workers
    await initializeWorkers();

    // Start GTM engine workers (only if Redis is available)
    if (process.env.REDIS_HOST || process.env.ENABLE_GTM_WORKERS === 'true') {
      startSourcingWorker();
      startEnrichmentWorker();
      startScoringWorker();
      console.log('[GTM] Workers initialized (sourcing + enrichment + scoring)');
      if (process.env.ANTHROPIC_API_KEY) {
        console.log('[GTM] Claude AI scoring enabled');
      } else {
        console.log('[GTM] Claude API key not set — using heuristic scoring fallback');
      }
    } else {
      console.log('[GTM] Workers skipped (no REDIS_HOST configured)');
    }

    app.listen(PORT, () => {
      console.log(`LeadFlow CRM Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
      console.log(`API: http://localhost:${PORT}/api/v1`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
