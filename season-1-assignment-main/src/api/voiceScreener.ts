import { transcribe } from './voiceScreen';
import type { EvaluationResponse } from './voiceScreen';

export interface AnswerScore {
  question: string;
  transcript: string;
  scores: Record<string, number>;
  strengths: string[];
  red_flags: string[];
  summary: string;
}

export interface SavedScreening {
  candidate_name: string;
  role: string | null;
  overall: { average: number; recommendation: 'Advance' | 'Hold' | 'Reject' };
  answers: AnswerScore[];
}

export async function evaluateAnswer(
  question: string,
  transcript: string,
): Promise<EvaluationResponse> {
  const res = await fetch('/api/voice-eval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, transcript, rubric: ['Communication clarity', 'Problem solving', 'Relevant experience'] }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Evaluation failed' }));
    throw new Error(err.error ?? `Evaluation failed (${res.status})`);
  }
  return res.json();
}

export async function saveScreening(payload: Omit<SavedScreening, 'id'>): Promise<string> {
  const res = await fetch('/api/voice-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Save failed' }));
    throw new Error(err.error ?? `Save failed (${res.status})`);
  }
  const data = await res.json();
  return (data as { id?: string }).id ?? '';
}

export { transcribe };
