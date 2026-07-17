import { supabase } from "../lib/supabase";
import type { GmailMessage } from '../types';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';

/**
 * SUPPORT: Date Filter / Resume Query building
 */
export const buildResumeQuery = (
  startUnix: number,
  endUnix: number
) => {
  return `after:${startUnix} before:${endUnix} has:attachment (filename:pdf OR filename:doc OR filename:docx OR resume OR cv)`;
};

/**
 * Base Gmail API wrapper with built-in 401/Unauthorized handling.
 */
const gmailFetch = async (endpoint: string, options: RequestInit = {}) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token =
    session?.provider_token ||
    session?.access_token ||
    null;

  console.log("Current Gmail Session:", session);
  console.log("Extracted Token:", token);

  if (!token) {
    throw new Error("Google token missing. Please log in again.");
  }

  const response = await fetch(`${GMAIL_API}/${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    throw new Error("Google token expired. Please sign in again.");
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Gmail API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
  }

  return await response.json();
};

/**
 * Fetches Gmail messages based on a query string.
 */
export const fetchEmails = async (query: string) => {
  try {
    const listData = await gmailFetch(`users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`);
    const messages: { id: string }[] = listData.messages || [];

    if (messages.length === 0) return [];

    // Fetch full message details in parallel batches
    const fullMessages: GmailMessage[] = [];
    const batchSize = 10;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((m) => gmailFetch(`users/me/messages/${m.id}?format=full`))
      );
      
      results.forEach((r) => {
        if (r.status === 'fulfilled') fullMessages.push(r.value);
      });
    }

    return fullMessages;
  } catch (error) {
    console.error("Gmail fetch failed:", error);
    throw error;
  }
};

/**
 * Downloads a Gmail attachment as a Blob.
 */
export const downloadAttachment = async (messageId: string, attachmentId: string): Promise<Blob | null> => {
  try {
    const data = await gmailFetch(`users/me/messages/${messageId}/attachments/${attachmentId}`);
    if (!data.data) return null;

    // Gmail returns URL-safe base64
    const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new Blob([bytes]);
  } catch (error) {
    console.error("Gmail service: downloadAttachment failed", error);
    return null;
  }
};

/**
 * Extracts sender email from message headers.
 */
export const getSenderEmail = (message: GmailMessage): string => {
  const fromHeader = message.payload?.headers.find((h) => h.name.toLowerCase() === 'from');
  if (!fromHeader) return '';
  const match = fromHeader.value.match(/<(.+?)>/);
  return match ? match[1] : fromHeader.value;
};

/**
 * Recursively find attachment parts (PDF/DOCX) in Gmail payload.
 */
export const findAttachmentParts = (parts: any[]): any[] => {
  const attachments: any[] = [];
  for (const part of parts) {
    const mimeType = part.mimeType.toLowerCase();
    const isAttachment = part.filename && (
      mimeType.includes('pdf') || mimeType.includes('word') || mimeType.includes('document') ||
      part.filename.endsWith('.pdf') || part.filename.endsWith('.docx') || part.filename.endsWith('.doc')
    );

    if (isAttachment && part.body.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        attachmentId: part.body.attachmentId
      });
    }
    if (part.parts) {
      attachments.push(...findAttachmentParts(part.parts));
    }
  }
  return attachments;
};

/**
 * Get all resume attachments from a message.
 */
export const getResumeAttachments = async (message: GmailMessage): Promise<Array<{ filename: string; blob: Blob; mimeType: string }>> => {
  if (!message.payload?.parts) return [];

  const attachmentParts = findAttachmentParts(message.payload.parts);
  const results: Array<{ filename: string; blob: Blob; mimeType: string }> = [];

  for (const part of attachmentParts) {
    const blob = await downloadAttachment(message.id, part.attachmentId);
    if (blob) {
      results.push({ filename: part.filename, blob, mimeType: part.mimeType });
    }
  }

  return results;
};
