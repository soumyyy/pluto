import { Router } from 'express';
import { sendChat } from '../services/brainClient';
import { TEST_USER_ID, DEFAULT_CONVERSATION_ID } from '../constants';
import { getUserProfile } from '../services/db';

const router = Router();

function sanitizeProfile(profile: Record<string, unknown> | null) {
  if (!profile) return null;
  const cloned = JSON.parse(JSON.stringify(profile));
  if (cloned?.customData?.notes) {
    const seen = new Set<string>();
    const normalized: Array<{ text: string; timestamp: string | null }> = [];
    cloned.customData.notes.forEach((entry: any) => {
      if (!entry) return false;
      const text = typeof entry.text === 'string' ? entry.text : typeof entry === 'string' ? entry : null;
      if (!text) return;
      const timestamp =
        entry && typeof entry.timestamp === 'string'
          ? entry.timestamp
          : entry && entry.timestamp === null
            ? null
            : null;
      const key = `${text}-${timestamp ?? 'null'}`;
      if (seen.has(key)) return;
      seen.add(key);
      normalized.push({ text, timestamp });
    });
    cloned.customData.notes = normalized;
  }
  return cloned;
}

router.post('/', async (req, res) => {
  const { message, history } = req.body as {
    message?: string;
    history?: Array<{ role: string; content: string }>;
  };

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const profile = sanitizeProfile(await getUserProfile(TEST_USER_ID));
    const response = await sendChat({
      userId: TEST_USER_ID,
      conversationId: DEFAULT_CONVERSATION_ID,
      message,
      history,
      profile
    });

    return res.json(response);
  } catch (error) {
    console.error('Chat proxy failed', error);
    return res.status(502).json({ error: 'Failed to reach brain service' });
  }
});

export default router;
