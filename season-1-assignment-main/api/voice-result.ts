// api/voice-result.ts
// Fetch a single voice screening row by id. Never list rows. Only UUID lookups allowed.

import { createClient } from '@supabase/supabase-js';
import { requireEnv, sendJson } from './_gnani.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed. Use GET.' });
  }

  if (!requireEnv(res, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], [])) return;

  const url = new URL(req.url ?? '', process.env.SUPABASE_URL ?? 'http://localhost');
  const idParam = url.searchParams.get('id');

  // Validate the id is a real UUID before touching the database.
  if (!idParam || !UUID_RE.test(idParam)) {
    return sendJson(res, 400, { error: 'Invalid or missing id parameter. Must be a UUID.' });
  }

  const supabase = createClient(
    (process.env.SUPABASE_URL ?? '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
    { auth: { persistSession: false } },
  );

  try {
    const { data, error } = await supabase
      .from('voice_screenings')
      .select()
      .eq('id', idParam)
      .single();

    if (error || !data) {
      return sendJson(res, 404, { error: 'Screening not found.' });
    }

    // Strip any internal fields and re-serialize so we never leak raw columns
    // that callers shouldn't see (e.g. relations they don't use).
    const safe = { ...data };
    delete safe.id; // clients get their own response shape anyway

    return sendJson(res, 200, safe);
  } catch {
    return sendJson(res, 502, { error: 'Failed to read screening.' });
  }
}
