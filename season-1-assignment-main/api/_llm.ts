// api/_llm.ts
// Shared LLM inference helper supporting Evon with Groq fallback.

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatJsonOptions {
  temperature?: number;
}

export interface ChatJsonResponse {
  data: any;
  provider: 'evon' | 'groq';
}

function cleanJsonText(raw: string): string {
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return cleaned;
}

async function callEvon(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  temperature: number,
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Upstream error: ${res.status}`);
    }

    const json = (await res.json()) as any;
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Invalid response structure');
    }

    const cleaned = cleanJsonText(content);
    return JSON.parse(cleaned);
  } finally {
    clearTimeout(timer);
  }
}

function getGroqKeys(): string[] {
  const raw =
    process.env.GROQ_API_KEYS ??
    process.env.VITE_GROQ_API_KEYS ??
    process.env.GROQ_API_KEY ??
    '';
  return raw
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k && !k.startsWith('key') && !k.includes('your_'));
}

export async function chatJson(
  messages: ChatMessage[],
  options?: ChatJsonOptions,
): Promise<ChatJsonResponse> {
  const temp = options?.temperature ?? 0.2;

  const evonBaseUrl = (process.env.EVON_BASE_URL ?? '').trim();
  const evonApiKey = (process.env.EVON_API_KEY ?? '').trim();
  const evonModel = (process.env.EVON_MODEL ?? '').trim();

  const isEvonConfigured =
    Boolean(evonBaseUrl && evonApiKey && evonModel) &&
    !evonBaseUrl.includes('REPLACE_') &&
    !evonApiKey.includes('your_');

  if (isEvonConfigured) {
    const endpoint = `${evonBaseUrl.replace(/\/+$/, '')}/chat/completions`;
    try {
      const data = await callEvon(endpoint, evonApiKey, evonModel, messages, temp);
      return { data, provider: 'evon' };
    } catch {
      // Retry once on failure
      try {
        const retryData = await callEvon(endpoint, evonApiKey, evonModel, messages, temp);
        return { data: retryData, provider: 'evon' };
      } catch {
        // Fall through to Groq fallback
      }
    }
  }

  // Groq Fallback
  const keys = getGroqKeys();
  const groqModel = (process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile').trim();

  for (const key of keys) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: groqModel,
          messages,
          temperature: temp,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!res.ok) continue;

      const json = (await res.json()) as any;
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') continue;

      const cleaned = cleanJsonText(content);
      const data = JSON.parse(cleaned);
      return { data, provider: 'groq' };
    } catch {
      // Try next key
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error('LLM service unavailable.');
}

