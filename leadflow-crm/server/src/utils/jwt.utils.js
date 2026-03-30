'use strict';

const jwt = require('jsonwebtoken');

/**
 * Extract a plain string user ID from either a string or an object with an `id` field.
 * The auth controller calls generateTokenPair({ id, email, role, organizationId }) so
 * we normalise to a string before signing.
 */
function extractUserId(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') return input.id || input.userId;
  throw new Error('Invalid user identifier passed to JWT utility');
}

/**
 * Generates a short-lived JWT access token.
 * @param {string|{id:string}} userPayload - user ID string or object with .id
 * @returns {string} Signed JWT with payload { userId: string }
 */
function generateAccessToken(userPayload) {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || '15m';
  if (!secret) throw new Error('JWT_SECRET environment variable is not set.');
  const userId = extractUserId(userPayload);
  return jwt.sign({ userId }, secret, { expiresIn });
}

/**
 * Generates a long-lived JWT refresh token.
 * @param {string|{id:string}} userPayload
 * @returns {string} Signed JWT with payload { userId: string }
 */
function generateRefreshToken(userPayload) {
  const secret = process.env.JWT_REFRESH_SECRET;
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  if (!secret) throw new Error('JWT_REFRESH_SECRET environment variable is not set.');
  const userId = extractUserId(userPayload);
  return jwt.sign({ userId }, secret, { expiresIn });
}

/**
 * Verifies and decodes a JWT access token.
 * @param {string} token
 * @returns {{ userId: string, iat: number, exp: number }}
 */
function verifyAccessToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set.');
  return jwt.verify(token, secret);
}

/**
 * Verifies and decodes a JWT refresh token.
 * @param {string} token
 * @returns {{ userId: string, iat: number, exp: number }}
 */
function verifyRefreshToken(token) {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET environment variable is not set.');
  return jwt.verify(token, secret);
}

/**
 * Convenience: generates both tokens and the refresh token expiry Date.
 * Auth controller stores refreshTokenExpiry in DB so it can validate on refresh.
 *
 * @param {string|{id:string}} userPayload
 * @returns {{ accessToken: string, refreshToken: string, refreshTokenExpiry: Date }}
 */
function generateTokenPair(userPayload) {
  const accessToken = generateAccessToken(userPayload);
  const refreshToken = generateRefreshToken(userPayload);

  // Parse refresh expiry from env (supports "7d", "30d", etc.)
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  const days = parseInt(expiresIn, 10) || 7;
  const refreshTokenExpiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  return { accessToken, refreshToken, refreshTokenExpiry };
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateTokenPair,
};
