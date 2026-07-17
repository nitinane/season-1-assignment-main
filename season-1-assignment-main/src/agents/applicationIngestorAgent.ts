/**
 * Agent 3 — Application Ingestor
 *
 * Per PROJECT_SPEC.md §2 & Prompt 2:
 *   - Watches/polls a specified Google Drive folder for new resume files
 *   - Extracts text from PDF/Word resumes (pure parsing — NO LLM)
 *   - Creates a row in `applications` with:
 *       hr_user_id, job_id, drive_file_id, candidate_name,
 *       candidate_email, resume_text, status="ingested"
 *
 * This module exposes three entry points:
 *   1. ingestFromDriveFolder(folderId, jobId, googleToken)
 *      → polls Drive for new files, parses + inserts each one
 *   2. ingestFromFile(file, jobId, driveFileId?)
 *      → used by the manual upload UI so the same pipeline runs
 *   3. ingestFromBlob(blob, filename, mimeType, jobId, driveFileId?, candidateMeta?)
 *      → low-level: parse Blob → insert application row
 *
 * NO LLM is called anywhere in this file.
 */

import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../services/authService';
import { parsePDF, parseDOCX } from '../lib/parser';
import { notify_hr } from '../services/notificationService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Application {
  id: string;
  hr_user_id: string;
  job_id: string;
  drive_file_id: string | null;
  candidate_name: string;
  candidate_email: string;
  resume_text: string;
  score: number | null;
  score_reasoning: string | null;
  status: 'ingested' | 'scored' | 'shortlisted' | 'interview_scheduled' | 'hired' | 'rejected';
  created_at: string;
}

export interface IngestResult {
  success: boolean;
  application?: Application;
  error?: string;
}

export interface DriveIngestSummary {
  ingested: number;
  skipped: number;
  errors: string[];
  applications: Application[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract plain text from a Blob based on filename / mimeType.
 * Pure parsing — no AI involved.
 */
async function extractText(blob: Blob, filename: string, mimeType: string): Promise<string> {
  const lower = filename.toLowerCase();

  if (lower.endsWith('.pdf') || mimeType.includes('pdf')) {
    return parsePDF(blob);
  }
  if (lower.endsWith('.docx') || lower.endsWith('.doc') || mimeType.includes('word')) {
    return parseDOCX(blob);
  }

  // Fallback: try PDF first, then DOCX
  const pdfText = await parsePDF(blob);
  if (pdfText.length > 100) return pdfText;
  return parseDOCX(blob);
}

/**
 * Try to extract a name from text using simple heuristics
 * (first non-empty line of the resume, trimmed).
 * Falls back to the filename stem.
 */
function inferCandidateName(resumeText: string, filename: string): string {
  const firstLine = resumeText.split('\n').map((l) => l.trim()).find((l) => l.length > 2 && l.length < 80);
  if (firstLine) return firstLine;
  // Use filename without extension
  return filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').trim() || 'Unknown Candidate';
}

/**
 * Try to extract an email from text using a simple regex.
 */
function inferCandidateEmail(resumeText: string): string {
  const match = resumeText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase() : '';
}

// ─── Core: Insert one application row ────────────────────────────────────────

/**
 * Inserts one `applications` row.
 * Skips insertion if a row with the same drive_file_id already exists
 * (idempotent Drive polling).
 */
async function insertApplication(params: {
  hr_user_id: string;
  job_id: string;
  drive_file_id: string | null;
  candidate_name: string;
  candidate_email: string;
  resume_text: string;
}): Promise<{ application: Application | null; skipped: boolean }> {
  // Idempotency check for Drive files
  if (params.drive_file_id) {
    const { data: existing } = await supabase
      .from('applications')
      .select('id')
      .eq('drive_file_id', params.drive_file_id)
      .eq('hr_user_id', params.hr_user_id)
      .maybeSingle();

    if (existing) {
      return { application: null, skipped: true };
    }
  }

  const { data, error } = await supabase
    .from('applications')
    .insert([
      {
        hr_user_id: params.hr_user_id,
        job_id: params.job_id,
        drive_file_id: params.drive_file_id ?? null,
        candidate_name: params.candidate_name,
        candidate_email: params.candidate_email,
        resume_text: params.resume_text,
        status: 'ingested',
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return { application: data as Application, skipped: false };
}

// ─── Entry Point 3a: Ingest from raw Blob ────────────────────────────────────

/**
 * Low-level ingestion: Blob → parse text → insert applications row.
 *
 * @param blob           Raw file blob
 * @param filename       Filename (used to detect PDF/DOCX)
 * @param mimeType       MIME type string
 * @param jobId          Job role this application is for
 * @param driveFileId    Google Drive file ID (null for manual uploads)
 * @param candidateMeta  Optional override for name/email (from Drive metadata)
 */
export async function ingestFromBlob(
  blob: Blob,
  filename: string,
  mimeType: string,
  jobId: string,
  driveFileId: string | null = null,
  candidateMeta?: { name?: string; email?: string }
): Promise<IngestResult> {
  try {
    const hr_user_id = await getCurrentUser();

    // 1. Extract text (pure parsing, no LLM)
    const resumeText = await extractText(blob, filename, mimeType);
    if (!resumeText || resumeText.trim().length < 20) {
      return { success: false, error: `Could not extract text from "${filename}"` };
    }

    // 2. Infer candidate meta if not provided
    const candidate_name = candidateMeta?.name?.trim() || inferCandidateName(resumeText, filename);
    const candidate_email = candidateMeta?.email?.trim() || inferCandidateEmail(resumeText);

    // 3. Insert row
    const { application, skipped } = await insertApplication({
      hr_user_id,
      job_id: jobId,
      drive_file_id: driveFileId,
      candidate_name,
      candidate_email,
      resume_text: resumeText,
    });

    if (skipped) {
      return { success: true, error: `Skipped (already ingested): ${filename}` };
    }

    // Trigger Agent 9 notification
    notify_hr(
      hr_user_id,
      'application_ingested',
      `New application ingested for candidate "${candidate_name}" (${filename})`
    ).catch(console.error);

    return { success: true, application: application! };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ─── Entry Point 3b: Ingest from browser File object ─────────────────────────

/**
 * Ingest a File picked by the browser's file picker / drag-drop.
 * Used by the manual upload UI so all resumes go through the applications table.
 */
export async function ingestFromFile(
  file: File,
  jobId: string,
  driveFileId: string | null = null
): Promise<IngestResult> {
  return ingestFromBlob(file, file.name, file.type, jobId, driveFileId);
}

// ─── Google Drive API helpers ─────────────────────────────────────────────────

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

function driveAuthHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * List PDF/DOCX files inside a Drive folder, newest first.
 */
async function listDriveResumeFiles(
  folderId: string,
  googleToken: string
): Promise<Array<{ id: string; name: string; mimeType: string }>> {
  const q = encodeURIComponent(
    `'${folderId}' in parents and trashed = false and (mimeType = 'application/pdf' or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType = 'application/msword')`
  );

  const res = await fetch(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name,mimeType)&orderBy=createdTime desc&pageSize=100`,
    { headers: driveAuthHeader(googleToken) }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Drive API error: ${err?.error?.message || res.statusText}`);
  }

  const body = await res.json();
  return body.files ?? [];
}

/**
 * Download a Drive file as a Blob.
 */
async function downloadDriveFile(fileId: string, _mimeType: string, googleToken: string): Promise<Blob> {
  // For Google Docs native files we'd export, but resumes are binary (PDF/DOCX)
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: driveAuthHeader(googleToken),
  });

  if (!res.ok) {
    throw new Error(`Drive download failed for ${fileId}: ${res.statusText}`);
  }
  return res.blob();
}



async function upsertDrivePollState(
  hr_user_id: string,
  folderId: string,
  pageToken: string
): Promise<void> {
  await supabase.from('drive_poll_state').upsert(
    { hr_user_id, folder_id: folderId, page_token: pageToken, last_polled: new Date().toISOString() },
    { onConflict: 'hr_user_id,folder_id' }
  );
}

/**
 * Lists new files in the specified Drive folder since the last poll.
 * Updates the drive_poll_state table with the new timestamp.
 */
export async function poll_drive_folder(
  folderId: string,
  googleToken: string
): Promise<Array<{ id: string; name: string; mimeType: string; createdTime?: string }>> {
  const hr_user_id = await getCurrentUser();

  // 1. Get the last poll time from DB
  const { data: pollState } = await supabase
    .from('drive_poll_state')
    .select('last_polled')
    .eq('hr_user_id', hr_user_id)
    .eq('folder_id', folderId)
    .maybeSingle();

  // 2. Construct search query
  let q = `'${folderId}' in parents and trashed = false and (mimeType = 'application/pdf' or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType = 'application/msword')`;
  
  if (pollState?.last_polled) {
    // Only query files created after the last polled time
    q += ` and createdTime > '${pollState.last_polled}'`;
  }

  const encodedQ = encodeURIComponent(q);
  const res = await fetch(
    `${DRIVE_API}/files?q=${encodedQ}&fields=files(id,name,mimeType,createdTime)&orderBy=createdTime desc&pageSize=100`,
    { headers: driveAuthHeader(googleToken) }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Drive API error: ${err?.error?.message || res.statusText}`);
  }

  const body = await res.json();
  const files = body.files ?? [];

  // 3. Update the poll state timestamp to now
  await upsertDrivePollState(hr_user_id, folderId, new Date().toISOString());

  return files;
}

// ─── Entry Point 3c: Ingest from Google Drive folder ─────────────────────────

/**
 * Polls a Google Drive folder for new resume files and ingests each one.
 *
 * Already-ingested files are skipped (idempotent via drive_file_id check).
 *
 * @param folderId     Google Drive folder ID
 * @param jobId        Job role to attach applications to
 * @param googleToken  Google OAuth provider token (from Supabase session)
 */
export async function ingestFromDriveFolder(
  folderId: string,
  jobId: string,
  googleToken: string
): Promise<DriveIngestSummary> {
  const summary: DriveIngestSummary = {
    ingested: 0,
    skipped: 0,
    errors: [],
    applications: [],
  };

  try {
    const hr_user_id = await getCurrentUser();

    // 1. List resume files in the folder
    const files = await listDriveResumeFiles(folderId, googleToken);
    console.log(`[Agent 3] Found ${files.length} resume file(s) in Drive folder ${folderId}`);

    // 2. Process each file
    for (const file of files) {
      try {
        // Download the blob
        const blob = await downloadDriveFile(file.id, file.mimeType, googleToken);

        // Ingest it (idempotency check is inside ingestFromBlob)
        const result = await ingestFromBlob(blob, file.name, file.mimeType, jobId, file.id);

        if (result.success && result.application) {
          summary.ingested++;
          summary.applications.push(result.application);
          console.log(`[Agent 3] Ingested: ${file.name} → application ${result.application.id}`);
        } else if (result.error?.startsWith('Skipped')) {
          summary.skipped++;
          console.log(`[Agent 3] Skipped (already ingested): ${file.name}`);
        } else {
          summary.errors.push(`${file.name}: ${result.error}`);
          console.warn(`[Agent 3] Error for ${file.name}:`, result.error);
        }
      } catch (fileErr) {
        const msg = fileErr instanceof Error ? fileErr.message : String(fileErr);
        summary.errors.push(`${file.name}: ${msg}`);
        console.error(`[Agent 3] Failed to ingest ${file.name}:`, fileErr);
      }
    }

    // 3. Persist poll state
    await upsertDrivePollState(hr_user_id, folderId, new Date().toISOString());

    return summary;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    summary.errors.push(`Drive poll failed: ${msg}`);
    console.error('[Agent 3] Drive poll error:', e);
    return summary;
  }
}
