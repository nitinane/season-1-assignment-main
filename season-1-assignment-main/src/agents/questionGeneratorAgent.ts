/**
 * Agent 6 — Question Generator
 * 
 * Contract:
 *   - Input: JD details + scored results (matched_skills, missing_skills, reasoning) from Agent 4
 *   - Output JSON: Array of 8 questions categorized as technical, behavioral, and gap-focused
 *   - Temperature: 0.7
 *   - Save to interviews table (create row if needed) — HR-only
 */

import Groq from 'groq-sdk';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../services/authService';

export interface GeneratedQuestion {
  category: 'technical' | 'behavioral' | 'gap-focused';
  question: string;
  difficulty: 'easy' | 'medium' | 'hard';
  skill?: string;
}

export interface Agent6Result {
  success: boolean;
  questions?: GeneratedQuestion[];
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

function validateQuestionsOutput(parsed: any): asserts parsed is GeneratedQuestion[] {
  if (!Array.isArray(parsed)) {
    throw new Error('Response is not a JSON array');
  }
  if (parsed.length !== 8) {
    throw new Error(`Validation failed: Expected exactly 8 questions, got ${parsed.length}`);
  }
  for (let i = 0; i < parsed.length; i++) {
    const q = parsed[i];
    if (typeof q.question !== 'string' || q.question.trim() === '') {
      throw new Error(`Validation failed: Question at index ${i} has empty "question" field`);
    }
    if (!['technical', 'behavioral', 'gap-focused'].includes(q.category)) {
      throw new Error(`Validation failed: Question at index ${i} has invalid category: ${q.category}`);
    }
    if (!['easy', 'medium', 'hard'].includes(q.difficulty)) {
      throw new Error(`Validation failed: Question at index ${i} has invalid difficulty: ${q.difficulty}`);
    }
  }
}

const SYSTEM_PROMPT = `You are a senior technical interviewer and assessment designer.
Generate exactly 8 high-quality interview questions for a candidate based on the job description and the recruiter's score/analysis of their resume.

The questions should be split into three categories:
1. "technical" (assessing matching core technical skills they possess)
2. "behavioral" (assessing culture fit, teamwork, and situation handling)
3. "gap-focused" (gently probing on missing skills or potential weaknesses identified)

Return ONLY a JSON array containing exactly 8 question objects. Do not include markdown code fences, conversational preambles, or post-scripts.

The JSON MUST match this exact schema:
[
  {
    "category": "technical" | "behavioral" | "gap-focused",
    "question": "string — the interview question text",
    "difficulty": "easy" | "medium" | "hard",
    "skill": "string — the specific skill or topic targeted (e.g. 'React state management')"
  }
]`;

export async function runQuestionGeneratorAgent(
  jobTitle: string,
  jobDescription: string,
  matchedSkills: string[],
  missingSkills: string[],
  reasoning: string
): Promise<GeneratedQuestion[]> {
  const userPrompt = `JOB TITLE: ${jobTitle}
JOB DESCRIPTION SUMMARY: ${jobDescription}
CANDIDATE MATCHED SKILLS: ${matchedSkills.join(', ')}
CANDIDATE MISSING SKILLS: ${missingSkills.join(', ')}
CANDIDATE ANALYSIS REASONING: ${reasoning}`;

  const response = await groqClient.chat.completions.create({
    model: MODEL,
    temperature: 0.7,
    max_tokens: 1500,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '';
  const cleaned = stripMarkdownFences(raw);
  const parsed = JSON.parse(cleaned);

  validateQuestionsOutput(parsed);
  return parsed;
}

/**
 * Executes Agent 6 end-to-end:
 *   1. Fetches application & scorer output (matched_skills, missing_skills, reasoning)
 *   2. Generates exactly 8 questions via Groq
 *   3. Saves/inserts them into the `interviews` table (with status "questions_ready")
 */
export async function generateInterviewQuestionsForApplication(
  applicationId: string
): Promise<Agent6Result> {
  try {
    const hr_user_id = await getCurrentUser();

    // Fetch application details, including the job role & scorer results
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

    if (!app.score_reasoning) {
      return { success: false, error: 'Application has not been scored yet (Agent 4 output missing)' };
    }

    let parsedScoring: any;
    try {
      parsedScoring = JSON.parse(app.score_reasoning);
    } catch {
      return { success: false, error: 'Failed to parse application score reasoning JSON' };
    }

    const matchedSkills = parsedScoring.matched_skills || [];
    const missingSkills = parsedScoring.missing_skills || [];
    const reasoning = parsedScoring.reasoning || '';

    // 1. Generate 8 questions using Groq LLM (temp 0.7)
    const questions = await runQuestionGeneratorAgent(
      job.title,
      job.description || '',
      matchedSkills,
      missingSkills,
      reasoning
    );

    // 2. Check if an interview row already exists for this application
    const { data: existingInterview } = await supabase
      .from('interviews')
      .select('id')
      .eq('application_id', applicationId)
      .eq('hr_user_id', hr_user_id)
      .maybeSingle();

    if (existingInterview) {
      // Update existing
      const { error: updateErr } = await supabase
        .from('interviews')
        .update({
          questions: JSON.stringify(questions),
          status: 'questions_ready'
        })
        .eq('id', existingInterview.id);

      if (updateErr) throw updateErr;
    } else {
      // Insert new
      const { error: insertErr } = await supabase
        .from('interviews')
        .insert({
          hr_user_id,
          application_id: applicationId,
          job_id: app.job_id,
          questions: JSON.stringify(questions),
          status: 'questions_ready'
        });

      if (insertErr) throw insertErr;
    }

    return { success: true, questions };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
