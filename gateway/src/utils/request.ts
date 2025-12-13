import type { Request } from 'express';

export function requireUserId(req: Request): string {
  if (!req.userId) {
    throw new Error('User context unavailable');
  }
  return req.userId;
}
