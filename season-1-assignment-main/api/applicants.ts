// api/applicants.ts
// Passcode-protected recruiter endpoint: list applicants or fetch full detail.
// Reads from iv_applications and iv_jobs. Never returns resume_text.

import { sendJson } from './_gnani.js';
import { getDb, requirePasscode } from './_db.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  if (!requirePasscode(req, res)) return;

  let db;
  try {
    db = getDb();
  } catch {
    return sendJson(res, 500, { error: 'Database misconfigured.' });
  }

  const url = new URL(req.url ?? '', 'http://localhost');
  const idParam = req.query?.id ?? url.searchParams.get('id');

  // ── GET ?id=<uuid>  — full detail ──────────────────────────────────────────
  if (idParam) {
    const id = String(idParam).trim();
    if (!UUID_REGEX.test(id)) {
      return sendJson(res, 400, { error: 'Invalid UUID format.' });
    }

    try {
      // Fetch the application row (excluding resume_text)
      const { data: app, error: appErr } = await db
        .from('iv_applications')
        .select(
          'id, candidate_name, email, job_id, resume_skills, ats, turns, overall, status, provider, language, created_at'
        )
        .eq('id', id)
        .single();

      if (appErr || !app) {
        return sendJson(res, 404, { error: 'Application not found.' });
      }

      // Fetch related job
      let jobTitle = '';
      let jobLocation = '';
      if (app.job_id) {
        try {
          const { data: job } = await db
            .from('iv_jobs')
            .select('title, location')
            .eq('id', app.job_id)
            .single();
          if (job) {
            jobTitle = job.title ?? '';
            jobLocation = job.location ?? '';
          }
        } catch {
          // non-fatal
        }
      }

      return sendJson(res, 200, {
        id: app.id,
        candidate_name: app.candidate_name ?? '',
        email: app.email ?? '',
        job_title: jobTitle,
        job_location: jobLocation,
        resume_skills: app.resume_skills ?? [],
        ats: app.ats ?? null,
        turns: Array.isArray(app.turns) ? app.turns : [],
        overall: app.overall ?? null,
        status: app.status ?? '',
        provider: app.provider ?? '',
        language: app.language ?? '',
        created_at: app.created_at,
      });
    } catch {
      return sendJson(res, 502, { error: 'Failed to fetch applicant.' });
    }
  }

  // ── GET (list) ─────────────────────────────────────────────────────────────
  try {
    const { data: apps, error: listErr } = await db
      .from('iv_applications')
      .select(
        'id, candidate_name, email, job_id, ats, overall, status, provider, language, created_at'
      )
      .order('created_at', { ascending: false });

    if (listErr) {
      return sendJson(res, 502, { error: 'Failed to fetch applicants.' });
    }

    // Gather unique job_ids and batch-fetch job titles
    const jobIds: string[] = [
      ...new Set(
        (apps ?? [])
          .map((a: any) => a.job_id)
          .filter((j: any) => typeof j === 'string' && UUID_REGEX.test(j))
      ),
    ];

    const jobMap: Record<string, string> = {};
    if (jobIds.length > 0) {
      try {
        const { data: jobs } = await db
          .from('iv_jobs')
          .select('id, title')
          .in('id', jobIds);
        for (const j of jobs ?? []) {
          jobMap[j.id] = j.title ?? '';
        }
      } catch {
        // non-fatal
      }
    }

    const list = (apps ?? []).map((app: any) => {
      const ats = app.ats ?? {};
      const overall = app.overall ?? {};

      return {
        id: app.id,
        candidate_name: app.candidate_name ?? '',
        email: app.email ?? '',
        job_title: jobMap[app.job_id] ?? '',
        ats_score: typeof ats.score === 'number' ? ats.score : null,
        interview_score: typeof overall.interview_score === 'number' ? overall.interview_score : null,
        recommendation: overall.recommendation ?? '',
        status: app.status ?? '',
        created_at: app.created_at,
        provider: app.provider ?? '',
        language: app.language ?? '',
      };
    });

    return sendJson(res, 200, list);
  } catch {
    return sendJson(res, 502, { error: 'Failed to fetch applicants.' });
  }
}
