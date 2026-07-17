import { supabase } from '../lib/supabase';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';

export const sendShortlistEmail = async (
  toEmail: string,
  candidateName: string,
  jobRole: string,
  hrName: string,
  hrEmail: string
): Promise<boolean> => {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.provider_token;

    if (!token) throw new Error("Google token missing. Please sign in again.");

    const subject = `Congratulations! You've been shortlisted - ${jobRole}`;
    const body = `Dear ${candidateName},

We're pleased to inform you that you've been shortlisted for the position of ${jobRole}.
We'll be in touch soon with details about the next steps.

Best regards,
${hrName}
Talent Acquisition Team

---
Sent via HireFlow AI`;

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
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded }),
    });

    return res.ok;
  } catch (error) {
    console.error("Gmail send shortlist email failed:", error);
    return false;
  }
};
