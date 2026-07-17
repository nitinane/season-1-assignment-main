/**
 * Agent 4 — Resume Scorer
 *
 * Per PROJECT_SPEC.md §2 & Prompt 2:
 *   - Input : resume_text from an `applications` row + the linked job's JD data
 *   - Output JSON:
 *       { match_score: int (0-100), matched_skills: string[],
 *         missing_skills: string[], reasoning: string, advantage_notes: string }
 *   - Temperature : 0.1
 *   - Inline scoring rubric: 90-100 exceptional, 70-89 strong, 50-69 partial, <50 weak
 *   - On success: updates the `applications` row:
 *       score = match_score, score_reasoning = JSON.stringify(output),
 *       status = "scored"
 *   - Follows the same {success, data/error} contract as Agent 1
 *
 * Does NOT touch Agents 1, 2, 3, 5-9.
 */

import Groq from 'groq-sdk';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../services/authService';
import type { Application } from './applicationIngestorAgent';
import { notifyShortlistedCandidate } from './shortlistNotifierAgent';
import { generateInterviewQuestionsForApplication } from './questionGeneratorAgent';
import { notify_hr } from '../services/notificationService';


// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScorerOutput {
  match_score: number;       // 0-100
  matched_skills: string[];
  missing_skills: string[];
  reasoning: string;
  advantage_notes: string;
}

export interface ScorerSuccess {
  success: true;
  data: ScorerOutput;
  applicationId: string;
}

export interface ScorerFailure {
  success: false;
  error: string;
  raw_response?: string;
  applicationId?: string;
}

export type ScorerResult = ScorerSuccess | ScorerFailure;

/** Internal result type for the LLM-only scorer (no applicationId) */
export type InnerScorerResult =
  | { success: true; data: ScorerOutput }
  | { success: false; error: string; raw_response?: string };

// Minimal JD shape that Agent 4 needs (from job_roles table)
export interface JDForScoring {
  title: string;
  description?: string;
  required_skills: string[] | string;
  preferred_tools?: string[] | string;
  experience_level?: string;
}

// ─── Groq Client ──────────────────────────────────────────────────────────────

const groqClient = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY || import.meta.env.GROQ_API_KEY || '',
  dangerouslyAllowBrowser: true,
});

const MODEL = 'llama-3.3-70b-versatile';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise skills/tools field which may be stored as array or comma string. */
function normaliseList(value: string[] | string | undefined | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Strip markdown fences before JSON.parse().
 * Reuses the same pattern established in jdGeneratorAgent.
 */
function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

/**
 * Validate required fields on the scored output.
 * Throws a descriptive error if validation fails.
 */
export function validateScorerOutput(parsed: unknown): asserts parsed is ScorerOutput {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Response is not a JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.match_score !== 'number' || obj.match_score < 0 || obj.match_score > 100) {
    throw new Error('Validation failed: "match_score" must be a number between 0 and 100');
  }
  if (!Array.isArray(obj.matched_skills)) {
    throw new Error('Validation failed: "matched_skills" must be an array');
  }
  if (!Array.isArray(obj.missing_skills)) {
    throw new Error('Validation failed: "missing_skills" must be an array');
  }
  if (typeof obj.reasoning !== 'string' || obj.reasoning.trim() === '') {
    throw new Error('Validation failed: "reasoning" is missing or empty');
  }
  if (typeof obj.advantage_notes !== 'string') {
    throw new Error('Validation failed: "advantage_notes" must be a string');
  }
}

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert Applicant Tracking System that objectively scores resumes against job descriptions.

Evaluate the provided resume against the job description and return a score with detailed analysis.

SCORING RUBRIC (you MUST follow this exactly):
- 90-100  EXCEPTIONAL  — Candidate exceeds all requirements; rare, outstanding fit
- 70-89   STRONG       — Candidate meets most requirements with minor gaps
- 50-69   PARTIAL      — Candidate meets some requirements but has notable gaps
- 0-49    WEAK         — Candidate does not adequately meet the requirements

Return ONLY JSON, no markdown fences, no explanations, no extra text.

The JSON MUST match this exact schema:
{
  "match_score": number (0-100, integer),
  "matched_skills": ["skill that candidate has and job requires"],
  "missing_skills": ["skill the job requires but candidate lacks"],
  "reasoning": "2-4 sentence explanation of the score referencing specific evidence from the resume",
  "advantage_notes": "any unique strengths, standout projects, or competitive advantages — empty string if none"
}

Rules:
- Be objective. Base score strictly on evidence in the resume vs job requirements
- "matched_skills" only lists skills explicitly evidenced in the resume
- "missing_skills" only lists required skills absent from the resume
- "reasoning" must reference the rubric tier (e.g. "This is a STRONG match because...")
- Return ONLY valid JSON`;

// ─── Agent Function ───────────────────────────────────────────────────────────

/**
 * Agent 4: Resume Scorer (core LLM function)
 *
 * @param resumeText   Extracted text from the candidate's resume
 * @param jd           The structured job description to score against
 * @returns            ScorerOutput if success, or error details
 */
export async function runResumeScorerAgent(
  resumeText: string,
  jd: JDForScoring
): Promise<InnerScorerResult> {
  let raw = '';

  try {
    if (!resumeText || resumeText.trim().length < 20) {
      throw new Error('resume_text is too short or empty');
    }
    if (!jd.title || !jd.required_skills) {
      throw new Error('JD must include title and required_skills');
    }

    const requiredSkills = normaliseList(jd.required_skills);
    const preferredTools = normaliseList(jd.preferred_tools);

    const userPrompt = [
      `JOB TITLE: ${jd.title}`,
      `EXPERIENCE LEVEL: ${jd.experience_level || 'Not specified'}`,
      `REQUIRED SKILLS: ${requiredSkills.join(', ') || 'Not specified'}`,
      preferredTools.length ? `PREFERRED TOOLS: ${preferredTools.join(', ')}` : '',
      jd.description ? `JOB DESCRIPTION:\n${jd.description}` : '',
      '',
      `RESUME TEXT (first 4000 characters):`,
      resumeText.slice(0, 4000),
    ]
      .filter(Boolean)
      .join('\n');

    const response = await groqClient.chat.completions.create({
      model: MODEL,
      temperature: 0.1,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });

    raw = response.choices[0]?.message?.content?.trim() ?? '';

    const cleaned = stripMarkdownFences(raw);
    const parsed = JSON.parse(cleaned);

    validateScorerOutput(parsed);

    // Clamp score to 0-100 (safety net)
    parsed.match_score = Math.max(0, Math.min(100, Math.round(parsed.match_score)));

    return { success: true, data: parsed as ScorerOutput };
  } catch (e) {
    if (e instanceof SyntaxError) {
      return { success: false, error: `JSON parse error: ${e.message}`, raw_response: raw };
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      raw_response: raw || undefined,
    };
  }
}

// ─── DB update helper ─────────────────────────────────────────────────────────

/**
 * Update an `applications` row after scoring.
 * Sets score, score_reasoning (full JSON), status = "scored".
 */
export async function updateApplicationScore(
  applicationId: string,
  scorerOutput: ScorerOutput
): Promise<Application> {
  const hr_user_id = await getCurrentUser();

  const { data, error } = await supabase
    .from('applications')
    .update({
      score: scorerOutput.match_score,
      score_reasoning: JSON.stringify(scorerOutput),
      status: 'scored',
    })
    .eq('id', applicationId)
    .eq('hr_user_id', hr_user_id) // RLS guard at query level too
    .select()
    .single();

  if (error) throw error;
  return data as Application;
}

// ─── Fetch JD helper ──────────────────────────────────────────────────────────

/**
 * Fetch a job_roles row from Supabase to use as the JD for scoring.
 */
export async function fetchJobForScoring(jobId: string): Promise<JDForScoring> {
  const hr_user_id = await getCurrentUser();

  const { data, error } = await supabase
    .from('job_roles')
    .select('title, description, required_skills, preferred_tools, experience_level')
    .eq('id', jobId)
    .eq('hr_user_id', hr_user_id)
    .single();

  if (error) throw new Error(`Could not fetch job ${jobId}: ${error.message}`);
  return data as JDForScoring;
}

// ─── End-to-end: Score one application ───────────────────────────────────────

/**
 * Full pipeline for Agent 4:
 *   1. Fetch the application row
 *   2. Fetch the linked job's JD
 *   3. Run the LLM scorer
 *   4. Update the applications row → status="scored"
 *
 * @param applicationId  UUID of the row in the `applications` table
 */
export async function scoreApplication(applicationId: string): Promise<ScorerResult> {
  try {
    const hr_user_id = await getCurrentUser();

    // 1. Fetch the application row
    const { data: app, error: appErr } = await supabase
      .from('applications')
      .select('*')
      .eq('id', applicationId)
      .eq('hr_user_id', hr_user_id)
      .single();

    if (appErr || !app) {
      return { success: false, error: `Application not found: ${appErr?.message}`, applicationId };
    }

    // 2. Fetch the linked job
    const jd = await fetchJobForScoring(app.job_id);

    // 3. Run the LLM agent
    const agentResult = await runResumeScorerAgent(app.resume_text, jd);

    if (!agentResult.success) {
      return { success: false, error: agentResult.error, applicationId };
    }

    // 4. Update the DB row
    await updateApplicationScore(applicationId, agentResult.data);

    // Trigger Agent 9 notification
    notify_hr(
      hr_user_id,
      'score_ready',
      `Resume score ready for "${app.candidate_name}": ${agentResult.data.match_score}/100`
    ).catch(console.error);

    // 5. Trigger Post-Scoring Pipeline (Agent 5 + Agent 6) if score >= 70
    if (agentResult.data.match_score >= 70) {
      try {
        console.log(`[Score Pipeline] Score is ${agentResult.data.match_score} >= 70. Triggering shortlist notifier (Agent 5)…`);
        await notifyShortlistedCandidate(applicationId);
      } catch (err) {
        console.error("[Score Pipeline] Shortlist notifier failed:", err);
      }

      try {
        console.log(`[Score Pipeline] Score is ${agentResult.data.match_score} >= 70. Triggering question generator (Agent 6)…`);
        await generateInterviewQuestionsForApplication(applicationId);
      } catch (err) {
        console.error("[Score Pipeline] Question generator failed:", err);
      }
    }

    return { success: true, data: agentResult.data, applicationId };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      applicationId,
    };
  }
}

/**
 * Convenience: score ALL unscored applications for a given job.
 * Returns an array of results (one per application).
 */
export async function scoreAllPendingForJob(jobId: string): Promise<ScorerResult[]> {
  const hr_user_id = await getCurrentUser();

  const { data: apps, error } = await supabase
    .from('applications')
    .select('id')
    .eq('job_id', jobId)
    .eq('hr_user_id', hr_user_id)
    .eq('status', 'ingested');

  if (error) throw error;
  if (!apps || apps.length === 0) return [];

  const results: ScorerResult[] = [];
  for (const app of apps) {
    const result = await scoreApplication(app.id);
    results.push(result);
    // Small delay to avoid Groq rate-limits
    await new Promise((r) => setTimeout(r, 1500));
  }
  return results;
}
