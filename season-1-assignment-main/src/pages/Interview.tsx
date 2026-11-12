import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Mic, Square, LoaderCircle, CheckCircle2, Sparkles, Volume2, AlertCircle, RefreshCw } from 'lucide-react';
import { startRecording, stopRecording, decodeToWav } from '../lib/recorder';

const MAX_SECONDS = 90;

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function Interview() {
  const { id } = useParams<{ id: string }>();

  // Stages: 'intro' | 'loading_turn' | 'question_active' | 'transcribing' | 'review_answer' | 'submitting_answer' | 'done'
  const [stage, setStage] = useState<'intro' | 'loading_turn' | 'question_active' | 'transcribing' | 'review_answer' | 'submitting_answer' | 'done'>('intro');

  const [question, setQuestion] = useState('');
  const [qIndex, setQIndex] = useState(1);
  const [qTotal, setQTotal] = useState(5);

  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [currentTranscript, setCurrentTranscript] = useState<string | null>(null);

  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [ttsNotice, setTtsNotice] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
  const [interviewLanguage, setInterviewLanguage] = useState<'hi-en' | 'en-IN' | 'hi-IN' | 'te-IN'>('hi-en');

  const controllerRef = useRef<Awaited<ReturnType<typeof startRecording>> | null>(null);
  const timerRef = useRef<number | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

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

  // ── TTS Speaker (Strictly Sequential) ──────────────────────────────────────
  const speakQuestion = async (text: string) => {
    stopTts();
    setTtsNotice(null);
    setIsTtsLoading(true);

    try {
      const res = await fetch('/api/voice-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: interviewLanguage }),
      });

      if (!res.ok) {
        throw new Error('TTS fetch failed');
      }

      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
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

  // ── Start Interview Handler ────────────────────────────────────────────────
  const handleStartInterview = async () => {
    if (!id) return;
    setError(null);
    setRetryAction(null);

    // 1. Unlock audio inside click handler
    unlockAudio();

    setStage('loading_turn');

    try {
      const res = await fetch('/api/interview-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: id, action: 'start' }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error ?? `Failed to start interview (${res.status})`);
      }

      if (data?.done) {
        setStage('done');
        return;
      }

      // Read language from response (if provided)
      const allowed = ['en-IN', 'hi-en', 'hi-IN', 'te-IN'] as const;
      if (typeof data?.language === 'string' && (allowed as readonly string[]).includes(data.language)) {
        setInterviewLanguage(data.language as 'en-IN' | 'hi-en' | 'hi-IN' | 'te-IN');
      }

      setQuestion(data.question);
      setQIndex(data.index ?? 1);
      setQTotal(data.total ?? 5);
      setStage('question_active');

      // 2. Speak question via TTS
      void speakQuestion(data.question);
    } catch (err) {
      setStage('intro');
      setError(err instanceof Error ? err.message : 'Failed to connect to interview server.');
      setRetryAction(() => handleStartInterview);
    }
  };

  // ── Recording Handlers ─────────────────────────────────────────────────────
  const handleStartRecord = async () => {
    if (isTtsLoading || isTtsPlaying) return;
    stopTts();
    setError(null);
    setRetryAction(null);
    setCurrentTranscript(null);

    try {
      controllerRef.current = await startRecording();
      setIsRecording(true);
      startTimer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone permission denied. Please allow mic access and try again.';
      setError(msg);
      setRetryAction(() => handleStartRecord);
    }
  };

  const handleStopRecord = async () => {
    const ctl = controllerRef.current;
    if (!ctl) return;
    clearTimer();
    controllerRef.current = null;
    setIsRecording(false);
    setStage('transcribing');
    setError(null);
    setRetryAction(null);

    try {
      const rawBlob = await stopRecording(ctl);
      const wavBlob = await decodeToWav(rawBlob);

      const res = await fetch('/api/voice-stt', {
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav' },
        body: wavBlob,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error ?? 'Transcription failed.');
      }

      const transcript = typeof data?.transcript === 'string' ? data.transcript.trim() : '';

      if (!transcript) {
        setError('No speech detected. Please try again with a clearer answer.');
        setStage('question_active');
        setRetryAction(() => handleStartRecord);
        return;
      }

      setCurrentTranscript(transcript);
      setStage('review_answer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription error. Please record your answer again.');
      setStage('question_active');
      setRetryAction(() => handleStartRecord);
    }
  };

  // Auto-stop at 90s
  useEffect(() => {
    if (elapsed >= MAX_SECONDS && isRecording) {
      void handleStopRecord();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, isRecording]);

  const handleReRecord = () => {
    setCurrentTranscript(null);
    setStage('question_active');
    void handleStartRecord();
  };

  // ── Confirm & Send Answer ──────────────────────────────────────────────────
  const handleConfirmAnswer = async () => {
    if (!id || !currentTranscript) return;
    stopTts();
    setError(null);
    setRetryAction(null);
    setStage('submitting_answer');

    try {
      const res = await fetch('/api/interview-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: id,
          action: 'answer',
          transcript: currentTranscript,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to submit answer.');
      }

      if (data?.done) {
        // Completed all 5 turns
        setStage('done');
        return;
      }

      // Next turn
      setQuestion(data.question);
      setQIndex(data.index ?? qIndex + 1);
      setQTotal(data.total ?? 5);
      setCurrentTranscript(null);
      setStage('question_active');

      // Speak next question
      void speakQuestion(data.question);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save response. Please try confirming again.');
      setStage('review_answer');
      setRetryAction(() => handleConfirmAnswer);
    }
  };

  const isTtsBusy = isTtsLoading || isTtsPlaying;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--surface, #09091a)' }}>
      {/* Header */}
      <header
        style={{
          padding: '16px 28px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(9,9,26,0.98)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #5b5ef4 0%, #9f77f7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={16} color="#fff" />
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>HireFlow AI Interview</span>
        </div>
        {stage !== 'intro' && stage !== 'done' && (
          <span
            style={{
              fontSize: 12,
              fontFamily: "'Geist Mono', monospace",
              fontWeight: 600,
              color: 'var(--primary-brand, #7d82f7)',
              background: 'rgba(125,130,247,0.1)',
              padding: '4px 12px',
              borderRadius: 6,
            }}
          >
            Question {qIndex} of {qTotal}
          </span>
        )}
      </header>

      {/* Main Content Area */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 24px', width: '100%', boxSizing: 'border-box' }}>
        {/* ── Intro Stage ─────────────────────────────────────────────────────── */}
        {stage === 'intro' && (
          <div className="glass-card-solid" style={{ padding: '36px 32px', borderRadius: 16, textAlign: 'center' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'rgba(91,94,244,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <Mic size={28} color="var(--primary-brand, #7d82f7)" />
            </div>

            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 10px' }}>
              Ready for Your Voice Interview
            </h1>
            <p style={{ fontSize: 14, color: 'var(--on-surface-muted, #cbd5e1)', lineHeight: 1.6, margin: '0 0 24px' }}>
              You will be asked 5 tailored questions. Each question is spoken aloud and shown on screen. You'll have up to 90 seconds to answer each question in simple English or natural Hinglish.
            </p>

            {error && (
              <div
                style={{
                  marginBottom: 20,
                  padding: '12px 14px',
                  borderRadius: 9,
                  background: 'rgba(255,122,147,0.08)',
                  border: '1px solid rgba(255,122,147,0.25)',
                  color: 'var(--error, #ff7a93)',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  textAlign: 'left',
                }}
              >
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleStartInterview}
              className="btn-primary"
              style={{
                fontSize: 14,
                padding: '12px 32px',
                borderRadius: 10,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              <Sparkles size={16} /> Start interview
            </button>
          </div>
        )}

        {/* ── Loading Turn ────────────────────────────────────────────────────── */}
        {stage === 'loading_turn' && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <LoaderCircle size={36} color="var(--primary-brand, #7d82f7)" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>Preparing your interview</h2>
            <p style={{ fontSize: 13, color: 'var(--outline, #94a3b8)', margin: 0 }}>Analyzing job context and generating first question…</p>
          </div>
        )}

        {/* ── Active Question / Recording / Review ───────────────────────────── */}
        {(stage === 'question_active' || stage === 'transcribing' || stage === 'review_answer' || stage === 'submitting_answer') && (
          <div className="glass-card-solid" style={{ padding: '28px 28px', borderRadius: 16 }}>
            {/* Question Progress Dots */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--outline, #94a3b8)' }}>
                Question {qIndex} of {qTotal}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {Array.from({ length: qTotal }).map((_, i) => (
                  <span
                    key={i}
                    style={{
                      width: 22,
                      height: 4,
                      borderRadius: 2,
                      display: 'inline-block',
                      background: i < qIndex - 1 ? 'var(--tertiary, #3de8a8)' : i === qIndex - 1 ? 'var(--primary-brand, #7d82f7)' : 'rgba(255,255,255,0.1)',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Question Heading */}
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--on-surface, #fff)', lineHeight: 1.45, margin: '6px 0 16px' }}>
              {question}
            </h2>

            {/* TTS notice if audio fails */}
            {ttsNotice && (
              <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--outline, #94a3b8)', fontStyle: 'italic' }}>
                {ttsNotice}
              </p>
            )}

            {/* Interactive Recording Area */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '20px 0 10px' }}>
              {isRecording ? (
                <button
                  type="button"
                  onClick={() => void handleStopRecord()}
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
                    cursor: 'pointer',
                  }}
                >
                  <Square size={28} color="#fff" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleStartRecord()}
                  disabled={isTtsBusy || stage === 'transcribing' || stage === 'submitting_answer'}
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
                    opacity: isTtsBusy || stage === 'transcribing' || stage === 'submitting_answer' ? 0.6 : 1,
                    cursor: isTtsBusy || stage === 'transcribing' || stage === 'submitting_answer' ? 'not-allowed' : 'pointer',
                  }}
                >
                  {stage === 'transcribing' || stage === 'submitting_answer' ? (
                    <LoaderCircle size={30} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <Mic size={30} color="#fff" />
                  )}
                </button>
              )}

              {/* Timer */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 18, fontWeight: 700, color: isRecording ? 'var(--error, #ff7a93)' : 'var(--on-surface, #fff)' }}>
                  {formatTime(elapsed)}
                </span>
                <span style={{ color: 'var(--outline, #94a3b8)', fontSize: 12 }}>/ {formatTime(MAX_SECONDS)}</span>
                {isRecording && <span className="dot-pulse" />}
              </div>

              {/* Status Message */}
              <p style={{ fontSize: 12, color: 'var(--outline, #94a3b8)', margin: 0 }}>
                {isTtsLoading
                  ? 'Loading question audio…'
                  : isTtsPlaying
                  ? 'Speaking question audio…'
                  : isRecording
                  ? 'Recording… tap stop when finished'
                  : stage === 'transcribing'
                  ? 'Transcribing your answer…'
                  : stage === 'submitting_answer'
                  ? 'Analyzing response and preparing next turn…'
                  : 'Tap microphone to speak your answer'}
              </p>

              {/* Replay Question Button */}
              <button
                type="button"
                onClick={() => void speakQuestion(question)}
                disabled={isRecording || isTtsBusy || stage === 'transcribing' || stage === 'submitting_answer'}
                className="btn-ghost"
                style={{
                  fontSize: 12,
                  color: isRecording || isTtsBusy ? 'var(--outline, #94a3b8)' : 'var(--primary-brand, #7d82f7)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: isRecording || isTtsBusy ? 'not-allowed' : 'pointer',
                  marginTop: 2,
                }}
              >
                <Volume2 size={14} /> Replay question
              </button>
            </div>

            {/* Error Banner with Optional Retry Button */}
            {error && (
              <div
                style={{
                  marginTop: 18,
                  padding: '12px 14px',
                  borderRadius: 9,
                  background: 'rgba(255,122,147,0.08)',
                  border: '1px solid rgba(255,122,147,0.25)',
                  color: 'var(--error, #ff7a93)',
                  fontSize: 13,
                  lineHeight: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <span>{error}</span>
                {retryAction && (
                  <button
                    onClick={() => retryAction()}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      textDecoration: 'underline',
                    }}
                  >
                    <RefreshCw size={13} /> Retry
                  </button>
                )}
              </div>
            )}

            {/* Answer Confirmation / Re-record */}
            {currentTranscript && !isRecording && (
              <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface, #fff)', margin: '0 0 6px' }}>
                  Your answer
                </p>
                <p style={{ fontSize: 13, color: 'var(--on-surface-muted, #cbd5e1)', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: '0 0 14px' }}>
                  {currentTranscript}
                </p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => void handleConfirmAnswer()}
                    disabled={stage === 'submitting_answer'}
                    className="btn-primary"
                    style={{ fontSize: 13, padding: '9px 20px', cursor: 'pointer' }}
                  >
                    {stage === 'submitting_answer' ? 'Submitting…' : qIndex < qTotal ? 'Confirm & Next →' : 'Confirm & Finish'}
                  </button>
                  <button
                    onClick={handleReRecord}
                    disabled={stage === 'submitting_answer'}
                    className="btn-ghost"
                    style={{
                      fontSize: 11,
                      color: 'var(--outline, #94a3b8)',
                      fontFamily: "'Geist Mono', monospace",
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                    }}
                  >
                    Re-record
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Done Stage (NO scores displayed) ───────────────────────────────── */}
        {stage === 'done' && (
          <div className="glass-card-solid" style={{ padding: '48px 32px', borderRadius: 16, textAlign: 'center' }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'rgba(61,232,168,0.15)',
                border: '1px solid rgba(61,232,168,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <CheckCircle2 size={32} color="var(--tertiary, #3de8a8)" />
            </div>

            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 10px' }}>
              Thanks, your interview is complete
            </h1>
            <p style={{ fontSize: 14, color: 'var(--on-surface-muted, #cbd5e1)', lineHeight: 1.6, maxWidth: 460, margin: '0 auto 28px' }}>
              Your responses have been successfully recorded and submitted. Our hiring team and recruiters will review your interview shortly.
            </p>

            <Link
              to="/careers"
              className="btn-primary"
              style={{
                fontSize: 13,
                padding: '11px 24px',
                borderRadius: 9,
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Back to Careers
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

