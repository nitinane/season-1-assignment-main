// api/apply.ts
// Handles job applications, runs ATS evaluation via LLM, and stores the application record.

import { sendJson } from './_gnani.js';
import { getDb } from './_db.js';
import { chatJson } from './_llm.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function parseBody(req: any): Promise<any> {
  let body = req.body;
  if (body === undefined || (typeof body === 'string' && body.trim() === '')) {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return null;
    }
  } else if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
  }

  const body = await parseBody(req);
  if (!body || typeof body !== 'object') {
    return sendJson(res, 400, { error: 'Invalid JSON body.' });
  }

  const { job_id, candidate_name, email, resume_text, consent } = body as {
    job_id?: unknown;
    candidate_name?: unknown;
    email?: unknown;
    resume_text?: unknown;
    consent?: unknown;
  };

  // ── Validation ──────────────────────────────────────────────────────────────
  if (consent !== true) {
    return sendJson(res, 400, { error: 'Consent is required to submit application.' });
  }

  if (typeof job_id !== 'string' || !UUID_REGEX.test(job_id.trim())) {
    return sendJson(res, 400, { error: 'Invalid job_id: must be a valid UUID.' });
  }

  if (
    typeof candidate_name !== 'string' ||
    candidate_name.trim().length < 1 ||
    candidate_name.trim().length > 80
  ) {
    return sendJson(res, 400, {
      error: 'Invalid candidate_name: must be between 1 and 80 characters.',
    });
  }

  if (
    typeof email !== 'string' ||
    email.trim().length > 120 ||
    !EMAIL_REGEX.test(email.trim())
  ) {
    return sendJson(res, 400, {
      error: 'Invalid email: must be a valid email format under 120 characters.',
    });
  }

  if (
    typeof resume_text !== 'string' ||
    resume_text.trim().length < 200 ||
    resume_text.trim().length > 20000
  ) {
    return sendJson(res, 400, {
      error: 'Invalid resume_text: must be between 200 and 20000 characters.',
    });
  }

  // ── Load the Job ────────────────────────────────────────────────────────────
  let db;
  try {
    db = getDb();
  } catch {
    return sendJson(res, 500, { error: 'Database misconfigured.' });
  }

  let job: { id: string; title: string; jd_text: string } | null = null;
  try {
    const { data, error } = await db
      .from('iv_jobs')
      .select('id, title, jd_text')
      .eq('id', job_id.trim())
      .single();

    if (error || !data) {
      return sendJson(res, 404, { error: 'Job not found.' });
    }
    job = data;
  } catch {
    return sendJson(res, 502, { error: 'Failed to load job.' });
  }

  // ── ATS Evaluation via LLM ──────────────────────────────────────────────────
  const messages = [
    {
      role: 'system',
      content:
        'You are an expert ATS (Applicant Tracking System) resume analyzer. Evaluate the candidate resume against the Job Description. You must return valid JSON only with the following structure: { "skills": string[], "ats": { "score": number, "matched_skills": string[], "missing_skills": string[], "summary": string } } where skills has max 15 items, score is between 0 and 100, and summary is up to 300 characters.',
    },
    {
      role: 'user',
      content: `Job Title: ${job.title}\n\nJob Description:\n${job.jd_text}\n\nCandidate Resume:\n${resume_text.trim()}\n\nEvaluate the resume and return only valid JSON matching the schema.`,
    },
  ];

  let skills: string[] = [];
  let ats: { score: number; matched_skills: string[]; missing_skills: string[]; summary: string } = {
    score: 0,
    matched_skills: [],
    missing_skills: [],
    summary: '',
  };
  let provider: 'evon' | 'groq' = 'groq';

  try {
    const llmResponse = await chatJson(messages, { temperature: 0.1 });
    provider = llmResponse.provider;
    const result = llmResponse.data;

    if (Array.isArray(result?.skills)) {
      skills = result.skills
        .filter((s: unknown) => typeof s === 'string' && s.trim().length > 0)
        .slice(0, 15);
    }

    const rawAts = result?.ats;
    const rawScore = typeof rawAts?.score === 'number' ? rawAts.score : 0;
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));

    const matched_skills = Array.isArray(rawAts?.matched_skills)
      ? rawAts.matched_skills.filter((s: unknown) => typeof s === 'string')
      : [];

    const missing_skills = Array.isArray(rawAts?.missing_skills)
      ? rawAts.missing_skills.filter((s: unknown) => typeof s === 'string')
      : [];

    const summary = typeof rawAts?.summary === 'string' ? rawAts.summary.trim().slice(0, 300) : '';

    ats = {
      score,
      matched_skills,
      missing_skills,
      summary,
    };
  } catch {
    return sendJson(res, 502, { error: 'Resume evaluation failed.' });
  }

  // ── Insert Application ──────────────────────────────────────────────────────
  try {
    const { data: inserted, error: insertError } = await db
      .from('iv_applications')
      .insert({
        job_id: job.id,
        candidate_name: candidate_name.trim(),
        email: email.trim(),
        resume_text: resume_text.trim(),
        resume_skills: skills,
        ats,
        status: 'applied',
        provider,
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      return sendJson(res, 502, { error: 'Failed to save application.' });
    }

    // Return ONLY { id } — never return ATS data to the caller
    return sendJson(res, 201, { id: inserted.id });
  } catch {
    return sendJson(res, 502, { error: 'Failed to save application.' });
  }
}

