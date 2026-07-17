/**
 * Agent 8 — Hiring Decision Mailer
 * 
 * Contract:
 *   - Input: candidate name, job title, recruiter name, result ("pass" | "fail"), optional notes
 *   - Output JSON: { "subject": string, "body": string }
 *   - Temperature: 0.5
 *   - If pass: Generate offer email with literal placeholder [[TO BE FILLED BY HR BEFORE SENDING]] for compensation/terms
 *   - If fail: Generate respectful rejection email
 *   - Review Screen: Not auto-sent, returned to HR for review and manual edit before sending
 *   - On send success: Update application status to "hired" or "rejected"
 */

import { get_groq_client, SMALL_MODEL } from '../lib/groq';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../services/authService';
import { sendGmail } from '../lib/gmail';
import { notify_hr } from '../services/notificationService';

export interface DecisionEmailOutput {
  subject: string;
  body: string;
}

export interface Agent8Result {
  success: boolean;
  email?: DecisionEmailOutput;
  error?: string;
}

// Shared Groq client and model config

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function validateDecisionEmailOutput(parsed: any, result: 'pass' | 'fail'): asserts parsed is DecisionEmailOutput {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Response is not a JSON object');
  }
  if (typeof parsed.subject !== 'string' || parsed.subject.trim() === '') {
    throw new Error('Validation failed: "subject" is missing or empty');
  }
  if (typeof parsed.body !== 'string' || parsed.body.trim() === '') {
    throw new Error('Validation failed: "body" is missing or empty');
  }

  // If result is pass (offer), verify the placeholder is verbatim in the body
  if (result === 'pass') {
    const placeholder = '[[TO BE FILLED BY HR BEFORE SENDING]]';
    if (!parsed.body.includes(placeholder)) {
      throw new Error(`Validation failed: Offer email body must contain the verbatim placeholder "${placeholder}" for compensation and terms`);
    }
  }
}

const SYSTEM_PROMPT_PASS = `You are a professional talent acquisition lead.
Generate a warm, enthusiastic job offer email to a candidate who has passed the interviews.

Rules:
- The email must express excitement about having them join the team for the specified job role.
- IMPORTANT: You MUST leave the compensation, salary, benefits, start date, and specific contract terms section as the literal placeholder text "[[TO BE FILLED BY HR BEFORE SENDING]]".
- Do NOT generate any realistic numbers, figures, or speculative contract terms.
- Return ONLY JSON. Do not include markdown code fences, conversational preambles, or post-scripts.

The JSON MUST match this exact schema:
{
  "subject": "string — clear, exciting subject line (e.g. 'Job Offer: [Role] at [Company]')",
  "body": "string — complete personalized email body (use proper spacing and line breaks, sign off as the HR recruiter or Talent Acquisition Team, and must include '[[TO BE FILLED BY HR BEFORE SENDING]]' for salary/terms)"
}`;

const SYSTEM_PROMPT_FAIL = `You are a respectful and compassionate talent acquisition specialist.
Generate a polite, respectful, and constructive rejection email for a candidate who did not pass the final interview stage.

Rules:
- Thank the candidate sincerely for their time, effort, and interest in the company and specified job role.
- Be encouraging and professional, keeping the door open for future opportunities.
- Incorporate any constructive, polite points from the HR interview notes if provided.
- Return ONLY JSON. Do not include markdown code fences, conversational preambles, or post-scripts.

The JSON MUST match this exact schema:
{
  "subject": "string — professional subject line (e.g. 'Application Update: [Role]')",
  "body": "string — complete personalized rejection email body (use proper spacing and line breaks, sign off as the Talent Acquisition Team)"
}`;

export async function runHiringDecisionMailerAgent(
  candidateName: string,
  jobTitle: string,
  hrName: string,
  result: 'pass' | 'fail',
  notes: string = ''
): Promise<DecisionEmailOutput> {
  const userPrompt = `Candidate Name: ${candidateName}\nJob Title: ${jobTitle}\nHR Recruiter Name: ${hrName}\nInterview Performance Notes: ${notes}`;

  const systemPrompt = result === 'pass' ? SYSTEM_PROMPT_PASS : SYSTEM_PROMPT_FAIL;

  const client = get_groq_client();
  const response = await client.chat.completions.create({
    model: SMALL_MODEL,
    temperature: 0.5,
    max_tokens: 1000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '';
  const cleaned = stripMarkdownFences(raw);
  const parsed = JSON.parse(cleaned);

  // If pass, let's make sure that if the model didn't include the placeholder, we force it in.
  // But our prompt should force it. We'll run the validation.
  validateDecisionEmailOutput(parsed, result);
  return parsed;
}

/**
 * Stage 1: Generate the draft email for HR review (does NOT send).
 */
export async function draftDecisionEmail(
  applicationId: string,
  result: 'pass' | 'fail',
  notes: string = ''
): Promise<Agent8Result> {
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

    const { data: { session } } = await supabase.auth.getSession();
    const hrName = session?.user?.user_metadata?.full_name || 'Talent Acquisition Team';

    const emailOutput = await runHiringDecisionMailerAgent(
      app.candidate_name,
      job.title,
      hrName,
      result,
      notes
    );

    return { success: true, email: emailOutput };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Stage 2: Send the finalized, reviewed/edited email via Gmail API and update application status.
 */
export async function sendDecisionEmail(
  applicationId: string,
  result: 'pass' | 'fail',
  subject: string,
  body: string,
  tokenOverride?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const hr_user_id = await getCurrentUser();

    // Fetch the application
    const { data: app, error: appErr } = await supabase
      .from('applications')
      .select('candidate_name, candidate_email, job_roles:job_id(title)')
      .eq('id', applicationId)
      .eq('hr_user_id', hr_user_id)
      .single();

    if (appErr || !app) {
      return { success: false, error: `Application not found: ${appErr?.message || 'Unknown error'}` };
    }

    const job = app.job_roles as any;

    // Send the email via Gmail API
    const sent = await sendGmail(
      app.candidate_email,
      subject,
      body,
      tokenOverride
    );

    if (!sent) {
      return { success: false, error: 'Gmail API failed to send the decision email' };
    }

    // Update the application status to "hired" or "rejected"
    const newStatus = result === 'pass' ? 'hired' : 'rejected';
    const { error: appUpdateErr } = await supabase
      .from('applications')
      .update({ status: newStatus })
      .eq('id', applicationId)
      .eq('hr_user_id', hr_user_id);

    if (appUpdateErr) {
      return { success: false, error: `Failed to update application status: ${appUpdateErr.message}` };
    }

    // Trigger Agent 9 notification
    notify_hr(
      hr_user_id,
      'hiring_decision_sent',
      `Hiring decision "${newStatus.toUpperCase()}" processed for candidate "${app.candidate_name}" (${job?.title || 'Unknown Role'})`
    ).catch(console.error);

    // Log the sent email
    await supabase.from('sent_emails').insert({
      candidate_id: null,
      hr_user_id,
      status: 'sent',
      sent_at: new Date().toISOString(),
      email_body: `Subject: ${subject}\n\n${body}`
    });

    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
