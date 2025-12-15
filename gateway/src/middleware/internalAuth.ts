/**
 * Production-grade internal service authentication middleware.
 * Provides secure service-to-service communication with proper validation.
 */
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { config } from '../config';

export interface InternalContext {
  requestId: string;
  serviceId: string;
  userId?: string;
  timestamp: number;
  authenticated: boolean;
}

export interface AuthenticatedRequest extends Request {
  internal?: InternalContext;
}

/**
 * Internal authentication service for service-to-service communication.
 */
export class InternalAuthService {
  private static readonly VALID_SERVICES = new Set(['brain', 'memory', 'sync']);
  private static readonly REQUEST_TIMEOUT_MS = 30000; // 30 seconds

  /**
   * Validate internal service request headers and create context.
   */
  static validateRequest(req: Request): InternalContext | null {
    const serviceId = req.header('x-internal-service');
    const secret = req.header('x-internal-secret');
    const requestId = req.header('x-request-id') || randomUUID();
    const userIdHeader = req.header('x-user-id');
    const timestampHeader = req.header('x-timestamp');

    // Validate required headers
    if (!serviceId || !secret) {
      return null;
    }

    // Validate service ID
    if (!this.VALID_SERVICES.has(serviceId)) {
      return null;
    }

    // Validate secret
    if (!this.verifyServiceSecret(secret)) {
      return null;
    }

    // Parse timestamp and validate request freshness
    const timestamp = timestampHeader ? parseInt(timestampHeader, 10) : Date.now();
    if (isNaN(timestamp)) {
      return null;
    }

    const requestAge = Date.now() - timestamp;
    if (requestAge > this.REQUEST_TIMEOUT_MS || requestAge < -5000) { // Allow 5s clock skew
      return null;
    }

    return {
      requestId,
      serviceId,
      userId: userIdHeader || undefined,
      timestamp,
      authenticated: true
    };
  }

  /**
   * Generate authentication headers for outgoing internal requests.
   */
  static generateAuthHeaders(serviceId: string, userId?: string): Record<string, string> {
    if (!this.VALID_SERVICES.has(serviceId)) {
      throw new Error(`Invalid service ID: ${serviceId}`);
    }

    const headers: Record<string, string> = {
      'x-internal-service': serviceId,
      'x-internal-secret': config.internalApiKey,
      'x-request-id': randomUUID(),
      'x-timestamp': Date.now().toString(),
      'content-type': 'application/json'
    };

    if (userId) {
      headers['x-user-id'] = userId;
    }

    return headers;
  }

  /**
   * Verify internal service secret.
   */
  private static verifyServiceSecret(secret: string): boolean {
    if (!config.internalApiKey) {
      console.warn('[InternalAuth] Internal API key not configured');
      return false;
    }

    // Use constant-time comparison to prevent timing attacks
    return this.constantTimeEqual(secret, config.internalApiKey);
  }

  /**
   * Constant-time string comparison to prevent timing attacks.
   */
  private static constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }
}

/**
 * Express middleware to validate internal service authentication.
 */
export function validateInternalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const context = InternalAuthService.validateRequest(req);

  if (!context) {
    console.warn('[InternalAuth] Authentication failed', {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      path: req.path,
      headers: {
        service: req.header('x-internal-service'),
        hasSecret: !!req.header('x-internal-secret'),
        requestId: req.header('x-request-id')
      }
    });

    return res.status(401).json({
      error: 'Internal authentication required',
      code: 'INTERNAL_AUTH_FAILED',
      timestamp: new Date().toISOString()
    });
  }

  // Attach context to request
  req.internal = context;

  // Log successful authentication
  console.info('[InternalAuth] Service authenticated', {
    serviceId: context.serviceId,
    requestId: context.requestId,
    userId: context.userId,
    path: req.path,
    method: req.method
  });

  next();
}

/**
 * Middleware to require specific user context in internal calls.
 */
export function requireInternalUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.internal?.authenticated) {
    return res.status(401).json({
      error: 'Internal authentication required',
      code: 'INTERNAL_AUTH_REQUIRED'
    });
  }

  if (!req.internal.userId) {
    return res.status(400).json({
      error: 'User ID required for this operation',
      code: 'USER_ID_REQUIRED'
    });
  }

  next();
}

/**
 * Helper to get user ID from internal context or request params.
 */
export function getInternalUserId(req: AuthenticatedRequest): string | null {
  // First try to get from internal context
  if (req.internal?.userId) {
    return req.internal.userId;
  }

  // Fall back to URL parameter
  const paramUserId = req.params.userId;
  if (paramUserId && typeof paramUserId === 'string') {
    return paramUserId;
  }

  return null;
}