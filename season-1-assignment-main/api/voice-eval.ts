import {
  fetchWithTimeout,
  gnaniAuthHeaders,
  requireEnv,
  sendJson,
} from './_gnani.js';

const SYSTEM_PROMPT =
  'You are a recruiter assistant. The candidate answered in Hinglish or a regional language. Judge content, not accent or English fluency. Return only valid JSON.';

type EvalResult = {
  scores: Record<string, number>;
  strengths: string[];
  red_flags: string[];
  summary: string;
  provider: 'evon' | 'groq';
};

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
}

function validateShape(v: any): EvalResult | null {
  if (!v || typeof v !== 'object') return null;
  const scores = v.scores;
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) return null;

  const outScores: Record<string, number> = {};
  for (const [k, n] of Object.entries(scores)) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 10) return null;
    outScores[k] = n;
  }
  if (Object.keys(outScores).length === 0) return null;

  const isStrArr = (x: unknown): x is string[] =>
    Array.isArray(x) && x.every((s) => typeof s === 'string');

  if (!isStrArr(v.strengths) || !isStrArr(v.red_flags)) return null;
  if (typeof v.summary !== 'string') return null;

  return {
    scores: outScores,
    strengths: v.strengths,
    red_flags: v.red_flags,
    summary: v.summary,
    provider: v.provider === 'groq' ? 'groq' : 'evon',
  };
}

function parseModelOutput(text: string): EvalResult | null {
  const cleaned = stripFences(text);
  try {
    return validateShape(JSON.parse(cleaned));
  } catch {
    return null;
  }
}

function buildMessages(question: string, transcript: string, rubric: string[]) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: JSON.stringify({ question, transcript, rubric }, null, 2),
    },
  ];
}

function extractContent(data: any): string | null {
  const s =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.text ??
    data?.message?.content ??
    (typeof data?.content === 'string' ? data.content : null);
  return typeof s === 'string' && s.trim() ? s : null;
}

async function callOnce(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<EvalResult | null> {
  const upstream = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!upstream.ok) return null;

  const text = await upstream.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const content = extractContent(data);
  return content ? parseModelOutput(content) : null;
}

function groqKeys(): string[] {
  return (process.env.GROQ_API_KEYS ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k && !k.includes('key1'));
}

function evonConfigured(): boolean {
  const llm = (process.env.GNANI_LLM_URL ?? '').trim();
  const key = (process.env.GNANI_API_KEY ?? '').trim();
  return Boolean(llm && !llm.includes('REPLACE_FROM_GNANI_DOCS') && key && !key.includes('your_gnani_api_key'));
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  const { question, transcript, rubric } = body ?? {};

  if (
    typeof question !== 'string' || !question.trim() ||
    typeof transcript !== 'string' || !transcript.trim() ||
    !Array.isArray(rubric) || rubric.length === 0 || !rubric.every((r: unknown) => typeof r === 'string')
  ) {
    return sendJson(res, 400, {
      error: 'Expected JSON body { question: string, transcript: string, rubric: string[] }.',
    });
  }

  const messages = buildMessages(question.trim(), transcript.trim(), rubric);

  // Try Evon first.
  if (evonConfigured()) {
    const url = process.env.GNANI_LLM_URL!;
    // Provider-agnostic body; adjust if Evon expects OpenAI-compatible fields.
    const bodyOut = {
      // TODO: set actual Evon model name from Gnani docs.
      model: process.env.GNANI_LLM_MODEL ?? 'evon',
      messages,
      temperature: 0.2,
    };

    try {
      const first = await callOnce(url, gnaniAuthHeaders(), bodyOut);
      if (first) return sendJson(res, 200, { ...first, provider: 'evon' });
      const retry = await callOnce(url, gnaniAuthHeaders(), bodyOut);
      if (retry) return sendJson(res, 200, { ...retry, provider: 'evon' });
    } catch {
      // fall through to Groq
    }
  }

  // Fallback: Groq using GROQ_API_KEYS.
  if (!requireEnv(res, ['GROQ_API_KEYS'], ['key1'])) return;

  const groqBody = {
    model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.2,
    response_format: { type: 'json_object' },
  };

  for (const key of groqKeys()) {
    try {
      const headers = { Authorization: `Bearer ${key}` };
      const first = await callOnce('https://api.groq.com/openai/v1/chat/completions', headers, groqBody);
      if (first) return sendJson(res, 200, { ...first, provider: 'groq' });
      const retry = await callOnce('https://api.groq.com/openai/v1/chat/completions', headers, groqBody);
      if (retry) return sendJson(res, 200, { ...retry, provider: 'groq' });
      // continue to next key
    } catch {
      // try next key
    }
  }

  return sendJson(res, 502, { error: 'Evaluation failed: no provider returned valid JSON.' });
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}