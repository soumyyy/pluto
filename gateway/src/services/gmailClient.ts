import { google } from 'googleapis';
import { config } from '../config';
import { getGmailTokens, saveGmailTokens, saveGmailThreads, GmailThreadRecord } from './db';

export interface GmailThreadSummary extends GmailThreadRecord {
  link: string;
}

export async function fetchRecentThreads(userId: string, maxResults = 5): Promise<GmailThreadSummary[]> {
  const tokens = await getGmailTokens(userId);
  if (!tokens) {
    throw new Error('No Gmail tokens stored for this user. Connect Gmail first.');
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

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const threadList = await gmail.users.threads.list({ userId: 'me', maxResults });
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
    const snippet = detail.data.snippet || lastMessage?.snippet || '';
    const lastMessageAt = lastMessage?.internalDate
      ? new Date(Number(lastMessage.internalDate))
      : undefined;

    summaries.push({
      threadId: thread.id,
      subject,
      snippet,
      lastMessageAt: lastMessageAt ?? null,
      link: `https://mail.google.com/mail/u/0/#inbox/${thread.id}`
    });
  }

  await saveGmailThreads(userId, summaries);
  return summaries;
}
