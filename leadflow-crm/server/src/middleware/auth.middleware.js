'use strict';

const { PrismaClient } = require('@prisma/client');
const { verifyAccessToken } = require('../utils/jwt.utils');

const prisma = new PrismaClient();

/**
 * Authenticates the request by verifying the JWT access token from the
 * Authorization: Bearer header. Attaches the full user record to req.user.
 * Returns 401 if the token is missing, expired, or invalid.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please provide a valid Bearer token.',
    });
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  try {
    const decoded = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organizationId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User associated with this token no longer exists.',
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Access token has expired. Please refresh your token.',
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid access token.',
      });
    }

    return next(error);
  }
}

/**
 * Returns a middleware that restricts access to users whose role is in the
 * provided list of allowed roles. Must be used AFTER authenticate.
 * Returns 403 if the user's role is not permitted.
 *
 * @param {...string} roles - Allowed roles (e.g. 'ADMIN', 'SALES_REP')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}.`,
      });
    }

    return next();
  };
}

/**
 * Attempts to authenticate the request using the Bearer token, but does NOT
 * fail if no token is provided. If a valid token is present, attaches the user
 * to req.user. If not, req.user remains undefined.
 * This is useful for routes that have optional authenticated behaviour.
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);

  try {
    const decoded = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organizationId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (user) {
      req.user = user;
    }
  } catch (_error) {
    // Silently ignore token errors for optional auth
  }

  return next();
}

module.exports = { authenticate, requireRole, optionalAuth };
