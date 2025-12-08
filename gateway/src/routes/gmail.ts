import { Router } from 'express';
import { getAuthUrl, exchangeCodeForTokens } from '../services/gmailOAuth';
import { saveGmailTokens } from '../services/db';
import { fetchRecentThreads, getGmailProfile, NO_GMAIL_TOKENS } from '../services/gmailClient';

const router = Router();
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

router.get('/connect', (req, res) => {
  const state = req.query.state?.toString() || 'pluto-dev';
  const authUrl = getAuthUrl(state);
  return res.redirect(authUrl);
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code || typeof code !== 'string') {
    return res.status(400).send('Missing code parameter');
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const expiry = new Date(Date.now() + tokens.expires_in * 1000);
    await saveGmailTokens({
      userId: TEST_USER_ID,
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
  try {
    const threads = await fetchRecentThreads(TEST_USER_ID, maxResults, { importanceOnly });
    const importantCount = threads.filter((thread) => (thread.importanceScore ?? 0) >= 0).length;
    const promoCount = threads.length - importantCount;
    return res.json({
      threads,
      meta: {
        total: threads.length,
        important: importantCount,
        promotions: promoCount
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

router.get('/status', async (_req, res) => {
  try {
    const profile = await getGmailProfile(TEST_USER_ID);
    return res.json({ connected: true, email: profile.email, avatarUrl: profile.avatarUrl });
  } catch (error) {
    if (error instanceof Error && error.message === NO_GMAIL_TOKENS) {
      return res.json({ connected: false });
    }
    console.error('Failed to fetch Gmail status', error);
    return res.json({ connected: false });
  }
});

export default router;
