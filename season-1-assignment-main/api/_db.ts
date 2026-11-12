// api/_db.ts
// Shared database and recruiter authentication helpers.

import { timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sendJson } from './_gnani.js';

export function getDb(): SupabaseClient {
  const url = (process.env.SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) {
    throw new Error('Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export function requirePasscode(req: any, res: any): boolean {
  const expected = (process.env.RECRUITER_PASSCODE ?? '').trim();
  const rawHeader = req.headers?.['x-recruiter-passcode'];
  const provided = typeof rawHeader === 'string' ? rawHeader.trim() : '';

  if (!expected || !provided) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return false;
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return false;
  }

  return true;
}

