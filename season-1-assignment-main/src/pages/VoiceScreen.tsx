import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mic, Square, LoaderCircle, Sparkles } from 'lucide-react';
import { startRecording, stopRecording, decodeToWav } from '../lib/recorder';
import { transcribe, evaluateAnswer } from '../api/voiceScreener';

const QUESTIONS = [
  'Tell me about yourself',
  'Describe a project you’re proud of',
  'Why do you want this role?',
];

const MAX_SECONDS = 90;

const DEMO_TRANSCRIPTS = [
  'Mere naam Priya hai, main ek full-stack developer hoon jo pichhle teen saal se React aur Node par kaam kar rahi hoon. Mera proud project ek resume screening tool tha jo humne 4 hafton mein ship kiya aur 40% time bachaaya.',
  'Mainne ek full-stack resume screening tool banaya. Chaar haft mein ship kiya, 40% time bachaaya.',
  'Pehli baar mein talent hunting aur deep learning kayi saal se kar rahi hoon. Yeh role mere background ko aur zyada prawna chaata hai.',
];

type Stage = 'name' | 'answering' | 'submitting' | 'done';

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function ProgressDots({ active }: { active: number }) {
  return (
    <span style={{ display: 'flex', gap: 6 }}>
      {QUESTIONS.map((_, i) => (
        <span
          key={i}
          style={{
            width: 22, height: 4, borderRadius: 2, display: 'inline-block',
            background: i === active ? 'var(--primary-brand)' : 'rgba(255,255,255,0.1)',
          }}
        />
      ))}
    </span>
  );
}

export default function VoiceScreen() {
  const [params] = useSearchParams();
  const role = params.get('role')?.trim() || null;
  const demoOn = params.get('demo') === '1';

  const [name, setName] = useState('');
  const [stage, setStage] = useState<Stage>('name');
  const [currentQ, setCurrentQ] = useState(0);
  const [transcripts, setTranscripts] = useState<(string | null)[]>(() => QUESTIONS.map(() => null));
  const [currentTranscript, setCurrentTranscript] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceId, setReferenceId] = useState<string | null>(null);

  const controllerRef = useRef<Awaited<ReturnType<typeof startRecording>> | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    clearTimer();
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      setElapsed((p) => (p + 1 >= MAX_SECONDS ? MAX_SECONDS : p + 1));
    }, 1000);
  };

  useEffect(() => {
    return () => {
      clearTimer();
      const ctl = controllerRef.current;
      if (ctl?.recorder && ctl.recorder.state !== 'inactive') {
        try { ctl.recorder.stop(); } catch { /* already stopped */ }
      }
      ctl?.mediaStream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmitName = () => {
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    setError(null);
    setCurrentQ(0);
    setTranscripts(QUESTIONS.map(() => null));
    setCurrentTranscript(null);
    setStage('answering');
  };

  const handleStart = async () => {
    setError(null);
    setCurrentTranscript(null);
    try {
      controllerRef.current = await startRecording();
      setIsRecording(true);
      startTimer();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Microphone permission denied. Please allow mic access and try again.';
      setError(msg);
    }
  };

  const handleStop = async () => {
    const ctl = controllerRef.current;
    if (!ctl) return;
    clearTimer();
    controllerRef.current = null;
    setIsRecording(false);
    setProcessing(true);
    setError(null);
    try {
      const rawBlob = await stopRecording(ctl);
      const wavBlob = await decodeToWav(rawBlob);
      const stt = await transcribe(wavBlob);
      if (!stt.transcript?.trim()) {
        setError('No speech detected. Please try again with a clearer answer.');
        return;
      }
      setCurrentTranscript(stt.transcript.trim());
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong while recording.';
      setError(msg);
    } finally {
      setProcessing(false);
    }
  };

  // Auto-stop at the cap.
  useEffect(() => {
    if (elapsed >= MAX_SECONDS && isRecording) {
      void handleStop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, isRecording]);

  const handleReRecord = () => {
    setCurrentTranscript(null);
    void handleStart();
  };

  const submitAll = async (finalTranscripts: (string | null)[]) => {
    setStage('submitting');
    setError(null);
    try {
      const answers = await Promise.all(
        finalTranscripts.map(async (t, i) => {
          const transcript = t ?? '';
          const ev = await evaluateAnswer(QUESTIONS[i], transcript);
          return {
            question: QUESTIONS[i],
            transcript,
            scores: ev.scores,
            strengths: ev.strengths,
            red_flags: ev.red_flags,
            summary: ev.summary,
          };
        }),
      );
      const res = await fetch('/api/voice-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_name: name.trim(),
          role,
          answers,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Submission failed' }));
        throw new Error((errBody as { error?: string }).error ?? `Submission failed (${res.status})`);
      }
      const saved = (await res.json().catch(() => ({}))) as { id?: string };
      if (saved.id) setReferenceId(saved.id);
      setStage('done');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Submission failed. Please try again.';
      setError(msg);
      setStage('answering');
    }
  };

  const handleConfirm = () => {
    if (!currentTranscript) return;
    const next = transcripts.slice();
    next[currentQ] = currentTranscript;
    setTranscripts(next);
    setCurrentTranscript(null);
    setElapsed(0);
    if (currentQ < QUESTIONS.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      void submitAll(next);
    }
  };

  const handleLoadDemo = () => {
    if (!demoOn) return;
    const demoName = name.trim() || 'Demo Candidate';
    setName(demoName);
    setTranscripts(DEMO_TRANSCRIPTS.slice());
    setStage('done');
  };

  const handleRestart = () => {
    clearTimer();
    setName('');
    setCurrentQ(0);
    setTranscripts(QUESTIONS.map(() => null));
    setCurrentTranscript(null);
    setElapsed(0);
    setError(null);
    setStage('name');
  };

  const submitting = stage === 'submitting';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header style={{ padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(9,9,26,0.98)' }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: 0 }}>HireFlow Voice</h1>
        <p style={{ fontSize: 12, color: 'var(--outline)', marginTop: 2 }}>Tell us about yourself. We score your answers internally.</p>
      </header>

      {stage === 'name' && (
        <div style={{ maxWidth: 420, margin: '0 auto', padding: '60px 24px', width: '100%', boxSizing: 'border-box' }}>
          <label htmlFor="name-input" style={{ display: 'block', fontSize: 11, fontFamily: "'Geist Mono', monospace", fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--outline)', marginBottom: 7 }}>Candidate name</label>
          <input
            id="name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitName(); }}
            placeholder="Enter your name"
            autoFocus
            style={{ width: '100%', padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: 'var(--on-surface)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
          {role && (
            <p style={{ marginTop: 10, fontSize: 11, color: 'var(--outline)', fontFamily: "'Geist Mono', monospace", letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Role: {role}
            </p>
          )}
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleSubmitName} className="btn-primary" style={{ fontSize: 13, padding: '10px 22px' }}>Start</button>
          </div>
          {demoOn && (
            <button onClick={handleLoadDemo} className="btn-ghost mt-3" style={{ fontSize: 11, color: 'var(--outline)', fontFamily: "'Geist Mono', monospace", letterSpacing: '0.06em', textTransform: 'uppercase' }}>Load demo data (no API)</button>
          )}
          {error && <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 9, background: 'rgba(255,122,147,0.08)', border: '1px solid rgba(255,122,147,0.25)', color: 'var(--error)', fontSize: 13, lineHeight: 1.55 }}>{error}</div>}
        </div>
      )}

      {(stage === 'answering' || stage === 'submitting') && (
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '32px 24px', width: '100%', boxSizing: 'border-box' }}>
          <div className="glass-card-solid" style={{ padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--outline)' }}>
                Question {currentQ + 1} of {QUESTIONS.length}
              </span>
              <ProgressDots active={currentQ} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--on-surface)', lineHeight: 1.4, margin: '4px 0 18px' }}>
              {QUESTIONS[currentQ]}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '14px 0 4px' }}>
              {isRecording ? (
                <button onClick={() => void handleStop()} disabled={submitting || processing} className="btn-primary" style={{ width: 88, height: 88, borderRadius: '50%', padding: 0, background: 'linear-gradient(135deg, #ff5a7a 0%, #ff7a93 100%)', boxShadow: '0 0 28px rgba(255,90,122,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Square size={28} color="#fff" />
                </button>
              ) : (
                <button onClick={() => void handleStart()} disabled={submitting || processing} className="btn-primary" style={{ width: 88, height: 88, borderRadius: '50%', padding: 0, background: 'linear-gradient(135deg, #5b5ef4 0%, #9f77f7 100%)', boxShadow: '0 0 28px rgba(91,94,244,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {processing ? <LoaderCircle size={30} color="#fff" style={{ animation: 'spin 1s linear infinite' }} /> : <Mic size={30} color="#fff" />}
                </button>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 18, fontWeight: 700, color: isRecording ? 'var(--error)' : 'var(--on-surface)' }}>{formatTime(elapsed)}</span>
                <span style={{ color: 'var(--outline)', fontSize: 12 }}>/ {formatTime(MAX_SECONDS)}</span>
                {isRecording && <span className="dot-pulse" />}
              </div>
              <p style={{ fontSize: 12, color: 'var(--outline)', margin: 0 }}>
                {isRecording ? 'Recording… tap stop when done' : processing ? 'Transcribing…' : submitting ? 'Submitting…' : 'Tap to start recording'}
              </p>
            </div>

            {error && (
              <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 9, background: 'rgba(255,122,147,0.08)', border: '1px solid rgba(255,122,147,0.25)', color: 'var(--error)', fontSize: 13, lineHeight: 1.55 }}>
                {error}
              </div>
            )}

            {currentTranscript && !isRecording && (
              <div style={{ marginTop: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface)', margin: '12px 0 6px' }}>Your answer</p>
                <p style={{ fontSize: 13, color: 'var(--on-surface-muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {currentTranscript}
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                  <button onClick={handleConfirm} disabled={submitting} className="btn-primary" style={{ fontSize: 12, padding: '9px 18px' }}>
                    {currentQ < QUESTIONS.length - 1 ? 'Continue →' : 'Submit answers'}
                  </button>
                  <button onClick={handleReRecord} disabled={submitting || processing} className="btn-ghost" style={{ fontSize: 11, color: 'var(--outline)', fontFamily: "'Geist Mono', monospace", letterSpacing: '0.06em', textTransform: 'uppercase' }}>Re-record</button>
                </div>
              </div>
            )}

            {submitting && (
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--outline)', fontSize: 12 }}>
                <LoaderCircle size={14} style={{ animation: 'spin 1s linear infinite' }} /> Submitting your responses…
              </div>
            )}
          </div>
        </div>
      )}

      {stage === 'done' && (
        <div style={{ maxWidth: 420, margin: '0 auto', padding: '50px 24px', width: '100%', boxSizing: 'border-box' }}>
          <Sparkles size={36} color="var(--tertiary)" />
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginTop: 10 }}>Thanks, your responses were submitted</h2>
          <p style={{ fontSize: 13, color: 'var(--on-surface-muted)', marginTop: 6 }}>
            Your screening has been saved. A recruiter will review your answers separately.
          </p>
          <p style={{ fontSize: 12, color: 'var(--outline)', marginTop: 10, fontFamily: "'Geist Mono', monospace" }}>
            Reference ID: {referenceId ?? '—'}
          </p>
          {referenceId && (
            <a
              href={`/voice-results/${encodeURIComponent(referenceId)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-block', marginTop: 6, color: 'var(--primary-brand)', textDecoration: 'none', fontSize: 13 }}
            >
              Recruiter view
            </a>
          )}
          <button onClick={handleRestart} className="btn-primary mt-3" style={{ fontSize: 13, padding: '10px 22px' }}>Start over</button>
        </div>
      )}
    </div>
  );
}
