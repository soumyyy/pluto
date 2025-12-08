import { Router } from 'express';
import { getAuthUrl, exchangeCodeForTokens } from '../services/gmailOAuth';
import { saveGmailTokens } from '../services/db';
import { fetchRecentThreads } from '../services/gmailClient';

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
  const maxResults = parseInt(req.query.limit as string, 10) || 5;
  try {
    const threads = await fetchRecentThreads(TEST_USER_ID, maxResults);
    return res.json({ threads });
  } catch (error) {
    console.error('Failed to fetch Gmail threads', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

export default router;
