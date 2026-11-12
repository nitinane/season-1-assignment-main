// api/voice-list.ts
// List voice screenings for the recruiter page. Server-only.
// Requires a valid x-recruiter-passcode header matching RECRUITER_PASSCODE.

import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { requireEnv, sendJson } from './_gnani.js';

function authorized(req: any): boolean {
  const expected = (process.env.RECRUITER_PASSCODE ?? '').trim();
  if (!expected) return false;
  const providedRaw = req.headers?.['x-recruiter-passcode'];
  const provided = typeof providedRaw === 'string' ? providedRaw.trim() : '';
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed. Use GET.' });
  }

  if (!authorized(req)) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  if (!requireEnv(res, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], [])) return;

  const supabase = createClient(
    (process.env.SUPABASE_URL ?? '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
    { auth: { persistSession: false } },
  );

  try {
    const { data, error } = await supabase
      .from('voice_screenings')
      .select('id, created_at, candidate_name, email, job_id, role, overall')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      return sendJson(res, 502, { error: 'Failed to list screenings.' });
    }

    return sendJson(res, 200, { items: data ?? [] });
  } catch {
    return sendJson(res, 502, { error: 'Failed to list screenings.' });
  }
}
