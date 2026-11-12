// api/voice-save.ts
// Persists a voice screening result to the `voice_screenings` table.
// Server-only: uses SUPABASE_SERVICE_ROLE_KEY, never VITE_.

import { createClient } from '@supabase/supabase-js';
import { requireEnv, sendJson } from './_gnani.js';

type Answer = {
  question: unknown;
  transcript: unknown;
  scores: unknown;
  strengths: unknown;
  red_flags: unknown;
  summary: unknown;
};

type AnswerPayload = {
  question: string;
  transcript: string;
  scores: Record<string, number>;
  strengths: string[];
  red_flags: string[];
  summary: string;
};

const MAX_NAME = 80;
const MAX_ANSWERS = 10;
const MAX_TRANSCRIPT = 5000;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
  }

  if (!requireEnv(res, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], [])) return;

  // Read the JSON body (Vercel serverless provides req.body when Content-Type is JSON).
  // Fall back to reading the raw stream for compatibility with bodyParser: false.
  let body: unknown = req.body;
  if (body === undefined || (typeof body === 'string' && body.trim() === '')) {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON body.' });
    }
  }

  const input = body as {
    candidate_name?: unknown;
    role?: unknown;
    email?: unknown;
    job_id?: unknown;
    answers?: unknown;
  };

  // ── candidate_name ──────────────────────────────────────────────────────────
  if (
    typeof input.candidate_name !== 'string' ||
    input.candidate_name.trim().length === 0 ||
    input.candidate_name.trim().length > MAX_NAME
  ) {
    return sendJson(res, 400, {
      error: `Invalid candidate_name: must be a string between 1 and ${MAX_NAME} characters.`,
    });
  }
  const candidate_name = input.candidate_name.trim();

  // ── role (optional) ───────────────────────────────────────────────────────
  const role =
    typeof input.role === 'string' && input.role.trim()
      ? input.role.trim()
      : null;

  // ── email (optional) ──────────────────────────────────────────────────────
  let email: string | null = null;
  if (input.email !== undefined && input.email !== null) {
    if (typeof input.email !== 'string') {
      return sendJson(res, 400, { error: 'Invalid email: must be a string.' });
    }
    const trimmed = input.email.trim();
    if (trimmed.length > 0) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (trimmed.length > 120 || !emailRegex.test(trimmed)) {
        return sendJson(res, 400, {
          error: 'Invalid email: must be a valid email format up to 120 characters.',
        });
      }
      email = trimmed;
    }
  }

  // ── job_id (optional) ─────────────────────────────────────────────────────
  let job_id: string | null = null;
  if (input.job_id !== undefined && input.job_id !== null) {
    if (typeof input.job_id !== 'string') {
      return sendJson(res, 400, { error: 'Invalid job_id: must be a string.' });
    }
    const trimmed = input.job_id.trim();
    if (trimmed.length > 0) {
      if (trimmed.length > 40) {
        return sendJson(res, 400, {
          error: 'Invalid job_id: must be up to 40 characters.',
        });
      }
      job_id = trimmed;
    }
  }

  // ── answers ─────────────────────────────────────────────────────────────────
  if (!Array.isArray(input.answers) || input.answers.length === 0 || input.answers.length > MAX_ANSWERS) {
    return sendJson(res, 400, {
      error: `Invalid answers: must contain between 1 and ${MAX_ANSWERS} answers.`,
    });
  }

  const answers: AnswerPayload[] = [];

  for (const [idx, raw] of (input.answers as Answer[]).entries()) {
    const a = raw as Record<string, unknown>;

    // transcript: required, non-empty, under 5000 chars
    if (
      typeof a.transcript !== 'string' ||
      !a.transcript.trim() ||
      a.transcript.length > MAX_TRANSCRIPT
    ) {
      return sendJson(res, 400, {
        error: `Invalid transcript at answers[${idx}]: must be non-empty and under ${MAX_TRANSCRIPT} characters.`,
      });
    }

    // question: string (default to empty string if missing)
    const question = typeof a.question === 'string' ? a.question : '';

    // scores: object of numbers
    let scores: Record<string, number> = {};
    if (
      typeof a.scores === 'object' &&
      a.scores !== null &&
      !Array.isArray(a.scores)
    ) {
      for (const [k, v] of Object.entries(a.scores as Record<string, unknown>)) {
        if (typeof v === 'number') scores[k] = v;
      }
    }

    // strengths / red_flags: string arrays
    const strengths = Array.isArray(a.strengths)
      ? (a.strengths as unknown[]).filter((s): s is string => typeof s === 'string')
      : [];
    const red_flags = Array.isArray(a.red_flags)
      ? (a.red_flags as unknown[]).filter((s): s is string => typeof s === 'string')
      : [];

    const summary = typeof a.summary === 'string' ? a.summary : '';

    answers.push({
      question,
      transcript: a.transcript as string,
      scores,
      strengths,
      red_flags,
      summary,
    });
  }

  // ── overall ─────────────────────────────────────────────────────────────────
  const allScores: number[] = [];
  for (const ans of answers) {
    for (const v of Object.values(ans.scores)) allScores.push(v);
  }
  const average =
    allScores.length > 0
      ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10
      : 0;
  const recommendation: 'Advance' | 'Hold' | 'Reject' =
    average >= 7 ? 'Advance' : average >= 5 ? 'Hold' : 'Reject';

  const overall = { average, recommendation };

  // ── insert ──────────────────────────────────────────────────────────────────
  const supabase = createClient(
    (process.env.SUPABASE_URL ?? '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
    { auth: { persistSession: false } },
  );

  try {
    const { data, error } = await supabase
      .from('voice_screenings')
      .insert({ candidate_name, role, email, job_id, answers, overall })
      .select('id')
      .single();

    if (error) {
      // Never leak Supabase internals (keys, table structure) to the client.
      return sendJson(res, 502, {
        error: 'Failed to save screening.',
        details: undefined,
      });
    }

    return sendJson(res, 201, { id: data.id });
  } catch {
    return sendJson(res, 502, { error: 'Failed to save screening.' });
  }
}
