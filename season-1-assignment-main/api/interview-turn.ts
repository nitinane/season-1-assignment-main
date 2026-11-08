// api/interview-turn.ts
// Handles dynamic 5-turn voice interview progression, server-side focus generation, and final scoring.

import { sendJson } from './_gnani.js';
import { getDb } from './_db.js';
import { chatJson } from './_llm.js';

const TOTAL_QUESTIONS = 5;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FOCUSES = [
  'project deep-dive from resume',
  'verify a listed skill',
  'problem-solving scenario from the JD',
  'behavioral/teamwork',
  'communication under pressure',
  'motivation for this role',
];

interface Turn {
  question: string;
  focus?: string;
  transcript?: string;
  score?: number;
  feedback?: string;
  criteria?: { relevance: number; depth: number; clarity: number };
}

function pickFocus(used: string[]): string {
  const pool = FOCUSES.filter((f) => !used.includes(f));
  const options = pool.length > 0 ? pool : FOCUSES;
  return options[Math.floor(Math.random() * options.length)];
}

async function parseBody(req: any): Promise<any> {
  let body = req.body;
  if (body === undefined || (typeof body === 'string' && body.trim() === '')) {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return null;
    }
  } else if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body;
}

async function generateFirstQuestion(
  focus: string,
  jobTitle: string,
  jdText: string,
  resumeText: string,
): Promise<string> {
  const messages = [
    {
      role: 'system',
      content:
        `You are an expert AI interviewer conducting a voice interview for the role of ${jobTitle}. ` +
        `Generate exactly one interview question with focus: "${focus}". ` +
        `Rules: max 30 words, spoken-friendly simple English (conversational Hinglish is acceptable), ` +
        `never repeat an earlier question, no bullet points, no lists, conversational and clear. ` +
        `Respond with valid JSON only: { "question": "string" }`,
    },
    {
      role: 'user',
      content:
        `Job Title: ${jobTitle}\n\n` +
        `Job Description:\n${jdText.slice(0, 3000)}\n\n` +
        `Candidate Resume:\n${resumeText.slice(0, 3000)}\n\n` +
        `Generate the first interview question as JSON.`,
    },
  ];

  try {
    const res = await chatJson(messages, { temperature: 0.9 });
    const q = typeof res?.data?.question === 'string' ? res.data.question.trim() : '';
    if (q) return q;
  } catch {
    /* fallback below */
  }

  return 'Could you please tell me about yourself and your background relevant to this role?';
}

async function evaluateAnswerAndNext(
  currentQuestion: string,
  transcript: string,
  nextFocus: string | null,
  jobTitle: string,
  jdText: string,
  resumeText: string,
  previousTurns: Turn[],
  needsNextQuestion: boolean,
): Promise<{
  score: number;
  feedback: string;
  criteria: { relevance: number; depth: number; clarity: number };
  next_question: string | null;
}> {
  const history = previousTurns
    .map((t, i) => `Q${i + 1}: ${t.question}\nAnswer: ${t.transcript ?? 'No answer'}`)
    .join('\n\n');

  const messages = [
    {
      role: 'system',
      content:
        `You are an expert AI hiring interviewer. Evaluate the candidate's spoken answer to the current interview question for the role of ${jobTitle}. ` +
        `Judge substance, clarity, and relevance regardless of accent or conversational Hinglish. ` +
        (needsNextQuestion
          ? `Also generate the next question with focus: "${nextFocus}". The next question must be max 30 words, spoken-friendly simple English (or Hinglish), conversational, no lists, never repeating previous questions. `
          : `Since this was the 5th and final question, next_question must be null. `) +
        `Respond with valid JSON only: { "score": number (0-10), "feedback": string (max 200 chars), "criteria": { "relevance": number (0-10), "depth": number (0-10), "clarity": number (0-10) }, "next_question": string | null }`,
    },
    {
      role: 'user',
      content:
        `Job Description:\n${jdText.slice(0, 2500)}\n\n` +
        `Candidate Resume:\n${resumeText.slice(0, 2500)}\n\n` +
        `Interview History:\n${history}\n\n` +
        `Current Question:\n${currentQuestion}\n\n` +
        `Candidate's Spoken Answer:\n${transcript}\n\n` +
        `Evaluate answer and return JSON.`,
    },
  ];

  try {
    const res = await chatJson(messages, { temperature: 0.9 });
    const d = res?.data ?? {};

    const scoreRaw = typeof d.score === 'number' ? d.score : 6;
    const score = Math.max(0, Math.min(10, Math.round(scoreRaw)));

    const feedbackRaw = typeof d.feedback === 'string' ? d.feedback.trim() : '';
    const feedback = feedbackRaw.slice(0, 200);

    const crit = d.criteria ?? {};
    const criteria = {
      relevance: Math.max(0, Math.min(10, Math.round(typeof crit.relevance === 'number' ? crit.relevance : score))),
      depth: Math.max(0, Math.min(10, Math.round(typeof crit.depth === 'number' ? crit.depth : score))),
      clarity: Math.max(0, Math.min(10, Math.round(typeof crit.clarity === 'number' ? crit.clarity : score))),
    };

    let next_question: string | null = null;
    if (needsNextQuestion) {
      if (typeof d.next_question === 'string' && d.next_question.trim()) {
        next_question = d.next_question.trim();
      } else {
        next_question = 'Could you describe a challenging technical or teamwork situation you resolved successfully?';
      }
    }

    return { score, feedback, criteria, next_question };
  } catch {
    return {
      score: 6,
      feedback: 'Good response with clear delivery.',
      criteria: { relevance: 6, depth: 6, clarity: 6 },
      next_question: needsNextQuestion ? 'What motivates you most about this opportunity?' : null,
    };
  }
}

async function generateFinalSummary(
  jobTitle: string,
  candidateName: string,
  turns: Turn[],
  interviewScore: number,
  recommendation: string,
): Promise<{ summary: string; strengths: string[]; red_flags: string[] }> {
  const turnsText = turns
    .map((t, i) => `Q${i + 1}: ${t.question}\nA: ${t.transcript ?? '—'} (Score: ${t.score ?? '—'}/10)`)
    .join('\n\n');

  const messages = [
    {
      role: 'system',
      content:
        `You are a senior hiring manager. Summarize the completed 5-question voice interview. ` +
        `Return valid JSON only with keys: summary (string, max 300 chars), strengths (string array, 2-4 points), red_flags (string array, 0-3 points).`,
    },
    {
      role: 'user',
      content:
        `Role: ${jobTitle}\n` +
        `Candidate: ${candidateName}\n` +
        `Interview Score: ${interviewScore}/100 (${recommendation})\n\n` +
        `Interview Turns:\n${turnsText}\n\n` +
        `Provide executive summary as JSON.`,
    },
  ];

  try {
    const res = await chatJson(messages, { temperature: 0.3 });
    const d = res?.data ?? {};

    const summary = typeof d.summary === 'string' ? d.summary.trim().slice(0, 300) : 'Interview completed.';
    const strengths = Array.isArray(d.strengths)
      ? d.strengths.filter((s: unknown) => typeof s === 'string').slice(0, 4)
      : [];
    const red_flags = Array.isArray(d.red_flags)
      ? d.red_flags.filter((s: unknown) => typeof s === 'string').slice(0, 3)
      : [];

    return { summary, strengths, red_flags };
  } catch {
    return {
      summary: 'Candidate completed all 5 voice interview questions.',
      strengths: ['Clear spoken communication', 'Direct responses to interview prompts'],
      red_flags: [],
    };
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
  }

  const body = await parseBody(req);
  if (!body || typeof body !== 'object') {
    return sendJson(res, 400, { error: 'Invalid JSON body.' });
  }

  const { application_id, action, transcript } = body as {
    application_id?: unknown;
    action?: unknown;
    transcript?: unknown;
  };

  if (typeof application_id !== 'string' || !UUID_REGEX.test(application_id.trim())) {
    return sendJson(res, 400, { error: 'Invalid application_id: must be a valid UUID.' });
  }

  if (action !== 'start' && action !== 'answer') {
    return sendJson(res, 400, { error: 'Invalid action: must be start or answer.' });
  }

  let db;
  try {
    db = getDb();
  } catch {
    return sendJson(res, 500, { error: 'Database misconfigured.' });
  }

  // ── Load Application ────────────────────────────────────────────────────────
  let app: any = null;
  try {
    const { data, error } = await db
      .from('iv_applications')
      .select('*')
      .eq('id', application_id.trim())
      .single();

    if (error || !data) {
      return sendJson(res, 404, { error: 'Application not found.' });
    }
    app = data;
  } catch {
    return sendJson(res, 502, { error: 'Failed to load application.' });
  }

  if (app.status === 'completed') {
    return sendJson(res, 200, { done: true });
  }

  // ── Load Job ────────────────────────────────────────────────────────────────
  let job: { title: string; jd_text: string } = {
    title: 'Position',
    jd_text: '',
  };
  if (app.job_id) {
    try {
      const { data: jobData } = await db
        .from('iv_jobs')
        .select('title, jd_text')
        .eq('id', app.job_id)
        .single();
      if (jobData) {
        job = jobData;
      }
    } catch {
      /* ignore job load error */
    }
  }

  const resumeText = typeof app.resume_text === 'string' ? app.resume_text : '';
  const turns: Turn[] = Array.isArray(app.turns) ? app.turns : [];
  const usedFocuses = turns.map((t) => t.focus).filter(Boolean) as string[];

  // ── Action: 'start' ─────────────────────────────────────────────────────────
  if (action === 'start') {
    if (turns.length > 0) {
      const lastTurn = turns[turns.length - 1];
      // If the last turn is unanswered, return its question again (page refresh resume)
      if (!lastTurn.transcript || lastTurn.score === undefined) {
        return sendJson(res, 200, {
          question: lastTurn.question,
          index: turns.length,
          total: TOTAL_QUESTIONS,
        });
      }
    }

    if (turns.length >= TOTAL_QUESTIONS) {
      return sendJson(res, 200, { done: true });
    }

    // Generate first question
    const focus = pickFocus(usedFocuses);
    const question = await generateFirstQuestion(focus, job.title, job.jd_text, resumeText);
    const newTurns: Turn[] = [...turns, { question, focus }];

    try {
      await db
        .from('iv_applications')
        .update({ turns: newTurns, status: 'in_progress' })
        .eq('id', app.id);
    } catch {
      return sendJson(res, 502, { error: 'Failed to initialize interview question.' });
    }

    return sendJson(res, 200, {
      question,
      index: newTurns.length,
      total: TOTAL_QUESTIONS,
    });
  }

  // ── Action: 'answer' ────────────────────────────────────────────────────────
  if (action === 'answer') {
    if (typeof transcript !== 'string' || transcript.trim().length < 1 || transcript.length > 3000) {
      return sendJson(res, 400, {
        error: 'Invalid transcript: must be between 1 and 3000 characters.',
      });
    }

    if (turns.length === 0) {
      return sendJson(res, 400, { error: 'No active question to answer.' });
    }

    const lastIdx = turns.length - 1;
    const lastTurn = turns[lastIdx];

    if (lastTurn.transcript && lastTurn.score !== undefined) {
      return sendJson(res, 400, { error: 'Last turn already answered.' });
    }

    const answeredCount = turns.length;
    const needsNextQuestion = answeredCount < TOTAL_QUESTIONS;
    const nextFocus = needsNextQuestion ? pickFocus([...usedFocuses, lastTurn.focus ?? '']) : null;

    const evaluation = await evaluateAnswerAndNext(
      lastTurn.question,
      transcript.trim(),
      nextFocus,
      job.title,
      job.jd_text,
      resumeText,
      turns.slice(0, lastIdx),
      needsNextQuestion,
    );

    // Save answer & scores on the current turn
    turns[lastIdx] = {
      ...lastTurn,
      transcript: transcript.trim(),
      score: evaluation.score,
      feedback: evaluation.feedback,
      criteria: evaluation.criteria,
    };

    if (needsNextQuestion && evaluation.next_question) {
      // Append next turn
      const updatedTurns = [...turns, { question: evaluation.next_question, focus: nextFocus ?? undefined }];
      try {
        await db
          .from('iv_applications')
          .update({ turns: updatedTurns, status: 'in_progress' })
          .eq('id', app.id);
      } catch {
        return sendJson(res, 502, { error: 'Failed to update interview turn.' });
      }

      // Never return score or feedback to the client
      return sendJson(res, 200, {
        question: evaluation.next_question,
        index: updatedTurns.length,
        total: TOTAL_QUESTIONS,
      });
    }

    // ── All 5 turns answered: Compute overall score and summary ───────────────
    const scores = turns.map((t) => t.score ?? 5);
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const interview_score = Math.round(avgScore * 10);
    const recommendation = interview_score >= 70 ? 'Advance' : interview_score >= 50 ? 'Hold' : 'Reject';

    const finalSummary = await generateFinalSummary(
      job.title,
      app.candidate_name,
      turns,
      interview_score,
      recommendation,
    );

    const overall = {
      interview_score,
      recommendation,
      summary: finalSummary.summary,
      strengths: finalSummary.strengths,
      red_flags: finalSummary.red_flags,
    };

    try {
      await db
        .from('iv_applications')
        .update({
          turns,
          status: 'completed',
          overall,
        })
        .eq('id', app.id);
    } catch {
      return sendJson(res, 502, { error: 'Failed to complete interview.' });
    }

    // Never return score or feedback to client
    return sendJson(res, 200, { done: true });
  }

  return sendJson(res, 400, { error: 'Invalid action.' });
}

