import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, LoaderCircle, Sparkles, Download } from 'lucide-react';

const RUBRIC = ['Communication clarity', 'Problem solving', 'Relevant experience'];

const recommendationStyle: Record<string, React.CSSProperties> = {
  Advance: {
    background: 'rgba(61,232,168,0.12)',
    border: '1px solid rgba(61,232,168,0.3)',
    color: '#3de8a8',
    padding: '3px 10px',
    borderRadius: 9,
    fontSize: 11,
    fontFamily: "'Geist Mono', monospace",
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  Hold: {
    background: 'rgba(250,204,21,0.12)',
    border: '1px solid rgba(250,204,21,0.3)',
    color: '#facc2d',
    padding: '3px 10px',
    borderRadius: 9,
    fontSize: 11,
    fontFamily: "'Geist Mono', monospace",
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  Reject: {
    background: 'rgba(255,122,147,0.12)',
    border: '1px solid rgba(255,122,147,0.3)',
    color: '#ff7a93',
    padding: '3px 10px',
    borderRadius: 9,
    fontSize: 11,
    fontFamily: "'Geist Mono', monospace",
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--outline)' }}>
          {label}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "'Geist Mono', monospace" }}>{value}</span>
      </div>
      <div style={{ height: 6, borderRadius: 9, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{ height: '100%', borderRadius: 9, width: `${pct}%`, background: 'linear-gradient(90deg, #5b5ef4, #9f77f7)' }} />
      </div>
    </div>
  );
}

export default function VoiceResult() {
  const { id } = useParams();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/voice-result?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then((d) => { if (!cancelled) { setData(d as Record<string, unknown>); setLoading(false); } })
      .catch(() => { if (!cancelled) { setNotFound(true); setLoading(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const copyReport = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <LoaderCircle size={28} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }
  if (notFound || !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <p style={{ fontSize: 14, color: 'var(--outline)' }}>Screening not found.</p>
      </div>
    );
  }

  const answers = Array.isArray(data.answers) ? (data.answers as Record<string, unknown>[]) : [];
  const overall = (data.overall ?? {}) as { average?: number; recommendation?: 'Advance' | 'Hold' | 'Reject' };
  const rec = overall.recommendation ?? 'Reject';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
      <header style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Recruiter Scorecard</h1>
        <p style={{ fontSize: 12, color: 'var(--outline)', marginTop: 4 }}>Powered by Gnani Prisma + Evon-class scoring</p>
      </header>

      {/* Candidate profile */}
      <div className="glass-card-solid" style={{ padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <FileText size={20} color="#c4c5ff" />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--on-surface)' }}>{String(data.candidate_name ?? 'Candidate')}</div>
            {data.role != null && <div style={{ fontSize: 12, color: 'var(--outline)' }}>Role: {String(data.role)}</div>}
          </div>
        </div>
      </div>

      {/* Overall average + recommendation */}
      <div className="glass-card-solid" style={{ padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Sparkles size={16} color="var(--tertiary)" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)' }}>Overall</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
              <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 28, fontWeight: 700 }}>{String(overall.average ?? '-')}</span>
              <span style={{ ...recommendationStyle[rec], fontWeight: 600 }}>{rec}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Per-question cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {answers.map((a, i) => (
          <div key={i} className="glass-card-solid" style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--outline)', marginBottom: 8 }}>
              Question {i + 1} of {answers.length}
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--on-surface)', margin: '0 0 10px' }}>{String(a.question ?? `Q${i + 1}`)}</h3>
            <p style={{ fontSize: 13, color: 'var(--on-surface-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: '0 0 12px' }}>{String(a.transcript)}</p>

            {RUBRIC.map((label) => (
              <ScoreBar key={label} label={label} value={Number((a.scores as Record<string, number> | undefined)?.[label] ?? 0)} />
            ))}

            {Array.isArray(a.strengths) && a.strengths.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--tertiary)' }}>Strengths</div>
                {(a.strengths as unknown[]).map((s, idx) => (
                  <div key={idx} style={{ fontSize: 12, color: 'var(--on-surface)' }}>+ {String(s)}</div>
                ))}
              </div>
            )}

            {Array.isArray(a.red_flags) && a.red_flags.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--error)' }}>Red flags</div>
                {(a.red_flags as unknown[]).map((r, idx) => (
                  <div key={idx} style={{ fontSize: 12, color: 'var(--error)' }}>- {String(r)}</div>
                ))}
              </div>
            )}

            {a.summary != null && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--on-surface)' }}>Summary: {String(a.summary)}</div>
            )}
          </div>
        ))}
      </div>

      {/* Copy report */}
      <div className="glass-card-solid" style={{ padding: '18px 20px', marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Download size={15} color="var(--primary-brand)" />
          <button onClick={() => void copyReport()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-brand)', display: 'flex', alignItems: 'center' }}>
            {copied ? 'Copied!' : 'Copy report'}
          </button>
        </div>
      </div>
    </div>
  );
}
