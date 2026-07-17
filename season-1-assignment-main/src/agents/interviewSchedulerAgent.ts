/**
 * Agent 7 — Interview Scheduler
 * 
 * Contract:
 *   - Input: applicationId, scheduledAt (ISO string or date string)
 *   - Output JSON: { "subject": string, "body": string }
 *   - Temperature: 0.3
 *   - Update interviews row: scheduled_at, status="scheduled"
 *   - Send interview invite email via Gmail API
 *   - Update application status="interview_scheduled"
 */

import { get_groq_client, SMALL_MODEL } from '../lib/groq';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../services/authService';
import { sendGmail } from '../lib/gmail';
import { notify_hr } from '../services/notificationService';

export interface InviteEmailOutput {
  subject: string;
  body: string;
}

export interface Agent7Result {
  success: boolean;
  email?: InviteEmailOutput;
  error?: string;
}

// Shared Groq client and model config

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function validateInviteEmailOutput(parsed: any): asserts parsed is InviteEmailOutput {
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

const SYSTEM_PROMPT = `You are a professional talent acquisition scheduler.
Given the candidate's name, job title, scheduled date and time, and HR recruiter's name, generate a clear, welcoming, and professional interview invitation email.

Rules:
- The email must clearly confirm the job title, date, and time of the interview.
- Do NOT include any interview questions or question categories.
- Keep the tone welcoming, professional, and clear.
- Return ONLY JSON. Do not include markdown code fences, conversational preambles, or post-scripts.

The JSON MUST match this exact schema:
{
  "subject": "string — clear subject line including the job title",
  "body": "string — complete email body confirming the schedule and next steps (sign off as the HR recruiter or Talent Acquisition Team)"
}`;

export async function runInterviewSchedulerAgent(
  candidateName: string,
  jobTitle: string,
  scheduledTimeStr: string,
  hrName: string
): Promise<InviteEmailOutput> {
  const userPrompt = `Candidate Name: ${candidateName}\nJob Title: ${jobTitle}\nScheduled Interview Time: ${scheduledTimeStr}\nHR Recruiter Name: ${hrName}`;

  const client = get_groq_client();
  const response = await client.chat.completions.create({
    model: SMALL_MODEL,
    temperature: 0.3,
    max_tokens: 800,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '';
  const cleaned = stripMarkdownFences(raw);
  const parsed = JSON.parse(cleaned);

  validateInviteEmailOutput(parsed);
  return parsed;
}

/**
 * Executes Agent 7 end-to-end:
 *   1. Updates interviews row: scheduled_at = scheduledAt, status = "scheduled"
 *   2. Generates invite email using Groq (temp 0.3)
 *   3. Sends invite email via Gmail API
 *   4. Updates application status = "interview_scheduled"
 */
export async function scheduleInterview(
  applicationId: string,
  scheduledAt: string,
  tokenOverride?: string
): Promise<Agent7Result> {
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

    // 1. Update/Upsert the interview row
    const { data: existingInterview } = await supabase
      .from('interviews')
      .select('id')
      .eq('application_id', applicationId)
      .eq('hr_user_id', hr_user_id)
      .maybeSingle();

    if (existingInterview) {
      const { error: updateErr } = await supabase
        .from('interviews')
        .update({
          scheduled_at: scheduledAt,
          status: 'scheduled'
        })
        .eq('id', existingInterview.id);

      if (updateErr) throw updateErr;
    } else {
      const { error: insertErr } = await supabase
        .from('interviews')
        .insert({
          hr_user_id,
          application_id: applicationId,
          job_id: app.job_id,
          scheduled_at: scheduledAt,
          status: 'scheduled',
          questions: '[]' // default empty questions array if none generated
        });

      if (insertErr) throw insertErr;
    }

    // Format a friendly date string for the LLM prompt
    const friendlyDate = new Date(scheduledAt).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });

    // 2. Generate the interview invite email using Groq LLM (temp 0.3)
    const emailOutput = await runInterviewSchedulerAgent(
      app.candidate_name,
      job.title,
      friendlyDate,
      hrName
    );

    // 3. Send the invite email via Gmail API
    const sent = await sendGmail(
      app.candidate_email,
      emailOutput.subject,
      emailOutput.body,
      tokenOverride
    );

    if (!sent) {
      return { success: false, error: 'Gmail API failed to send the interview invitation email' };
    }

    // 4. Update the application status to "interview_scheduled"
    const { error: appUpdateErr } = await supabase
      .from('applications')
      .update({ status: 'interview_scheduled' })
      .eq('id', applicationId)
      .eq('hr_user_id', hr_user_id);

    if (appUpdateErr) {
      return { success: false, error: `Failed to update application status: ${appUpdateErr.message}` };
    }

    // Trigger Agent 9 notification
    notify_hr(
      hr_user_id,
      'interview_scheduled',
      `Interview scheduled for candidate "${app.candidate_name}" (${job.title}) at ${friendlyDate}`
    ).catch(console.error);

    // Log the sent email
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
