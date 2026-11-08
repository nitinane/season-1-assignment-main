// api/jobs.ts
// Manage job postings with public read and passcode-protected write/toggle.

import { sendJson } from './_gnani.js';
import { getDb, requirePasscode } from './_db.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  // ── GET (public) ────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url ?? '', 'http://localhost');
    const idParam = req.query?.id ?? url.searchParams.get('id');

    let db;
    try {
      db = getDb();
    } catch {
      return sendJson(res, 500, { error: 'Database misconfigured.' });
    }

    if (idParam) {
      const id = String(idParam).trim();
      if (!UUID_REGEX.test(id)) {
        return sendJson(res, 400, { error: 'Invalid UUID format.' });
      }

      try {
        const { data, error } = await db
          .from('iv_jobs')
          .select('id, title, location, jd_text')
          .eq('id', id)
          .single();

        if (error || !data) {
          return sendJson(res, 404, { error: 'Job not found.' });
        }

        return sendJson(res, 200, data);
      } catch {
        return sendJson(res, 502, { error: 'Failed to fetch job.' });
      }
    }

    try {
      const { data, error } = await db
        .from('iv_jobs')
        .select('id, title, location, jd_text')
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (error) {
        return sendJson(res, 502, { error: 'Failed to fetch jobs.' });
      }

      return sendJson(res, 200, data ?? []);
    } catch {
      return sendJson(res, 502, { error: 'Failed to fetch jobs.' });
    }
  }

  // ── POST (passcode-protected creation) ──────────────────────────────────────
  if (req.method === 'POST') {
    if (!requirePasscode(req, res)) return;

    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      return sendJson(res, 400, { error: 'Invalid JSON body.' });
    }

    const { title, location, jd_text, skills } = body as {
      title?: unknown;
      location?: unknown;
      jd_text?: unknown;
      skills?: unknown;
    };

    if (typeof title !== 'string' || title.trim().length < 1 || title.trim().length > 100) {
      return sendJson(res, 400, {
        error: 'Invalid title: must be between 1 and 100 characters.',
      });
    }

    const loc = typeof location === 'string' ? location.trim() : '';
    if (loc.length > 100) {
      return sendJson(res, 400, {
        error: 'Invalid location: maximum 100 characters allowed.',
      });
    }

    if (typeof jd_text !== 'string' || jd_text.trim().length < 50 || jd_text.trim().length > 8000) {
      return sendJson(res, 400, {
        error: 'Invalid jd_text: must be between 50 and 8000 characters.',
      });
    }

    if (
      skills !== undefined &&
      (!Array.isArray(skills) ||
        skills.length > 20 ||
        !skills.every((s) => typeof s === 'string'))
    ) {
      return sendJson(res, 400, {
        error: 'Invalid skills: must be an array of strings up to 20 items.',
      });
    }

    let db;
    try {
      db = getDb();
    } catch {
      return sendJson(res, 500, { error: 'Database misconfigured.' });
    }

    try {
      const { data, error } = await db
        .from('iv_jobs')
        .insert({
          title: title.trim(),
          location: loc,
          jd_text: jd_text.trim(),
          skills: Array.isArray(skills) ? skills.map((s) => s.trim()) : [],
          active: true,
        })
        .select('id, title, location, jd_text')
        .single();

      if (error || !data) {
        return sendJson(res, 502, { error: 'Failed to create job.' });
      }

      return sendJson(res, 201, data);
    } catch {
      return sendJson(res, 502, { error: 'Failed to create job.' });
    }
  }

  // ── PATCH (passcode-protected toggle) ───────────────────────────────────────
  if (req.method === 'PATCH') {
    if (!requirePasscode(req, res)) return;

    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      return sendJson(res, 400, { error: 'Invalid JSON body.' });
    }

    const { id, active } = body as { id?: unknown; active?: unknown };

    if (typeof id !== 'string' || !UUID_REGEX.test(id.trim())) {
      return sendJson(res, 400, { error: 'Invalid id: must be a valid UUID.' });
    }

    if (typeof active !== 'boolean') {
      return sendJson(res, 400, { error: 'Invalid active: must be a boolean.' });
    }

    let db;
    try {
      db = getDb();
    } catch {
      return sendJson(res, 500, { error: 'Database misconfigured.' });
    }

    try {
      const { data, error } = await db
        .from('iv_jobs')
        .update({ active })
        .eq('id', id.trim())
        .select('id, title, location, jd_text, active')
        .single();

      if (error || !data) {
        return sendJson(res, 404, { error: 'Job not found or update failed.' });
      }

      return sendJson(res, 200, data);
    } catch {
      return sendJson(res, 502, { error: 'Failed to update job.' });
    }
  }

  return sendJson(res, 405, { error: 'Method not allowed.' });
}

