'use strict';

const { Prisma } = require('@prisma/client');

/**
 * Maps Prisma error codes to human-readable messages and HTTP status codes.
 */
const PRISMA_ERROR_MAP = {
  P2002: { status: 409, message: 'A record with this value already exists (unique constraint violation).' },
  P2003: { status: 409, message: 'Foreign key constraint failed. Related record does not exist.' },
  P2025: { status: 404, message: 'Record not found.' },
  P2016: { status: 404, message: 'Query interpretation error: record not found.' },
  P2014: { status: 400, message: 'The change would violate a required relation.' },
  P2000: { status: 400, message: 'Input value is too long for the column type.' },
  P2006: { status: 400, message: 'Invalid value provided for a field.' },
};

/**
 * Global Express error handler. Must be registered as the last middleware.
 * Handles Prisma errors, JWT errors, validation errors, and general errors,
 * returning a consistent JSON error envelope.
 */
function errorHandler(err, req, res, next) {
  // If response already started, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  const isDevelopment = process.env.NODE_ENV === 'development';

  // Log the error in development for debugging
  if (isDevelopment) {
    console.error('[Error]', err.stack || err);
  } else {
    console.error('[Error]', err.message);
  }

  // --- Prisma known request errors ---
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = PRISMA_ERROR_MAP[err.code];

    if (mapped) {
      const details = isDevelopment ? { prismaCode: err.code, meta: err.meta } : undefined;
      return res.status(mapped.status).json({
        success: false,
        error: mapped.message,
        ...(details && { details }),
      });
    }

    // Unmapped Prisma known error
    return res.status(400).json({
      success: false,
      error: 'Database operation failed.',
      ...(isDevelopment && { details: { prismaCode: err.code, message: err.message } }),
    });
  }

  // --- Prisma validation error ---
  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({
      success: false,
      error: 'Invalid data provided to the database.',
      ...(isDevelopment && { details: err.message }),
    });
  }

  // --- Prisma initialization/connection error ---
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return res.status(503).json({
      success: false,
      error: 'Database connection is unavailable. Please try again later.',
    });
  }

  // --- JWT errors ---
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Access token has expired. Please refresh your token.',
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token signature.',
    });
  }

  if (err.name === 'NotBeforeError') {
    return res.status(401).json({
      success: false,
      error: 'Token is not yet active.',
    });
  }

  // --- Express-validator validation errors (passed via next(err)) ---
  // These are typically caught in validate.middleware.js before reaching here,
  // but handle them defensively if passed through.
  if (err.type === 'validation' && Array.isArray(err.errors)) {
    return res.status(422).json({
      success: false,
      error: 'Validation failed.',
      details: err.errors,
    });
  }

  // --- Multer file upload errors ---
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: 'Uploaded file exceeds the maximum allowed size.',
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      error: 'Unexpected file field in upload.',
    });
  }

  // --- SyntaxError from JSON body parsing ---
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON in request body.',
    });
  }

  // --- Generic/unhandled errors ---
  const statusCode = err.statusCode || err.status || 500;
  const message =
    statusCode < 500
      ? err.message || 'An unexpected error occurred.'
      : isDevelopment
      ? err.message
      : 'An internal server error occurred. Please try again later.';

  return res.status(statusCode).json({
    success: false,
    error: message,
    ...(isDevelopment && statusCode >= 500 && { stack: err.stack }),
  });
}

module.exports = { errorHandler };
