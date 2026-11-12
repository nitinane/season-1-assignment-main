import { config } from 'dotenv';
import { writeFile } from 'fs/promises';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Load .env from project root or subfolder
if (existsSync('.env')) {
  config({ path: resolve('.env') });
} else if (existsSync('season-1-assignment-main/.env')) {
  config({ path: resolve('season-1-assignment-main/.env') });
} else if (existsSync('../.env')) {
  config({ path: resolve('../.env') });
} else {
  config();
}

function maskKey(key) {
  if (!key) return '(unset)';
  if (key.length <= 4) return '****';
  return key.slice(0, 4) + '****';
}

async function main() {
  const apiKey = (process.env.GNANI_API_KEY ?? '').trim();
  const ttsUrl = (process.env.GNANI_TTS_URL ?? 'https://api.vachana.ai/api/v1/tts/inference').trim();

  if (!apiKey) {
    console.error('Missing GNANI_API_KEY in .env');
    process.exit(1);
  }

  console.log('Target URL:', ttsUrl);
  console.log('API key:', maskKey(apiKey));

  const body = {
    text: 'Namaste, mujhe aapke baare mein batayiye.',
    model: 'timbre-v2.5',
    voice: 'Poorvi',
    language: 'hi-en',
    speed: 1.0,
    audio_config: {
      sample_rate: 24000,
      num_channels: 1,
      sample_width: 2,
      encoding: 'linear_pcm',
      container: 'mp3',
      bitrate: '64k',
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const upstream = await fetch(ttsUrl, {
      method: 'POST',
      headers: {
        'X-API-Key-ID': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    console.log('HTTP status:', upstream.status);
    console.log('Content-Type:', upstream.headers.get('content-type'));

    if (upstream.status === 200) {
      const arrayBuffer = await upstream.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await writeFile('out.mp3', buffer);
      console.log(`Saved ${buffer.length} bytes to out.mp3`);
    } else {
      const text = await upstream.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        // non-json
      }
      console.log('Error response:');
      console.log(JSON.stringify(parsed ?? { raw: text }, null, 2));
    }
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

