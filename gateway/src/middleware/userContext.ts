import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { ensureUserRecord } from '../services/db';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export async function attachUserContext(req: Request, res: Response, next: NextFunction) {
  try {
    const existingId = typeof req.cookies?.[config.sessionCookieName] === 'string'
      ? (req.cookies[config.sessionCookieName] as string)
      : undefined;
    const { userId } = await ensureUserRecord(existingId);
    req.userId = userId;
    if (!existingId || existingId !== userId) {
      res.cookie(config.sessionCookieName, userId, {
        httpOnly: true,
        sameSite: config.sessionCookieSameSite,
        secure: config.sessionCookieSecure,
        domain: config.sessionCookieDomain,
        maxAge: ONE_YEAR_MS
      });
    }
    next();
  } catch (error) {
    next(error);
  }
}
