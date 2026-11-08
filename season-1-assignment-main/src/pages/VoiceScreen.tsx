import { useState, useEffect, useRef } from 'react';
import { Mic, Square, LoaderCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { startRecording, stopRecording, decodeToWav, type MediaRecorderController } from '../lib/recorder';
import { transcribe, evaluate, type EvaluationResponse } from '../api/voiceScreen';

const QUESTIONS = [
  'Tell me about yourself',
  'Describe a project you’re proud of',
  'Why do you want this role?',
];

const RUBRIC = ['Communication clarity', 'Problem solving', 'Relevant experience'];

const LANGUAGES = [
  { value: 'auto', label: 'Auto (recommended)' },
  { value: 'hi', label: 'Hindi' },
  { value: 'te', label: 'Telugu' },
  { value: 'en', label: 'English' },
] as const;

const MAX_SECONDS = 90;

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const DEMO_RESULT: EvaluationResponse = {
  scores: {
    'Communication clarity': 8,
    'Problem solving': 7,
    'Relevant experience': 9,
  },
  strengths: [
    'Strong, structured introduction.',
    'Concrete project story with measurable impact.',
  ],
  red_flags: [
    'Vague timeline on self-introduction.',
  ],
  summary: 'Clear, confident, and relevant. The project story shows strong problem-solving, with one slightly vague detail worth probing.',
  provider: 'groq',
};

const DEMO_TRANSCRIPT =
  'Mere naam Priya hai, main ek full-stack developer hoon jo pichhle teen saal se React aur Node par kaam kar rahi hoon. Mera proud project ek resume screening tool tha jo humne 4 hafton mein ship kiya aur 40% time bachaaya.';

export default function VoiceScreen() {
  const [qIndex, setQIndex] = useState(0);
  const [language, setLanguage] = useState<(typeof LANGUAGES)[number]['value']>('auto');

  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [detectedLanguage, setDetectedLanguage] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<EvaluationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const controllerRef = useRef<MediaRecorderController | null>(null);
  const timerRef = useRef<number | null>(null);

  // Timer while recording
  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1;
          if (next >= MAX_SECONDS) {
            // Auto-stop at cap
            handleAutoStop();
            return MAX_SECONDS;
          }
          return next;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRecording]);

  const handleAutoStop = () => {
    // Stop recording and process
    void handleStop();
  };

  const handleStart = async () => {
    setError(null);
    setTranscript(null);
    setDetectedLanguage(undefined);
    setResult(null);
    setElapsed(0);
    try {
      const ctl = await startRecording();
      controllerRef.current = ctl;
      setIsRecording(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Microphone permission denied. Please allow mic access and try again.';
      setError(msg);
    }
  };

  const handleStop = async () => {
    const ctl = controllerRef.current;
    if (!ctl) return;
    setIsRecording(false);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    controllerRef.current = null;

    setProcessing(true);
    setError(null);
    try {
      const rawBlob = await stopRecording(ctl);
      const wavBlob = await decodeToWav(rawBlob);
      const stt = await transcribe(wavBlob, language === 'auto' ? undefined : language);
      setTranscript(stt.transcript);
      setDetectedLanguage(stt.language);
      if (!stt.transcript?.trim()) {
        setError('No speech detected. Please try again with a clearer answer.');
        return;
      }
      const evalRes = await evaluate({
        question: QUESTIONS[qIndex],
        transcript: stt.transcript,
        rubric: RUBRIC,
      });
      setResult(evalRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setProcessing(false);
    }
  };

  const handleLoadDemo = () => {
    setError(null);
    setTranscript(DEMO_TRANSCRIPT);
    setDetectedLanguage('hi');
    setResult(DEMO_RESULT);
  };

  const handleNext = () => {
    if (qIndex < QUESTIONS.length - 1) {
      setQIndex(qIndex + 1);
      setTranscript(null);
      setDetectedLanguage(undefined);
      setResult(null);
      setError(null);
      setElapsed(0);
    }
  };

  const handleReset = () => {
    setQIndex(0);
    setTranscript(null);
    setDetectedLanguage(undefined);
    setResult(null);
    setError(null);
    setElapsed(0);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Minimal standalone header — no auth / sidebar dependency */}
      <header
        style={{
          padding: '14px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(9,9,26,0.98)',
        }}
      >
        <h1 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: 0 }}>HireFlow Voice</h1>
      </header>

      {/* Content */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--on-surface)', letterSpacing: '-0.02em', margin: 0 }}>
          Voice Screening
        </h1>
        <p style={{ fontSize: 13, color: 'var(--on-surface-muted)', marginTop: 3 }}>
          Record a response, get it transcribed, then scored against the rubric. Max 90 seconds per answer.
        </p>
      </div>

      {/* Question card */}
      <div className="glass-card-solid" style={{ padding: '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--outline)' }}>
            Question {qIndex + 1} of {QUESTIONS.length}
          </span>
          <span style={{ display: 'flex', gap: 6 }}>
            {QUESTIONS.map((_, i) => (
              <span
                key={i}
                style={{
                  width: 22,
                  height: 4,
                  borderRadius: 2,
                  background: i <= qIndex ? 'var(--primary-brand)' : 'rgba(255,255,255,0.1)',
                  display: 'inline-block',
                }}
              />
            ))}
          </span>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--on-surface)', lineHeight: 1.4, margin: '4px 0 18px' }}>
          {QUESTIONS[qIndex]}
        </h2>

        {/* Language selector */}
        <div style={{ marginBottom: 18 }}>
          <label htmlFor="lang-select" style={{ display: 'block', fontSize: 11, fontFamily: "'Geist Mono', monospace", fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--outline)', marginBottom: 7 }}>
            Language
          </label>
          <select
            id="lang-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value as typeof language)}
            disabled={isRecording || processing}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 9,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.09)',
              color: 'var(--on-surface)',
              fontSize: 13,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value} style={{ background: 'var(--surface-low)' }}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {/* Record controls */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '14px 0 4px' }}>
          {isRecording ? (
            <button
              onClick={handleStop}
              disabled={processing}
              className="btn-primary"
              style={{
                width: 88,
                height: 88,
                borderRadius: '50%',
                padding: 0,
                background: 'linear-gradient(135deg, #ff5a7a 0%, #ff7a93 100%)',
                boxShadow: '0 0 28px rgba(255,90,122,0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Square size={28} color="#fff" fill="#fff" />
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={processing}
              className="btn-primary"
              style={{
                width: 88,
                height: 88,
                borderRadius: '50%',
                padding: 0,
                background: 'linear-gradient(135deg, #5b5ef4 0%, #9f77f7 100%)',
                boxShadow: '0 0 28px rgba(91,94,244,0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {processing ? (
                <LoaderCircle size={30} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <Mic size={30} color="#fff" />
              )}
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 18, fontWeight: 700, color: isRecording ? 'var(--error)' : 'var(--on-surface)' }}>
              {formatTime(elapsed)}
            </span>
            <span style={{ color: 'var(--outline)', fontSize: 12 }}>/ {formatTime(MAX_SECONDS)}</span>
            {isRecording && <span className="dot-pulse" />}
          </div>
          <p style={{ fontSize: 12, color: 'var(--outline)', margin: 0 }}>
            {isRecording ? 'Recording… tap stop when done' : processing ? 'Scoring…' : 'Tap to start recording'}
          </p>
        </div>

        {/* Errors */}
        {error && (
          <div style={{
            marginTop: 14,
            padding: '12px 14px',
            borderRadius: 9,
            background: 'rgba(255,122,147,0.08)',
            border: '1px solid rgba(255,122,147,0.25)',
            color: 'var(--error)',
            fontSize: 13,
            lineHeight: 1.55,
          }}>
            {error}
          </div>
        )}

        {/* Loading divider */}
        {processing && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--outline)', fontSize: 12 }}>
            <LoaderCircle size={14} style={{ animation: 'spin 1s linear infinite' }} />
            Transcribing and evaluating…
          </div>
        )}
      </div>

      {/* Transcript */}
      {transcript !== null && (
        <div className="glass-card-solid" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>Transcript</p>
            {detectedLanguage && <span className="badge badge-purple" style={{ fontSize: 10 }}>{detectedLanguage}</span>}
          </div>
          <p style={{ fontSize: 14, color: 'var(--on-surface-muted)', lineHeight: 1.75, margin: 0, whiteSpace: 'pre-wrap' }}>
            {transcript || '—'}
          </p>
        </div>
      )}

      {/* Evaluation result */}
      {result && (
        <div className="glass-card-solid" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={16} color="var(--primary)" />
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>Evaluation</p>
              <span className="badge badge-purple" style={{ fontSize: 10 }}>{result.provider === 'evon' ? 'Evon' : 'Groq'}</span>
            </div>
            {qIndex < QUESTIONS.length - 1 && (
              <button onClick={handleNext} className="btn-primary" style={{ fontSize: 12, padding: '7px 14px' }}>
                Next question →
              </button>
            )}
            {qIndex === QUESTIONS.length - 1 && (
              <button onClick={handleReset} className="btn-secondary" style={{ fontSize: 12, padding: '7px 14px' }}>
                Start over
              </button>
            )}
          </div>

          {/* Criterion scores */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {RUBRIC.map((crit) => {
              const score = result.scores[crit] ?? 0;
              const color = score >= 8 ? '#3de8a8' : score >= 5 ? '#f7c040' : '#ff7a93';
              return (
                <div key={crit}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: 'var(--on-surface-muted)' }}>{crit}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "'Geist Mono', monospace" }}>{score}/10</span>
                  </div>
                  <div className="progress-bar-track" style={{ height: 6 }}>
                    <div className="progress-bar-fill" style={{ width: `${score * 10}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Strengths */}
          {result.strengths.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--tertiary)', margin: '0 0 8px' }}>
                Strengths
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {result.strengths.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <CheckCircle2 size={14} color="var(--tertiary)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 13, color: 'var(--on-surface-muted)', lineHeight: 1.6 }}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Red flags */}
          {result.red_flags.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--error)', margin: '0 0 8px' }}>
                Red flags
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {result.red_flags.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(255,122,147,0.15)', border: '1px solid rgba(255,122,147,0.4)', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--error)' }}>!</span>
                    <span style={{ fontSize: 13, color: 'var(--on-surface-muted)', lineHeight: 1.6 }}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          <div style={{ padding: '12px 14px', borderRadius: 9, background: 'rgba(91,94,244,0.07)', border: '1px solid rgba(91,94,244,0.2)' }}>
            <p style={{ fontSize: 13, color: 'var(--on-surface-muted)', lineHeight: 1.7, margin: 0 }}>{result.summary}</p>
          </div>
        </div>
      )}

      {/* Demo data */}
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
        <button
          onClick={handleLoadDemo}
          className="btn-secondary"
          style={{ fontSize: 12, padding: '8px 16px' }}
        >
          <Sparkles size={13} /> Load demo data
        </button>
      </div>
    </div>
  );
}
