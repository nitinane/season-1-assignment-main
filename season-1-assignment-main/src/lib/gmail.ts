import type { GmailMessage } from '../types';
import { supabase } from './supabase';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ─── Token Helper ────────────────────────────────────────────────────────────
export async function getGmailToken() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.provider_token;
  
  // Debug logging as requested
  console.log("Current Gmail Session:", data.session);
  console.log("Extracted Provider Token:", token);

  if (!token) {
    throw new Error("Google provider token missing. Please log in with Google again.");
  }
  return token;
}

// ─── Verify Gmail connection ──────────────────────────────────────────────────
export async function checkGmailConnection(tokenOverride?: string): Promise<boolean> {
  try {
    const token = tokenOverride || await getGmailToken();
    const res = await fetch(`${GMAIL_API}/users/me/profile`, {
      headers: authHeader(token),
    });
    return res.ok;
  } catch (error) {
    console.error("Gmail connection check failed:", error);
    return false;
  }
}

// ─── Fetch email list within date range ───────────────────────────────────────
export async function fetchEmails(
  dateFrom: Date,
  dateTo: Date,
  tokenOverride?: string
): Promise<GmailMessage[]> {
  try {
    const token = tokenOverride || await getGmailToken();

    // Ensure dateTo is at the end of its day (23:59:59) for inclusive search
    const inclusiveDateTo = new Date(dateTo);
    inclusiveDateTo.setHours(23, 59, 59, 999);

    const afterTimestamp = Math.floor(dateFrom.getTime() / 1000);
    const beforeTimestamp = Math.floor(inclusiveDateTo.getTime() / 1000);
    
    // Search query as requested
    const query = `after:${afterTimestamp} before:${beforeTimestamp} has:attachment (filename:pdf OR filename:doc OR filename:docx OR resume OR cv)`;
    
    console.log('Gmail Search Query:', query);

    const listRes = await fetch(
      `${GMAIL_API}/users/me/messages?q=${encodeURIComponent(query)}&maxResults=100`,
      { headers: authHeader(token) }
    );

    if (!listRes.ok) {
      const err = await listRes.json();
      throw new Error(err.error?.message || 'Failed to fetch emails from Gmail');
    }

    const listData = await listRes.json();
    const messages: { id: string }[] = listData.messages || [];

    if (messages.length === 0) return [];

    // Fetch full message details in batches
    const fullMessages: GmailMessage[] = [];
    const batchSize = 10;

    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((m) =>
          fetch(`${GMAIL_API}/users/me/messages/${m.id}?format=full`, {
            headers: authHeader(token),
          }).then((r) => r.json())
        )
      );
      results.forEach((r) => {
        if (r.status === 'fulfilled') fullMessages.push(r.value as GmailMessage);
      });
    }

    return fullMessages;
  } catch (error) {
    console.error("Gmail fetch emails failed:", error);
    throw error;
  }
}

// ─── Extract sender info from message ────────────────────────────────────────
export function getSenderEmail(message: GmailMessage): string {
  const fromHeader = message.payload?.headers.find(
    (h) => h.name.toLowerCase() === 'from'
  );
  if (!fromHeader) return '';
  const match = fromHeader.value.match(/<(.+?)>/);
  return match ? match[1] : fromHeader.value;
}

export function getSubject(message: GmailMessage): string {
  const subjectHeader = message.payload?.headers.find(
    (h) => h.name.toLowerCase() === 'subject'
  );
  return subjectHeader?.value || '(No Subject)';
}

// ─── Find attachment parts recursively ───────────────────────────────────────
function findAttachmentParts(
  parts: NonNullable<NonNullable<GmailMessage['payload']>['parts']>
): Array<{ filename: string; mimeType: string; attachmentId: string; messageId?: string }> {
  const attachments: Array<{ filename: string; mimeType: string; attachmentId: string }> = [];

  for (const part of parts) {
    const mimeType = part.mimeType.toLowerCase();
    if (
      part.filename &&
      (mimeType.includes('pdf') ||
        mimeType.includes('word') ||
        mimeType.includes('document') ||
        part.filename.endsWith('.pdf') ||
        part.filename.endsWith('.docx') ||
        part.filename.endsWith('.doc')) &&
      part.body.attachmentId
    ) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        attachmentId: part.body.attachmentId,
      });
    }
    if (part.parts) {
      attachments.push(...findAttachmentParts(part.parts));
    }
  }

  return attachments;
}

// ─── Download attachment as Blob ──────────────────────────────────────────────
export async function downloadAttachment(
  messageId: string,
  attachmentId: string,
  tokenOverride?: string
): Promise<Blob | null> {
  try {
    const token = tokenOverride || await getGmailToken();
    const res = await fetch(
      `${GMAIL_API}/users/me/messages/${messageId}/attachments/${attachmentId}`,
      { headers: authHeader(token) }
    );

    if (!res.ok) return null;

    const data = await res.json();
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
    console.error("Gmail download attachment failed:", error);
    return null;
  }
}

// ─── Get all resume attachments from a message ───────────────────────────────
export async function getResumeAttachments(
  message: GmailMessage,
  tokenOverride?: string
): Promise<Array<{ filename: string; blob: Blob; mimeType: string }>> {
  if (!message.payload?.parts) return [];

  const attachmentParts = findAttachmentParts(message.payload.parts);
  const results: Array<{ filename: string; blob: Blob; mimeType: string }> = [];

  for (const part of attachmentParts) {
    const blob = await downloadAttachment(message.id, part.attachmentId, tokenOverride);
    if (blob) {
      results.push({ filename: part.filename, blob, mimeType: part.mimeType });
    }
  }

  return results;
}

// ─── Send shortlist email ─────────────────────────────────────────────────────
export async function sendShortlistEmail(
  toEmail: string,
  candidateName: string,
  jobRole: string,
  hrName: string,
  hrEmail: string,
  tokenOverride?: string
): Promise<boolean> {
  try {
    const token = tokenOverride || await getGmailToken();
    const subject = `🎉 Congratulations! You've been shortlisted — ${jobRole}`;
    const body = `Dear ${candidateName},

Congratulations! We are pleased to inform you that you have been shortlisted for the next round of interviews for the position of ${jobRole}.

Your profile stood out based on your skills, experience, and project work. We were impressed by your background and believe you could be a great fit for our team.

Our recruiting team will reach out to you shortly with details about the next steps, including the interview schedule and format.

In the meantime, if you have any questions, please feel free to reply to this email.

Best regards,
${hrName}
Talent Acquisition Team

---
This email was sent via HireFlow AI — AI-powered recruitment platform.`;

    const mimeMessage = [
      `From: ${hrName} <${hrEmail}>`,
      `To: ${toEmail}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      `MIME-Version: 1.0`,
      ``,
      body,
    ].join('\n');

    const encoded = btoa(unescape(encodeURIComponent(mimeMessage)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const res = await fetch(`${GMAIL_API}/users/me/messages/send`, {
      method: 'POST',
      headers: {
        ...authHeader(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded }),
    });

    return res.ok;
  } catch (error) {
    console.error("Gmail send shortlist email failed:", error);
    return false;
  }
}
