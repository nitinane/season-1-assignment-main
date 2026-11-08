import {
  fetchWithTimeout,
  gnaniAuthHeaders,
  readJsonSafe,
  requireEnv,
  sendJson,
} from './_gnani.js';

export const config = { api: { bodyParser: false } };

// Max 10 MB upload (Prisma v3.0 supports up to ~30s audio; 10 MB is a safe ceiling).
const MAX_BYTES = 10 * 1024 * 1024;

// Accepted MIME types per Prisma v3.0 docs: WAV, MP3, OGG, FLAC, AAC, M4A.
const ALLOWED_TYPES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/flac',
  'audio/aac',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
]);

// Map content type to file extension for the multipart filename.
function extFor(contentType: string): string | null {
  const t = contentType.split(';')[0].trim().toLowerCase();
  if (t.includes('wav')) return 'wav';
  if (t.includes('mpeg') || t === 'audio/mp3') return 'mp3';
  if (t.includes('ogg')) return 'ogg';
  if (t.includes('flac')) return 'flac';
  if (t.includes('aac')) return 'aac';
  if (t.includes('mp4') || t.includes('m4a')) return 'm4a';
  return null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
  }

  // Prisma v3.0 endpoint is fixed per docs; env var allows override for testing.
  const sttUrl = (process.env.GNANI_STT_URL ?? 'https://api.vachana.ai/stt/v3').trim();
  if (!requireEnv(res, ['GNANI_API_KEY'], undefined)) return;
  if (sttUrl.includes('REPLACE_FROM_GNANI_DOCS')) {
    return sendJson(res, 500, { error: 'Server misconfigured: GNANI_STT_URL is a placeholder.' });
  }

  // Read raw body, enforcing size limit.
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_BYTES) {
      return sendJson(res, 413, { error: 'Audio too large. Max 10 MB.' });
    }
    chunks.push(buf);
  }

  const audio = Buffer.concat(chunks);
  if (audio.length === 0) {
    return sendJson(res, 400, { error: 'Empty audio body.' });
  }

  // Validate content type against allowed set (browser-provided, but we still check).
  const contentType = String(req.headers['content-type'] ?? '').split(';')[0].trim();
  if (!contentType || !ALLOWED_TYPES.has(contentType)) {
    return sendJson(res, 400, {
      error: `Unsupported audio format. Allowed: ${Array.from(ALLOWED_TYPES).join(', ')}.`,
    });
  }

  // Build multipart form per Prisma v3.0 spec.
  // Fields: audio_file (binary), model, language_code, format.
  // Let FormData generate the boundary; do NOT set Content-Type header manually.
  const form = new FormData();
  const ext = extFor(contentType) ?? 'wav';
  form.append('audio_file', new Blob([audio], { type: contentType }), `audio.${ext}`);
  form.append('model', 'prisma-v3.0');
  form.append('language_code', 'indic-auto');
  form.append('format', 'codemix');

  let upstream: Response;
  try {
    upstream = await fetchWithTimeout(sttUrl, {
      method: 'POST',
      headers: gnaniAuthHeaders(),
      body: form,
    });
  } catch {
    return sendJson(res, 504, { error: 'Transcription upstream timeout.' });
  }

  // Handle specific upstream status codes.
  if (upstream.status === 401 || upstream.status === 403) {
    return sendJson(res, 401, { error: 'Invalid or missing API credentials.' });
  }
  if (upstream.status === 429) {
    return sendJson(res, 429, { error: 'Rate limit exceeded. Please retry.' });
  }
  if (upstream.status === 422) {
    return sendJson(res, 400, { error: 'Invalid audio format or parameters.' });
  }
  if (upstream.status >= 500) {
    return sendJson(res, 502, { error: 'Transcription service temporarily unavailable.' });
  }
  if (!upstream.ok) {
    return sendJson(res, 502, { error: `Transcription failed (upstream ${upstream.status}).` });
  }

  const data = (await readJsonSafe(upstream)) as any;
  if (!data || typeof data !== 'object') {
    return sendJson(res, 502, { error: 'Transcription returned an unexpected shape.' });
  }

  // Prisma v3.0 success flag
  if (data.success === false) {
    const msg = typeof data.message === 'string' ? data.message : 'Transcription failed.';
    return sendJson(res, 502, { error: msg });
  }

  // Extract transcript from expected response shape.
  // Docs: { success: true, request_id, transcript, model, processing_time, end_to_end_latency, detected_language_code }
  const transcript = typeof data.transcript === 'string' ? data.transcript.trim() : '';
  if (!transcript) {
    // Empty transcript is not an error from the API, but we signal it clearly.
    return sendJson(res, 200, {
      transcript: '',
      empty: true,
      truncated: data.truncated === true,
      language: typeof data.detected_language_code === 'string' ? data.detected_language_code : undefined,
    });
  }

  return sendJson(res, 200, {
    transcript,
    truncated: data.truncated === true,
    language: typeof data.detected_language_code === 'string' ? data.detected_language_code : undefined,
  });
}