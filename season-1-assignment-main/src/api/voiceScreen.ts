/**
 * Client-side wrappers for the voice screening serverless routes.
 * Same-origin only; API keys stay on the server.
 */

export interface TranscriptionResponse {
  transcript: string;
  language?: string;
  truncated?: boolean;
  empty?: boolean;
}

export interface EvaluationResponse {
  scores: Record<string, number>;
  strengths: string[];
  red_flags: string[];
  summary: string;
  provider: 'evon' | 'groq';
}

/**
 * POST raw audio bytes (audio/wav) to /api/voice-stt and return the transcript.
 * `language` is accepted for API compatibility but the backend currently
 * always uses `indic-auto` detection.
 */
export async function transcribe(blob: Blob, language?: string): Promise<TranscriptionResponse> {
  const response = await fetch('/api/voice-stt', {
    method: 'POST',
    headers: {
      'Content-Type': blob.type || 'audio/wav',
      ...(language ? { 'X-Language': language } : {}),
    },
    body: blob,
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: 'Transcription failed' }));
    throw new Error((errBody as { error?: string }).error ?? `Transcription failed (${response.status})`);
  }

  return response.json();
}

/**
 * POST JSON { question, transcript, rubric } to /api/voice-eval and return scores/feedback.
 */
export async function evaluate(input: {
  question: string;
  transcript: string;
  rubric: string[];
}): Promise<EvaluationResponse> {
  const response = await fetch('/api/voice-eval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: 'Evaluation failed' }));
    throw new Error((errBody as { error?: string }).error ?? `Evaluation failed (${response.status})`);
  }

  return response.json();
}
