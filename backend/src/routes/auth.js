const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const Joi = require('joi');
const config = require('../config');
const logger = require('../utils/logger');
const { AppError, ValidationError } = require('../utils/errors');
const { metrics } = require('../middleware/metrics');
const rateLimiter = require('../middleware/rate-limiter');

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().min(2).max(100).required(),
  accountId: Joi.number().required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

// In-memory user store (replace with database in production)
const users = new Map();
const refreshTokens = new Map();

// Generate tokens
const generateTokens = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    accountId: user.accountId,
    role: user.role,
  };

  const accessToken = jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiry,
  });

  const refreshToken = jwt.sign(
    { id: user.id, type: 'refresh' },
    config.auth.jwtSecret,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

// Register endpoint
router.post('/register', rateLimiter.auth, async (req, res, next) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      throw new ValidationError(error.details[0].message);
    }

    const { email, password, name, accountId } = value;

    // Check if user exists
    if (users.has(email)) {
      metrics.trackAuthAttempt('register', 'failed');
      throw new AppError('User already exists', 409);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, config.auth.bcryptRounds);

    // Create user
    const user = {
      id: `user_${Date.now()}`,
      email,
      password: hashedPassword,
      name,
      accountId,
      role: 'user',
      createdAt: new Date().toISOString(),
    };

    users.set(email, user);

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);
    refreshTokens.set(refreshToken, user.id);

    // Track metrics
    metrics.trackAuthAttempt('register', 'success');

    // Log audit
    logger.logAudit('user_registered', user.id, { email, accountId });

    res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        accountId: user.accountId,
        role: user.role,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: config.auth.jwtExpiry,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Login endpoint
router.post('/login', rateLimiter.auth, async (req, res, next) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      throw new ValidationError(error.details[0].message);
    }

    const { email, password } = value;

    // Find user
    const user = users.get(email);
    if (!user) {
      metrics.trackAuthAttempt('login', 'failed');
      throw new AppError('Invalid credentials', 401);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      metrics.trackAuthAttempt('login', 'failed');
      throw new AppError('Invalid credentials', 401);
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);
    refreshTokens.set(refreshToken, user.id);

    // Update last login
    user.lastLogin = new Date().toISOString();

    // Track metrics
    metrics.trackAuthAttempt('login', 'success');

    // Log audit
    logger.logAudit('user_login', user.id, { email });

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        accountId: user.accountId,
        role: user.role,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: config.auth.jwtExpiry,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Refresh token endpoint
router.post('/refresh', async (req, res, next) => {
  try {
    const { error, value } = refreshSchema.validate(req.body);
    if (error) {
      throw new ValidationError(error.details[0].message);
    }

    const { refreshToken } = value;

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, config.auth.jwtSecret);
    } catch (err) {
      throw new AppError('Invalid refresh token', 401);
    }

    // Check if token exists and is valid
    const userId = refreshTokens.get(refreshToken);
    if (!userId || userId !== decoded.id || decoded.type !== 'refresh') {
      throw new AppError('Invalid refresh token', 401);
    }

    // Find user
    const user = Array.from(users.values()).find(u => u.id === userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Generate new tokens
    const tokens = generateTokens(user);
    
    // Revoke old refresh token and store new one
    refreshTokens.delete(refreshToken);
    refreshTokens.set(tokens.refreshToken, user.id);

    // Track metrics
    metrics.trackAuthAttempt('refresh', 'success');

    res.json({
      success: true,
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: config.auth.jwtExpiry,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Logout endpoint
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      refreshTokens.delete(refreshToken);
    }

    // If you're using token blacklisting, add the access token here
    // blacklist.add(req.headers.authorization);

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Verify token endpoint (for frontend validation)
router.get('/verify', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401);
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.auth.jwtSecret);

    // Find user
    const user = Array.from(users.values()).find(u => u.id === decoded.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      success: true,
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        accountId: user.accountId,
        role: user.role,
      },
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      res.json({
        success: true,
        valid: false,
        error: error.message,
      });
    } else {
      next(error);
    }
  }
});

// Password reset request endpoint
router.post('/reset-password', rateLimiter.auth, async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new ValidationError('Email is required');
    }

    const user = users.get(email);
    if (!user) {
      // Don't reveal if user exists
      res.json({
        success: true,
        message: 'If the email exists, a reset link has been sent',
      });
      return;
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { id: user.id, type: 'reset' },
      config.auth.jwtSecret,
      { expiresIn: '1h' }
    );

    // In production, send email with reset link
    logger.info('Password reset requested', { email, resetToken });

    res.json({
      success: true,
      message: 'If the email exists, a reset link has been sent',
      // In development, return token for testing
      ...(process.env.NODE_ENV === 'development' && { resetToken }),
    });
  } catch (error) {
    next(error);
  }
});

// Cleanup expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, userId] of refreshTokens.entries()) {
    try {
      jwt.verify(token, config.auth.jwtSecret);
    } catch (error) {
      refreshTokens.delete(token);
      logger.debug('Cleaned up expired refresh token', { userId });
    }
  }
}, 60 * 60 * 1000); // Every hour

module.exports = router;