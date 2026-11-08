import { config } from 'dotenv';
import { readFile } from 'fs/promises';
import { resolve, extname } from 'path';

// Load .env from project root
config({ path: resolve('.env') });

function maskKey(key) {
  if (!key) return '(unset)';
  return key.slice(0, 4) + '****';
}

// Map extension -> MIME (mirrors voice-stt.ts ALLOWED_TYPES)
const EXT_TO_MIME = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.m4a': 'audio/m4a',
};

async function main() {
  const apiKey = process.env.GNANI_API_KEY?.trim();
  const sttUrl = (process.env.GNANI_STT_URL ?? 'https://api.vachana.ai/stt/v3').trim();

  if (!apiKey) {
    console.error('Missing GNANI_API_KEY in .env');
    process.exit(1);
  }
  if (sttUrl.includes('REPLACE_FROM_GNANI_DOCS')) {
    console.error('GNANI_STT_URL is a placeholder — set the real URL in .env');
    process.exit(1);
  }

  console.log('Target URL:', sttUrl);
  console.log('API key:', maskKey(apiKey));

  // Read audio file (path arg or default ./sample.wav)
  const audioPath = process.argv[2] ?? 'sample.wav';
  let audio;
  try {
    audio = await readFile(resolve(audioPath));
  } catch (e) {
    console.error(`sample.wav not found: ${audioPath}`);
    process.exit(1);
  }

  console.log('Audio size:', audio.length, 'bytes');

  // Build the exact same request as api/voice-stt.ts — use extension to derive MIME + filename
  const ext = extname(audioPath).toLowerCase();
  const mime = EXT_TO_MIME[ext] ?? 'audio/wav';
  const filename = `audio${ext}`;
  const form = new FormData();
  form.append('audio_file', new Blob([audio], { type: mime }), filename);
  form.append('model', 'prisma-v3.0');
  form.append('language_code', 'indic-auto');
  form.append('format', 'codemix');

  // fetchWithTimeout equivalent (30s)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const upstream = await fetch(sttUrl, {
      method: 'POST',
      headers: { 'X-API-Key-ID': apiKey },
      body: form,
      signal: controller.signal,
    });

    console.log('HTTP status:', upstream.status);

    const text = await upstream.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* non-json */ }

    console.log('Full JSON response:');
    console.log(JSON.stringify(parsed ?? { raw: text }, null, 2));
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('Request timed out after 30s');
    } else {
      console.error('Request failed:', err.message);
    }
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

main();
