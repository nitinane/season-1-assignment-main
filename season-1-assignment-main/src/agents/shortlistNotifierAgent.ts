/**
 * Agent 5 — Shortlist Notifier
 * 
 * Contract:
 *   - Input: candidate meta (name, email), job role details, HR info
 *   - Output JSON: { "subject": string, "body": string }
 *   - Temperature: 0.6
 *   - Send via Gmail API
 *   - On success: update application status to "shortlisted"
 */

import Groq from 'groq-sdk';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../services/authService';
import { sendGmail } from '../lib/gmail';
import { notify_hr } from '../services/notificationService';

export interface EmailOutput {
  subject: string;
  body: string;
}

export interface Agent5Result {
  success: boolean;
  email?: EmailOutput;
  error?: string;
}

const groqClient = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY || import.meta.env.GROQ_API_KEY || '',
  dangerouslyAllowBrowser: true,
});

const MODEL = 'llama-3.3-70b-versatile';

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function validateEmailOutput(parsed: any): asserts parsed is EmailOutput {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Response is not a JSON object');
  }
  if (typeof parsed.subject !== 'string' || parsed.subject.trim() === '') {
    throw new Error('Validation failed: "subject" is missing or empty');
  }
  if (typeof parsed.body !== 'string' || parsed.body.trim() === '') {
    throw new Error('Validation failed: "body" is missing or empty');
  }
}

const SYSTEM_PROMPT = `You are a warm and professional talent acquisition specialist.
Given the candidate's name, the job title they applied for, and the HR recruiter's name, generate a warm, welcoming, and personalized shortlist notification email.

Rules:
- The email must be sent under the company's name or on behalf of the Talent Acquisition team.
- Do NOT mention anything about specific technical interview questions, grading criteria, or internal scores.
- Keep it encouraging, inviting, and professional.
- Ask them to look forward to scheduling the next round.
- Return ONLY JSON. Do not include markdown code fences, conversational preambles, or post-scripts.

The JSON MUST match this exact schema:
{
  "subject": "string — a compelling, professional subject line",
  "body": "string — the complete personalized email body (use proper spacing and line breaks, sign off as the HR recruiter or Talent Acquisition Team)"
}`;

export async function runShortlistNotifierAgent(
  candidateName: string,
  jobTitle: string,
  hrName: string
): Promise<EmailOutput> {
  const userPrompt = `Candidate Name: ${candidateName}\nJob Title: ${jobTitle}\nHR Recruiter Name: ${hrName}`;

  const response = await groqClient.chat.completions.create({
    model: MODEL,
    temperature: 0.6,
    max_tokens: 1000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '';
  const cleaned = stripMarkdownFences(raw);
  const parsed = JSON.parse(cleaned);

  validateEmailOutput(parsed);
  return parsed;
}

/**
 * Executes Agent 5 end-to-end:
 *   1. Generates the custom email via Groq
 *   2. Sends the email via Gmail API
 *   3. Updates the application status to "shortlisted"
 */
export async function notifyShortlistedCandidate(
  applicationId: string,
  tokenOverride?: string
): Promise<Agent5Result> {
  try {
    const hr_user_id = await getCurrentUser();

    // Fetch the application and associated job role
    const { data: app, error: appErr } = await supabase
      .from('applications')
      .select('*, job_roles:job_id(*)')
      .eq('id', applicationId)
      .eq('hr_user_id', hr_user_id)
      .single();

    if (appErr || !app) {
      return { success: false, error: `Application not found: ${appErr?.message || 'Unknown error'}` };
    }

    const job = app.job_roles;
    if (!job) {
      return { success: false, error: 'Associated job role not found' };
    }

    // Get current HR user profile or metadata
    const { data: { session } } = await supabase.auth.getSession();
    const hrName = session?.user?.user_metadata?.full_name || 'Talent Acquisition Team';

    // 1. Generate the shortlist email using Groq
    const emailOutput = await runShortlistNotifierAgent(
      app.candidate_name,
      job.title,
      hrName
    );

    // 2. Send via Gmail API
    const sent = await sendGmail(
      app.candidate_email,
      emailOutput.subject,
      emailOutput.body,
      tokenOverride
    );

    if (!sent) {
      return { success: false, error: 'Gmail API failed to send the email' };
    }

    // 3. Update application status in DB
    const { error: updateErr } = await supabase
      .from('applications')
      .update({ status: 'shortlisted' })
      .eq('id', applicationId)
      .eq('hr_user_id', hr_user_id);

    if (updateErr) {
      return { success: false, error: `DB status update to shortlisted failed: ${updateErr.message}` };
    }

    // Trigger Agent 9 notification
    notify_hr(
      hr_user_id,
      'shortlist_email_sent',
      `Shortlist email sent to "${app.candidate_name}" for position "${job.title}"`
    ).catch(console.error);

    // Optional: Log email to sent_emails for audit trail
    await supabase.from('sent_emails').insert({
      candidate_id: null,
      hr_user_id,
      status: 'sent',
      sent_at: new Date().toISOString(),
      email_body: `Subject: ${emailOutput.subject}\n\n${emailOutput.body}`
    });

    return { success: true, email: emailOutput };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
