import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { createClient } from 'redis';
import { config } from '../config';

function createRedisClient() {
  if (!config.redisUrl) {
    return null;
  }

  const client = createClient({
    url: config.redisUrl,
    password: config.redisToken || undefined,
    socket: config.redisUseTls
      ? {
          tls: true,
          rejectUnauthorized: false
        }
      : undefined
  });

  client.on('error', (err) => {
    console.error('[session] Redis error', err);
  });

  client
    .connect()
    .then(() => console.log('[session] Redis connected'))
    .catch((error) => console.error('[session] Redis connection failed', error));

  return client;
}

const redisClient = createRedisClient();
if (!redisClient) {
  console.warn('[session] Redis URL not configured, falling back to in-memory sessions');
}
const store =
  redisClient &&
  new RedisStore({
    client: redisClient,
    prefix: config.sessionStorePrefix
  });

export const sessionConfig = session({
  name: config.sessionCookieName,
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  store,
  cookie: {
    secure: config.sessionCookieSecure,
    httpOnly: true,
    maxAge: config.sessionMaxAge,
    sameSite: config.sessionCookieSameSite,
    domain: config.sessionCookieDomain
  }
});

export const sessionHelpers = {
  setUserId: (req: any, userId: string) => {
    req.session.userId = userId;
  },

  getUserId: (req: any): string | undefined => {
    return req.session?.userId;
  },

  destroySession: (req: any, callback?: (err?: any) => void) => {
    if (req.session) {
      req.session.destroy(callback || (() => {}));
    } else if (callback) {
      callback();
    }
  }
};
