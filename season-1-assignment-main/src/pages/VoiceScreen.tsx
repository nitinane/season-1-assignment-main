import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mic, Square, LoaderCircle, Sparkles, Volume2 } from 'lucide-react';
import { startRecording, stopRecording, decodeToWav } from '../lib/recorder';
import { transcribe, evaluateAnswer } from '../api/voiceScreener';
import { getJobById } from '../lib/jobs';

const DEFAULT_QUESTIONS = [
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

function ProgressDots({ active, count }: { active: number; count: number }) {
  return (
    <span style={{ display: 'flex', gap: 6 }}>
      {Array.from({ length: count }).map((_, i) => (
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
  const jobParam = params.get('job')?.trim() || null;
  const nameParam = params.get('name')?.trim() || '';
  const emailParam = params.get('email')?.trim() || '';
  const roleParam = params.get('role')?.trim() || null;
  const demoOn = params.get('demo') === '1';

  const matchedJob = jobParam ? getJobById(jobParam) : undefined;
  const activeJobTitle = matchedJob?.title || roleParam || (jobParam ? jobParam : null);
  const questions = matchedJob ? matchedJob.questions : DEFAULT_QUESTIONS;

  const [name, setName] = useState(nameParam);
  const [email] = useState(emailParam);
  const [stage, setStage] = useState<Stage>('name');
  const [currentQ, setCurrentQ] = useState(0);
  const [transcripts, setTranscripts] = useState<(string | null)[]>(() => questions.map(() => null));
  const [currentTranscript, setCurrentTranscript] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceId, setReferenceId] = useState<string | null>(null);

  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [ttsNotice, setTtsNotice] = useState<string | null>(null);

  const controllerRef = useRef<Awaited<ReturnType<typeof startRecording>> | null>(null);
  const timerRef = useRef<number | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Record<number, string>>({});

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

  const stopTts = () => {
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      } catch {
        /* ignore */
      }
      currentAudioRef.current = null;
    }
    setIsTtsPlaying(false);
    setIsTtsLoading(false);
  };

  const unlockAudio = () => {
    try {
      const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
      silentAudio.volume = 0;
      const playPromise = silentAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    } catch {
      /* ignore */
    }
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          void ctx.resume();
        }
      }
    } catch {
      /* ignore */
    }
  };

  const playQuestionAudio = async (qIndex: number) => {
    if (isRecording || processing) {
      return;
    }

    stopTts();
    setTtsNotice(null);
    setIsTtsLoading(true);

    const questionText = questions[qIndex];
    if (!questionText) {
      setIsTtsLoading(false);
      return;
    }

    try {
      let audioUrl = audioCacheRef.current[qIndex];
      if (!audioUrl) {
        const res = await fetch('/api/voice-tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: questionText, language: 'hi-en' }),
        });

        if (!res.ok) {
          throw new Error('TTS fetch failed');
        }

        const blob = await res.blob();
        audioUrl = URL.createObjectURL(blob);
        audioCacheRef.current[qIndex] = audioUrl;
      }

      if (isRecording || processing) {
        setIsTtsLoading(false);
        return;
      }

      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      audio.onended = () => {
        setIsTtsPlaying(false);
        currentAudioRef.current = null;
      };

      audio.onerror = () => {
        setIsTtsPlaying(false);
        setIsTtsLoading(false);
        currentAudioRef.current = null;
        setTtsNotice('Audio unavailable, read the question below');
      };

      setIsTtsLoading(false);
      setIsTtsPlaying(true);
      await audio.play();
    } catch {
      setIsTtsLoading(false);
      setIsTtsPlaying(false);
      currentAudioRef.current = null;
      setTtsNotice('Audio unavailable, read the question below');
    }
  };

  useEffect(() => {
    return () => {
      stopTts();
      clearTimer();
      const ctl = controllerRef.current;
      if (ctl?.recorder && ctl.recorder.state !== 'inactive') {
        try { ctl.recorder.stop(); } catch { /* already stopped */ }
      }
      ctl?.mediaStream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleStartInterview = () => {
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    unlockAudio();
    setError(null);
    setCurrentQ(0);
    setTranscripts(questions.map(() => null));
    setCurrentTranscript(null);
    setStage('answering');
    void playQuestionAudio(0);
  };

  const handleStart = async () => {
    if (isTtsLoading || isTtsPlaying) return;
    stopTts();
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
    stopTts();
    setStage('submitting');
    setError(null);
    try {
      const answers = await Promise.all(
        finalTranscripts.map(async (t, i) => {
          const transcript = t ?? '';
          const ev = await evaluateAnswer(questions[i], transcript);
          return {
            question: questions[i],
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
          role: activeJobTitle,
          job_id: jobParam || undefined,
          email: email.trim() || undefined,
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
    if (currentQ < questions.length - 1) {
      const nextQ = currentQ + 1;
      setCurrentQ(nextQ);
      void playQuestionAudio(nextQ);
    } else {
      void submitAll(next);
    }
  };

  const handleLoadDemo = () => {
    if (!demoOn) return;
    stopTts();
    const demoName = name.trim() || 'Demo Candidate';
    setName(demoName);
    setTranscripts(DEMO_TRANSCRIPTS.slice(0, questions.length));
    setStage('done');
  };

  const handleRestart = () => {
    stopTts();
    clearTimer();
    setName(nameParam);
    setCurrentQ(0);
    setTranscripts(questions.map(() => null));
    setCurrentTranscript(null);
    setElapsed(0);
    setError(null);
    setTtsNotice(null);
    setStage('name');
  };

  const isTtsBusy = isTtsLoading || isTtsPlaying;
  const submitting = stage === 'submitting';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header style={{ padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(9,9,26,0.98)' }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: 0 }}>HireFlow Voice</h1>
        <p style={{ fontSize: 12, color: 'var(--outline)', marginTop: 2 }}>Tell us about yourself. We score your answers internally.</p>
      </header>

      {stage === 'name' && (
        <div style={{ maxWidth: 420, margin: '0 auto', padding: '60px 24px', width: '100%', boxSizing: 'border-box' }}>
          {nameParam ? (
            <div style={{ marginBottom: 16 }}>
              <span style={{ display: 'block', fontSize: 11, fontFamily: "'Geist Mono', monospace", fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--outline)', marginBottom: 4 }}>
                Candidate Profile
              </span>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>{name}</p>
              {email && (
                <p style={{ fontSize: 12, color: 'var(--outline)', marginTop: 4, fontFamily: "'Geist Mono', monospace" }}>{email}</p>
              )}
            </div>
          ) : (
            <>
              <label htmlFor="name-input" style={{ display: 'block', fontSize: 11, fontFamily: "'Geist Mono', monospace", fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--outline)', marginBottom: 7 }}>Candidate name</label>
              <input
                id="name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleStartInterview(); }}
                placeholder="Enter your name"
                autoFocus
                style={{ width: '100%', padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: 'var(--on-surface)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </>
          )}

          {activeJobTitle && (
            <p style={{ marginTop: 10, fontSize: 11, color: 'var(--outline)', fontFamily: "'Geist Mono', monospace", letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Role: {activeJobTitle}
            </p>
          )}

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleStartInterview} className="btn-primary" style={{ fontSize: 13, padding: '10px 22px' }}>Start interview</button>
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
                Question {currentQ + 1} of {questions.length}
              </span>
              <ProgressDots active={currentQ} count={questions.length} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--on-surface)', lineHeight: 1.4, margin: '4px 0 18px' }}>
              {questions[currentQ]}
            </h2>

            {ttsNotice && (
              <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--outline)', fontStyle: 'italic' }}>
                {ttsNotice}
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '14px 0 4px' }}>
              {isRecording ? (
                <button onClick={() => void handleStop()} disabled={submitting || processing} className="btn-primary" style={{ width: 88, height: 88, borderRadius: '50%', padding: 0, background: 'linear-gradient(135deg, #ff5a7a 0%, #ff7a93 100%)', boxShadow: '0 0 28px rgba(255,90,122,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Square size={28} color="#fff" />
                </button>
              ) : (
                <button onClick={() => void handleStart()} disabled={submitting || processing || isTtsBusy} className="btn-primary" style={{ width: 88, height: 88, borderRadius: '50%', padding: 0, background: 'linear-gradient(135deg, #5b5ef4 0%, #9f77f7 100%)', boxShadow: '0 0 28px rgba(91,94,244,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isTtsBusy ? 0.6 : 1, cursor: isTtsBusy ? 'not-allowed' : 'pointer' }}>
                  {processing ? <LoaderCircle size={30} color="#fff" style={{ animation: 'spin 1s linear infinite' }} /> : <Mic size={30} color="#fff" />}
                </button>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 18, fontWeight: 700, color: isRecording ? 'var(--error)' : 'var(--on-surface)' }}>{formatTime(elapsed)}</span>
                <span style={{ color: 'var(--outline)', fontSize: 12 }}>/ {formatTime(MAX_SECONDS)}</span>
                {isRecording && <span className="dot-pulse" />}
              </div>
              <p style={{ fontSize: 12, color: 'var(--outline)', margin: 0 }}>
                {isTtsLoading
                  ? 'Loading question audio…'
                  : isTtsPlaying
                  ? 'Playing question audio…'
                  : isRecording
                  ? 'Recording… tap stop when done'
                  : processing
                  ? 'Transcribing…'
                  : submitting
                  ? 'Submitting…'
                  : 'Tap to start recording'}
              </p>

              <button
                type="button"
                onClick={() => void playQuestionAudio(currentQ)}
                disabled={isRecording || processing || isTtsBusy || submitting}
                className="btn-ghost"
                style={{
                  fontSize: 12,
                  color: isRecording || processing || isTtsBusy || submitting ? 'var(--outline)' : 'var(--primary-brand)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: isRecording || processing || isTtsBusy || submitting ? 'not-allowed' : 'pointer',
                  marginTop: 4,
                }}
              >
                <Volume2 size={14} /> Replay question
              </button>
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
                    {currentQ < questions.length - 1 ? 'Continue →' : 'Submit answers'}
                  </button>
                  <button onClick={handleReRecord} disabled={submitting || processing || isTtsBusy} className="btn-ghost" style={{ fontSize: 11, color: 'var(--outline)', fontFamily: "'Geist Mono', monospace", letterSpacing: '0.06em', textTransform: 'uppercase' }}>Re-record</button>
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
