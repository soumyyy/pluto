import { Router } from 'express';
import { getAuthUrl, exchangeCodeForTokens, revokeToken } from '../services/gmailOAuth';
import {
  saveGmailTokens,
  removeExpiredGmailThreads,
  searchGmailEmbeddings,
  getGmailTokens,
  deleteGmailTokens
} from '../services/db';
import { fetchRecentThreads, getGmailProfile, NO_GMAIL_TOKENS, fetchThreadBody } from '../services/gmailClient';
import { embedEmailText } from '../services/embeddings';
import { requireUserId } from '../utils/request';

const router = Router();
const DEFAULT_LOOKBACK_HOURS = 48;

function formatDateForQuery(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

router.get('/connect', (req, res) => {
  requireUserId(req);
  const state = req.query.state?.toString() || 'Eclipsn-dev';
  const authUrl = getAuthUrl(state);
  return res.redirect(authUrl);
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code || typeof code !== 'string') {
    return res.status(400).send('Missing code parameter');
  }
  const userId = requireUserId(req);

  try {
    const tokens = await exchangeCodeForTokens(code);
    const expiry = new Date(Date.now() + tokens.expires_in * 1000);
    await saveGmailTokens({
      userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiry
    });

    return res.send('Gmail connected successfully. You can close this window.');
  } catch (error) {
    console.error('Failed to exchange Gmail code', error);
    return res.status(500).send('Failed to connect Gmail.');
  }
});

router.get('/threads', async (req, res) => {
  const maxResults = parseInt(req.query.limit as string, 10) || 20;
  const importanceOnly = req.query.importance_only === 'true';
  const lookbackHours = parseInt(req.query.hours as string, 10) || DEFAULT_LOOKBACK_HOURS;
  const startDate = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const userId = requireUserId(req);
  try {
    const { threads } = await fetchRecentThreads(userId, maxResults, {
      importanceOnly,
      startDate: formatDateForQuery(startDate)
    });
    const importantCount = threads.filter((thread) => (thread.importanceScore ?? 0) >= 0).length;
    const promoCount = threads.length - importantCount;
    return res.json({
      threads,
      meta: {
        total: threads.length,
        important: importantCount,
        promotions: promoCount,
        lookbackHours
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === NO_GMAIL_TOKENS) {
      return res.status(401).json({ error: 'Gmail not connected' });
    }
    console.error('Failed to fetch Gmail threads', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

router.get('/status', async (req, res) => {
  const userId = requireUserId(req);
  try {
    const profile = await getGmailProfile(userId);
    return res.json({ connected: true, email: profile.email, avatarUrl: profile.avatarUrl, name: profile.name });
  } catch (error) {
    if (error instanceof Error && error.message === NO_GMAIL_TOKENS) {
      return res.json({ connected: false });
    }
    console.error('Failed to fetch Gmail status', error);
    return res.json({ connected: false });
  }
});

router.post('/disconnect', async (req, res) => {
  const userId = requireUserId(req);
  try {
    const tokens = await getGmailTokens(userId);
    if (tokens?.accessToken) {
      await revokeToken(tokens.accessToken);
    } else if (tokens?.refreshToken) {
      await revokeToken(tokens.refreshToken);
    }
    await deleteGmailTokens(userId);
    return res.json({ status: 'disconnected' });
  } catch (error) {
    console.error('Failed to disconnect Gmail', error);
    return res.status(500).json({ error: 'Failed to disconnect Gmail' });
  }
});

router.post('/threads/full-sync', async (req, res) => {
  const { startDate, endDate } = req.body as { startDate?: string; endDate?: string };
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  if (diffMs <= 0 || diffMs > oneYearMs) {
    return res.status(400).json({ error: 'Window must be positive and at most 1 year' });
  }

  const userId = requireUserId(req);
  try {
    let pageToken: string | undefined;
    let synced = 0;
    const categoryCounts: Record<string, number> = {};
    do {
      const result = await fetchRecentThreads(userId, 1000, {
        maxResults: 1000,
        startDate,
        endDate,
        importanceOnly: false,
        pageToken
      });
      synced += result.threads.length;
      pageToken = result.nextPageToken;
      Object.entries(result.counts).forEach(([category, count]) => {
        categoryCounts[category] = (categoryCounts[category] || 0) + count;
      });
      console.log(`[Gmail Sync] fetched ${result.threads.length} threads (categories:`, result.counts, ')');
    } while (pageToken);

    return res.json({ synced, categories: categoryCounts });
  } catch (error) {
    if (error instanceof Error && error.message === NO_GMAIL_TOKENS) {
      return res.status(401).json({ error: 'Gmail not connected' });
    }
    console.error('Full sync failed', error);
    return res.status(500).json({ error: 'Failed to sync Gmail threads' });
  }
});

export default router;

router.post('/threads/cleanup', async (req, res) => {
  const userId = requireUserId(req);
  try {
    await removeExpiredGmailThreads(userId);
    return res.json({ status: 'ok' });
  } catch (error) {
    console.error('Gmail cleanup failed', error);
    return res.status(500).json({ error: 'Failed to cleanup Gmail threads' });
  }
});

router.post('/threads/search', async (req, res) => {
  const { query, limit } = req.body as { query?: string; limit?: number };
  if (!query) {
    return res.status(400).json({ error: 'query is required' });
  }
  const userId = requireUserId(req);
  try {
    const embedding = await embedEmailText(query);
    const matches = await searchGmailEmbeddings({ userId, embedding, limit: limit ?? 5 });
    return res.json({ threads: matches });
  } catch (error) {
    console.error('Semantic gmail search failed', error);
    if (error instanceof Error && error.message === NO_GMAIL_TOKENS) {
      return res.status(401).json({ error: 'Gmail not connected' });
    }
    return res.status(500).json({ error: 'Failed to search Gmail' });
  }
});

router.get('/threads/:threadId', async (req, res) => {
  const threadId = req.params.threadId;
  const userId = requireUserId(req);
  try {
    const detail = await fetchThreadBody(userId, threadId);
    return res.json(detail);
  } catch (error) {
    if (error instanceof Error && error.message === 'Thread not found') {
      return res.status(404).json({ error: 'Thread not found' });
    }
    if (error instanceof Error && error.message === NO_GMAIL_TOKENS) {
      return res.status(401).json({ error: 'Gmail not connected' });
    }
    console.error('Failed to fetch Gmail thread body', error);
    return res.status(500).json({ error: 'Failed to fetch Gmail thread' });
  }
});
