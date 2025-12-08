import { google } from 'googleapis';
import { config } from '../config';
import { getGmailTokens, saveGmailTokens, saveGmailThreads, GmailThreadRecord } from './db';

export const NO_GMAIL_TOKENS = 'NO_GMAIL_TOKENS';

export interface GmailThreadSummary extends GmailThreadRecord {
  link: string;
  sender?: string;
  importanceScore?: number;
  category?: string;
  labelIds?: string[];
}

async function getAuthorizedGmail(userId: string) {
  const tokens = await getGmailTokens(userId);
  if (!tokens) {
    const error = new Error(NO_GMAIL_TOKENS);
    error.name = NO_GMAIL_TOKENS;
    throw error;
  }

  const oauth2Client = new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri
  );

  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken
  });

  oauth2Client.on('tokens', async (newTokens) => {
    if (!newTokens.access_token) return;
    try {
      await saveGmailTokens({
        userId,
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token || tokens.refreshToken,
        expiry: newTokens.expiry_date ? new Date(newTokens.expiry_date) : tokens.expiry
      });
    } catch (error) {
      console.warn('Failed to persist refreshed Gmail tokens', error);
    }
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

interface ThreadFilters {
  importanceOnly?: boolean;
  maxResults?: number;
}

export async function fetchRecentThreads(
  userId: string,
  maxResults = 5,
  filters: ThreadFilters = {}
): Promise<GmailThreadSummary[]> {
  const gmail = await getAuthorizedGmail(userId);
  const fetchLimit = Math.min(filters.maxResults ?? maxResults ?? 5, 50);
  const threadList = await gmail.users.threads.list({ userId: 'me', maxResults: fetchLimit });
  const summaries: GmailThreadSummary[] = [];

  if (!threadList.data.threads) {
    return summaries;
  }

  for (const thread of threadList.data.threads) {
    if (!thread.id) continue;
    const detail = await gmail.users.threads.get({
      userId: 'me',
      id: thread.id,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'Date']
    });

    const lastMessage = detail.data.messages?.[detail.data.messages.length - 1];
    const headers = lastMessage?.payload?.headers || [];
    const subject = headers.find((h) => h.name === 'Subject')?.value || '(no subject)';
    const sender = headers.find((h) => h.name === 'From')?.value || 'Unknown sender';
    const snippet = detail.data.snippet || lastMessage?.snippet || '';
    const lastMessageAt = lastMessage?.internalDate
      ? new Date(Number(lastMessage.internalDate))
      : undefined;
    const labelIds = lastMessage?.labelIds || detail.data.messages?.[0]?.labelIds || [];
    const { importanceScore, category, isPromotional } = scoreThread(subject, snippet, sender, labelIds || []);

    if (filters.importanceOnly && isPromotional) {
      continue;
    }

    summaries.push({
      threadId: thread.id,
      subject,
      snippet,
      sender,
      category,
      importanceScore,
      labelIds,
      lastMessageAt: lastMessageAt ?? null,
      link: `https://mail.google.com/mail/u/0/#inbox/${thread.id}`
    });
  }

  try {
    await saveGmailThreads(userId, summaries);
  } catch (error) {
    console.warn('Failed to persist gmail threads', error);
  }
  return summaries;
}

export async function getGmailProfile(userId: string): Promise<{ email: string; avatarUrl: string }> {
  const gmail = await getAuthorizedGmail(userId);
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const email = profile.data.emailAddress || '';
  const avatarUrl = email
    ? `https://www.google.com/s2/photos/public/${encodeURIComponent(email)}?sz=96`
    : '';
  return { email, avatarUrl };
}

const PROMO_KEYWORDS = ['unsubscribe', 'sale', '% off', 'deal', 'promo', 'special offer'];
const IMPORTANT_KEYWORDS = ['invoice', 'meeting', 'urgent', 'action required', 'payment', 'schedule'];
const PROMO_LABELS = new Set([
  'CATEGORY_PROMOTIONS',
  'CATEGORY_SOCIAL',
  'CATEGORY_UPDATES',
  'CATEGORY_FORUMS'
]);

function scoreThread(subject: string, snippet: string, sender: string, labelIds: string[]) {
  let score = 0;
  let category = 'primary';
  let isPromotional = false;

  if (labelIds.some((label) => PROMO_LABELS.has(label))) {
    category = 'promotions';
    score -= 2;
    isPromotional = true;
  }

  const lowered = (subject + ' ' + snippet).toLowerCase();
  if (IMPORTANT_KEYWORDS.some((keyword) => lowered.includes(keyword))) {
    score += 2;
  }
  if (PROMO_KEYWORDS.some((keyword) => lowered.includes(keyword))) {
    score -= 1;
    isPromotional = true;
  }
  if (/noreply|no-reply|notification/i.test(sender)) {
    score -= 1;
  }

  return { importanceScore: score, category, isPromotional };
}
