import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

// Use vi.hoisted to avoid hoisting issues with vi.mock
const { mockFetchWithTimeout, mockGnaniAuthHeaders, mockReadJsonSafe, mockRequireEnv, mockSendJson } = vi.hoisted(() => ({
  mockFetchWithTimeout: vi.fn(),
  mockGnaniAuthHeaders: vi.fn(() => ({ 'X-API-Key-ID': 'test-key' })),
  mockReadJsonSafe: vi.fn(),
  mockRequireEnv: vi.fn((res, vars, placeholders) => {
    // Check if env vars are actually set and not placeholders
    const missing = vars.filter((v: string) => {
      const val = (process.env[v] ?? '').trim();
      if (!val) return true;
      return placeholders?.some((p: string) => val.includes(p)) || false;
    });
    if (missing.length > 0) {
      // Mock sendJson to capture the call
      mockSendJson.mockImplementation((res, status, body) => {
        res.statusCode = status;
        res.end(JSON.stringify(body));
      });
      mockSendJson(res, 500, {
        error: 'Server misconfigured: missing or placeholder env vars.',
        missing,
      });
      return false;
    }
    return true;
  }),
  mockSendJson: vi.fn((res, status, body) => {
    res.statusCode = status;
    res.end(JSON.stringify(body));
  }),
}));

vi.mock('./_gnani.js', () => ({
  fetchWithTimeout: mockFetchWithTimeout,
  gnaniAuthHeaders: mockGnaniAuthHeaders,
  readJsonSafe: mockReadJsonSafe,
  requireEnv: mockRequireEnv,
  sendJson: mockSendJson,
}));

import handler from '../api/voice-stt';

function createMockReqRes() {
  const chunks: Buffer[] = [];
  const req = {
    method: 'POST',
    headers: { 'content-type': 'audio/wav' },
    url: '/api/voice-stt',
    on: vi.fn((event, cb) => {
      if (event === 'data') chunks.forEach(cb);
      if (event === 'end') cb();
    }),
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) yield chunk;
    },
  } as unknown as IncomingMessage;

  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '' as string,
    setHeader: vi.fn((name: string, value: string) => { res.headers[name] = value; }),
    end: vi.fn((body?: string) => { res.body = body ?? ''; }),
  } as unknown as ServerResponse & { headers: Record<string, string>; body: string };

  return { req, res, chunks };
}

describe('voice-stt (Prisma v3.0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithTimeout.mockReset();
    mockGnaniAuthHeaders.mockReset();
    mockReadJsonSafe.mockReset();
    mockRequireEnv.mockReset();
    mockSendJson.mockReset();
    // Don't set default return value - let the hoisted implementation handle it
    process.env.GNANI_API_KEY = 'test-key';
    process.env.GNANI_STT_URL = 'https://api.vachana.ai/stt/v3';
  });

  afterEach(() => {
    delete process.env.GNANI_API_KEY;
    delete process.env.GNANI_STT_URL;
  });

  it('rejects non-POST requests', async () => {
    const { req, res } = createMockReqRes();
    req.method = 'GET';
    await handler(req, res);
    expect(mockSendJson).toHaveBeenCalledWith(expect.anything(), 405, { error: 'Method not allowed. Use POST.' });
  });

  it('rejects missing audio body', async () => {
    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(mockSendJson).toHaveBeenCalledWith(expect.anything(), 400, { error: 'Empty audio body.' });
  });

  it('rejects unsupported audio format', async () => {
    const { req, res, chunks } = createMockReqRes();
    req.headers['content-type'] = 'audio/unsupported';
    chunks.push(Buffer.from('fake audio'));
    await handler(req, res);
    expect(mockSendJson).toHaveBeenCalledWith(expect.anything(), 400, expect.objectContaining({ error: expect.stringContaining('Unsupported audio format') }));
  });

  it('enforces 10 MB size limit', async () => {
    const { req, res, chunks } = createMockReqRes();
    chunks.push(Buffer.alloc(11 * 1024 * 1024));
    await handler(req, res);
    expect(mockSendJson).toHaveBeenCalledWith(expect.anything(), 413, { error: 'Audio too large. Max 10 MB.' });
  });

  it('sends correct multipart fields to Prisma v3.0', async () => {
    const { req, res, chunks } = createMockReqRes();
    chunks.push(Buffer.from('RIFF....WAVE'));

    const upstreamBody = {
      success: true,
      request_id: 'req_123',
      transcript: 'Hello world',
      model: 'prisma-v3.0',
      processing_time: 120,
      end_to_end_latency: 340,
      detected_language_code: 'hi',
    };
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify(upstreamBody)),
    });
    mockReadJsonSafe.mockResolvedValue(upstreamBody);

    await handler(req, res);

    expect(mockFetchWithTimeout).toHaveBeenCalled();
    const call = mockFetchWithTimeout.mock.calls[0];
    expect(call[0]).toBe('https://api.vachana.ai/stt/v3');
    expect(call[1].method).toBe('POST');
    expect(call[1].headers).toEqual({ 'X-API-Key-ID': 'test-key' });

    expect(mockSendJson).toHaveBeenCalledWith(expect.anything(), 200, expect.objectContaining({
      transcript: 'Hello world',
      language: 'hi',
      truncated: false,
    }));
  });

  it('handles empty transcript from upstream', async () => {
    const { req, res, chunks } = createMockReqRes();
    chunks.push(Buffer.from('RIFF....WAVE'));

    const upstreamBody = {
      success: true,
      request_id: 'req_123',
      transcript: '',
      model: 'prisma-v3.0',
      processing_time: 120,
      end_to_end_latency: 340,
      detected_language_code: 'hi',
    };
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify(upstreamBody)),
    });
    mockReadJsonSafe.mockResolvedValue(upstreamBody);

    await handler(req, res);

    expect(mockSendJson).toHaveBeenCalledWith(expect.anything(), 200, expect.objectContaining({
      transcript: '',
      empty: true,
    }));
  });

  it('handles truncated transcript flag', async () => {
    const { req, res, chunks } = createMockReqRes();
    chunks.push(Buffer.from('RIFF....WAVE'));

    const upstreamBody = {
      success: true,
      request_id: 'req_123',
      transcript: 'Partial transcript',
      model: 'prisma-v3.0',
      processing_time: 120,
      end_to_end_latency: 340,
      detected_language_code: 'hi',
      truncated: true,
    };
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify(upstreamBody)),
    });
    mockReadJsonSafe.mockResolvedValue(upstreamBody);

    await handler(req, res);

    expect(mockSendJson).toHaveBeenCalledWith(expect.anything(), 200, expect.objectContaining({
      truncated: true,
    }));
  });

  it('handles 401 authentication failure', async () => {
    const { req, res, chunks } = createMockReqRes();
    chunks.push(Buffer.from('RIFF....WAVE'));

    mockFetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue('Unauthorized'),
    });

    await handler(req, res);

    expect(mockSendJson).toHaveBeenCalledWith(expect.anything(), 401, { error: 'Invalid or missing API credentials.' });
  });

  it('handles 429 rate limiting', async () => {
    const { req, res, chunks } = createMockReqRes();
    chunks.push(Buffer.from('RIFF....WAVE'));

    mockFetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 429,
      text: vi.fn().mockResolvedValue('Rate limited'),
    });

    await handler(req, res);

    expect(mockSendJson).toHaveBeenCalledWith(expect.anything(), 429, { error: 'Rate limit exceeded. Please retry.' });
  });

  it('handles 422 invalid audio', async () => {
    const { req, res, chunks } = createMockReqRes();
    chunks.push(Buffer.from('RIFF....WAVE'));

    mockFetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 422,
      text: vi.fn().mockResolvedValue('Invalid format'),
    });

    await handler(req, res);

    expect(mockSendJson).toHaveBeenCalledWith(expect.anything(), 400, { error: 'Invalid audio format or parameters.' });
  });

  it('handles 500 upstream errors', async () => {
    const { req, res, chunks } = createMockReqRes();
    chunks.push(Buffer.from('RIFF....WAVE'));

    mockFetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('Internal error'),
    });

    await handler(req, res);

    expect(mockSendJson).toHaveBeenCalledWith(expect.anything(), 502, { error: 'Transcription service temporarily unavailable.' });
  });

  it('handles 504 gateway timeout from fetch', async () => {
    const { req, res, chunks } = createMockReqRes();
    chunks.push(Buffer.from('RIFF....WAVE'));

    mockFetchWithTimeout.mockRejectedValue(new Error('Upstream request timed out'));

    await handler(req, res);

    expect(mockSendJson).toHaveBeenCalledWith(expect.anything(), 504, { error: 'Transcription upstream timeout.' });
  });

  it('handles upstream success: false', async () => {
    const { req, res, chunks } = createMockReqRes();
    chunks.push(Buffer.from('RIFF....WAVE'));

    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        success: false,
        message: 'Audio too short',
      })),
    });
    mockReadJsonSafe.mockResolvedValue({
      success: false,
      message: 'Audio too short',
    });

    await handler(req, res);

    expect(mockSendJson).toHaveBeenCalledWith(expect.anything(), 502, { error: 'Audio too short' });
  });

  it('handles malformed upstream JSON', async () => {
    const { req, res, chunks } = createMockReqRes();
    chunks.push(Buffer.from('RIFF....WAVE'));

    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('not json at all'),
    });
    mockReadJsonSafe.mockResolvedValue(null);

    await handler(req, res);

    expect(mockSendJson).toHaveBeenCalledWith(expect.anything(), 502, { error: 'Transcription returned an unexpected shape.' });
  });

  it('handles missing env vars', async () => {
    const { req, res, chunks } = createMockReqRes();
    chunks.push(Buffer.from('RIFF....WAVE'));
    delete process.env.GNANI_API_KEY;

    await handler(req, res);

    expect(mockSendJson).toHaveBeenCalledWith(expect.anything(), 500, expect.objectContaining({ error: expect.stringContaining('Server misconfigured') }));
  });

  it('rejects placeholder STT URL', async () => {
    const { req, res, chunks } = createMockReqRes();
    chunks.push(Buffer.from('RIFF....WAVE'));
    process.env.GNANI_STT_URL = 'https://REPLACE_FROM_GNANI_DOCS';

    await handler(req, res);

    expect(mockSendJson).toHaveBeenCalledWith(expect.anything(), 500, expect.objectContaining({ error: expect.stringContaining('placeholder') }));
  });
});