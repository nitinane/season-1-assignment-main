// api/_gnani.ts
// Shared helpers for Gnani AI serverless routes.
// Never import this from browser code — keys stay server-side only.

type Res = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

export function sendJson(res: Res, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// Returns true if all vars are set (and non-placeholder), otherwise sends a
// clear 500 JSON error and returns false.
export function requireEnv(
  res: Res,
  vars: string[],
  placeholders: string[] = ['REPLACE_FROM_GNANI_DOCS', 'your_gnani_api_key'],
): boolean {
  const missing = vars.filter((v) => {
    const val = (process.env[v] ?? '').trim();
    if (!val) return true;
    return placeholders.some((p) => val.includes(p));
  });

  if (missing.length > 0) {
    // Intentionally generic — never echoes secret values.
    sendJson(res, 500, {
      error: 'Server misconfigured: missing or placeholder env vars.',
      missing,
    });
    return false;
  }

  return true;
}

// Gnani Prisma v3.0 uses X-API-Key-ID header (per official docs).
export function gnaniAuthHeaders(): Record<string, string> {
  const key = (process.env.GNANI_API_KEY ?? '').trim();
  if (!key) {
    throw new Error('GNANI_API_KEY is not set');
  }
  return { 'X-API-Key-ID': key };
}
}

// Fetch with a 30s timeout. Throws an Error with a generic message
// (never includes the API key or upstream auth header).
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Upstream request timed out');
    }
    throw new Error('Upstream request failed');
  } finally {
    clearTimeout(timer);
  }
}

// Read a JSON response safely. Returns null on invalid JSON.
export async function readJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
