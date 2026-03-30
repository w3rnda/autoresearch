'use strict';

// Server entry point - initializes database, workers, and starts Express
require('dotenv').config();
const app = require('./app');
const { initializeWorkers } = require('./workers/email.worker');

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    // Initialize background workers
    await initializeWorkers();

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
