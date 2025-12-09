import { Pool } from 'pg';
import { config } from '../config';

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSSL
    ? {
        rejectUnauthorized: false
      }
    : undefined
});

export async function saveGmailTokens(params: {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiry: Date;
}) {
  // TODO: encrypt tokens at rest.
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO gmail_tokens (id, user_id, access_token, refresh_token, expiry)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       ON CONFLICT (user_id)
       DO UPDATE SET access_token = EXCLUDED.access_token,
                     refresh_token = EXCLUDED.refresh_token,
                     expiry = EXCLUDED.expiry`,
      [params.userId, params.accessToken, params.refreshToken, params.expiry]
    );
  } finally {
    client.release();
  }
}

export async function getGmailTokens(userId: string) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT access_token as "accessToken", refresh_token as "refreshToken", expiry
       FROM gmail_tokens
       WHERE user_id = $1`,
      [userId]
    );
    if (result.rowCount === 0) {
      return null;
    }
    const row = result.rows[0];
    return {
      accessToken: row.accessToken as string,
      refreshToken: row.refreshToken as string,
      expiry: row.expiry as Date
    };
  } finally {
    client.release();
  }
}

export interface GmailThreadRecord {
  threadId: string;
  subject: string;
  snippet: string;
  lastMessageAt?: Date | null;
  category?: string;
  importanceScore?: number;
  expiresAt?: Date | null;
}

export async function saveGmailThreads(userId: string, threads: GmailThreadRecord[]) {
  if (!threads.length) return;
  const client = await pool.connect();
  try {
    for (const thread of threads) {
      await client.query(
        `INSERT INTO gmail_threads (id, user_id, thread_id, subject, summary, category, importance_score, expires_at, last_message_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, thread_id)
         DO UPDATE SET subject = EXCLUDED.subject,
                       summary = EXCLUDED.summary,
                       category = EXCLUDED.category,
                       importance_score = EXCLUDED.importance_score,
                       expires_at = EXCLUDED.expires_at,
                       last_message_at = EXCLUDED.last_message_at`,
        [
          userId,
          thread.threadId,
          thread.subject,
          thread.snippet,
          thread.category,
          thread.importanceScore ?? 0,
          thread.expiresAt ?? null,
          thread.lastMessageAt ?? null
        ]
      );
    }
  } finally {
    client.release();
  }
}

export async function insertMessage(params: {
  userId: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
}) {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO messages (id, conversation_id, role, text)
       VALUES (gen_random_uuid(), $1, $2, $3)`,
      [params.conversationId, params.role, params.text]
    );
  } finally {
    client.release();
  }
}

export function getPool() {
  return pool;
}
