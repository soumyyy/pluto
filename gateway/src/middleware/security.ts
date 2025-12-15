import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from '../config';

/**
 * Production-grade security using proven frameworks
 * Replaces 500+ lines of custom code with industry standards
 */

// Security headers - Helmet.js (used by Express.js team)
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", ...config.allowedOrigins],
    },
  },
});

// Rate limiting - express-rate-limit (industry standard)
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.isProduction ? 100 : 1000,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for auth endpoints
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isProduction ? 5 : 50,
  message: { error: 'Too many authentication attempts.' },
});