const bcrypt = require('bcryptjs');
const prisma = require('../prisma');
const { generateTokenPair, verifyRefreshToken } = require('../utils/jwt.utils');
const { successResponse, errorResponse } = require('../utils/response.utils');

/**
 * POST /auth/register
 * Creates a new organization and admin user, returns token pair.
 */
const register = async (req, res, next) => {
  try {
    const { email, password, name, organizationName } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json(errorResponse('Email already in use'));
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: organizationName },
      });

      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role: 'ADMIN',
          organizationId: organization.id,
        },
      });

      return { organization, user };
    });

    const { organization, user } = result;
    const { accessToken, refreshToken, refreshTokenExpiry } = generateTokenPair({
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    });

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: refreshTokenExpiry,
      },
    });

    const { password: _pw, ...userWithoutPassword } = user;

    return res.status(201).json(
      successResponse(
        { user: userWithoutPassword, organization, accessToken, refreshToken },
        'Registration successful'
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/login
 * Validates credentials, returns token pair.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json(errorResponse('Invalid email or password'));
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json(errorResponse('Invalid email or password'));
    }

    const { accessToken, refreshToken, refreshTokenExpiry } = generateTokenPair({
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    });

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: refreshTokenExpiry,
      },
    });

    const { password: _pw, ...userWithoutPassword } = user;

    return res.status(200).json(
      successResponse(
        { user: userWithoutPassword, accessToken, refreshToken },
        'Login successful'
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/refresh
 * Rotates the refresh token pair.
 */
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    // Verify JWT signature first
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (err) {
      return res.status(401).json(errorResponse('Invalid or expired refresh token'));
    }

    // Verify token exists in DB and is not expired
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      return res.status(401).json(errorResponse('Refresh token is invalid or expired'));
    }

    const { user } = storedToken;

    const {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      refreshTokenExpiry,
    } = generateTokenPair({
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    });

    // Rotate: delete old token, insert new one
    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { token: refreshToken } }),
      prisma.refreshToken.create({
        data: {
          token: newRefreshToken,
          userId: user.id,
          expiresAt: refreshTokenExpiry,
        },
      }),
    ]);

    return res.status(200).json(
      successResponse(
        { accessToken: newAccessToken, refreshToken: newRefreshToken },
        'Token refreshed'
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/logout
 * Deletes the refresh token from DB.
 */
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });

    return res.status(200).json(successResponse(null, 'Logged out successfully'));
  } catch (error) {
    next(error);
  }
};

/**
 * GET /auth/me
 * Returns the authenticated user (no password).
 */
const getMe = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { organization: true },
    });

    if (!user) {
      return res.status(404).json(errorResponse('User not found'));
    }

    const { password: _pw, ...userWithoutPassword } = user;

    return res.status(200).json(successResponse(userWithoutPassword));
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, refresh, logout, getMe };
