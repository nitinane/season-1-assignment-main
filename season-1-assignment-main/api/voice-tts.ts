import {
  fetchWithTimeout,
  gnaniAuthHeaders,
  requireEnv,
  sendJson,
} from './_gnani.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
  }

  const ttsUrl = (process.env.GNANI_TTS_URL ?? 'https://api.vachana.ai/api/v1/tts/inference').trim();
  const modelEnv = (process.env.GNANI_TTS_MODEL ?? 'timbre-v2.5').trim();
  const voiceEnv = (process.env.GNANI_TTS_VOICE ?? 'Poorvi').trim();
  const voiceV3 = (process.env.GNANI_TTS_VOICE_V3 ?? 'Shivani').trim();

  if (!requireEnv(res, ['GNANI_API_KEY'], undefined)) return;
  if (ttsUrl.includes('REPLACE_FROM_GNANI_DOCS')) {
    return sendJson(res, 500, { error: 'Server misconfigured: GNANI_TTS_URL is a placeholder.' });
  }

  // Read JSON body (supports pre-parsed or raw stream)
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
  } else if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON body.' });
    }
  }

  const { text, language } = (body as { text?: unknown; language?: unknown }) ?? {};

  if (typeof text !== 'string' || text.trim().length === 0 || text.length > 500) {
    return sendJson(res, 400, {
      error: 'Invalid text: text must be a string between 1 and 500 characters.',
    });
  }

  const allowedLanguages = ['en-IN', 'hi-en', 'hi-IN', 'te-IN'];
  const lang = typeof language === 'string' && allowedLanguages.includes(language.trim()) ? language.trim() : 'hi-en';

  // For hi-en, always use the env defaults. For others, prefer v3.0 with GNANI_TTS_VOICE_V3.
  const useV3 = lang !== 'hi-en';
  const model = useV3 ? 'timbre-v3.0' : modelEnv;
  const voice = useV3 ? voiceV3 : voiceEnv;

  const audioConfig = {
    sample_rate: 24000,
    num_channels: 1,
    sample_width: 2,
    encoding: 'linear_pcm',
    container: 'mp3',
    bitrate: '64k',
  };

  const makePayload = (m: string, v: string, l: string) => ({
    text: text.trim(),
    model: m,
    voice: v,
    language: l,
    speed: 1.0,
    audio_config: audioConfig,
  });

  let payload = makePayload(model, voice, lang);

  const doFetch = async (p: Record<string, unknown>) => {
    try {
      return await fetchWithTimeout(ttsUrl, {
        method: 'POST',
        headers: {
          ...gnaniAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(p),
      });
    } catch {
      return null;
    }
  };

  let upstream = await doFetch(payload);

  if (upstream === null) {
    return sendJson(res, 502, { error: 'Text-to-speech service temporarily unavailable.' });
  }

  // v3.0 fallback: if upstream returns 400 or 403 for v3.0, retry once with v2.5 and language auto
  if (useV3 && (upstream.status === 400 || upstream.status === 403)) {
    payload = makePayload(modelEnv, voiceEnv, 'auto');
    const retry = await doFetch(payload);
    if (retry !== null) {
      upstream = retry;
    }
  }

  if (!upstream.ok) {
    return sendJson(res, 502, { error: 'Text-to-speech service upstream request failed.' });
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (typeof res.write === 'function' && upstream.body && typeof (upstream.body as any).getReader === 'function') {
      const reader = (upstream.body as any).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } else {
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.end(buf);
    }
  } catch {
    if (!res.headersSent) {
      return sendJson(res, 502, { error: 'Text-to-speech stream failed.' });
    }
    res.end();
  }
}

