'use strict';

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { errorHandler } = require('./middleware/error.middleware');
const authRoutes = require('./routes/auth.routes');
const leadsRoutes = require('./routes/leads.routes');
const pipelineRoutes = require('./routes/pipeline.routes');
const sequencesRoutes = require('./routes/sequences.routes');
const meetingsRoutes = require('./routes/meetings.routes');
const quotesRoutes = require('./routes/quotes.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const trackRoutes = require('./routes/track.routes');
const searchRoutes = require('./routes/search.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const segmentsRoutes = require('./routes/segments.routes');
const pipelinesRoutes = require('./routes/pipelines.routes');
const workspaceRoutes = require('./routes/workspace.routes');

const app = express();

// Security headers
app.use(helmet());

// Gzip compression
app.use(compression());

// HTTP request logging
app.use(morgan('combined'));

// CORS configuration — in development, allow any localhost origin
const corsOrigin = process.env.NODE_ENV === 'production'
  ? process.env.FRONTEND_URL
  : (origin, callback) => {
      // Allow any localhost port, or requests with no origin (e.g. curl, Postman)
      if (!origin || /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    };

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting on all /api/ routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again after 15 minutes.',
  },
});
app.use('/api/', apiLimiter);

// Health check endpoint (not rate-limited)
app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// Mount API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/leads', leadsRoutes);
app.use('/api/v1/pipeline', pipelineRoutes);
app.use('/api/v1/sequences', sequencesRoutes);
app.use('/api/v1/meetings', meetingsRoutes);
app.use('/api/v1/quotes', quotesRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/track', trackRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/segments', segmentsRoutes);
app.use('/api/v1/pipelines', pipelinesRoutes);
app.use('/api/v1/workspace', workspaceRoutes);

// Serve uploaded documents
app.use('/uploads', express.static(require('path').join(__dirname, '../uploads')));

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
