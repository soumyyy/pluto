import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { isValidUUID } from '../services/db';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export async function attachUserContext(req: Request, res: Response, next: NextFunction) {
  try {
    const existingId = typeof req.cookies?.[config.sessionCookieName] === 'string'
      ? (req.cookies[config.sessionCookieName] as string)
      : undefined;

    // Only set userId if we have a valid existing session
    if (existingId && isValidUUID(existingId)) {
      req.userId = existingId;
    }

    next();
  } catch (error) {
    next(error);
  }
}
