import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, LoaderCircle } from 'lucide-react';

const PC_KEY = 'recruiterPasscode';

function formatDate(iso: string): string {
  const t = iso ? new Date(iso) : null;
  if (!t || Number.isNaN(t.getTime())) return '—';
  return t.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function ScoreBar({ value, max = 100, label }: { value: number | null; max?: number; label?: string }) {
  const pct = value != null ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color = pct >= 70 ? '#3de8a8' : pct >= 50 ? '#facc2d' : '#ff7a93';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--outline)', fontFamily: "'Geist Mono', monospace", textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{label}</span>
          <span style={{ fontSize: 11, color, fontFamily: "'Geist Mono', monospace", fontWeight: 700 }}>{value ?? '—'}</span>
        </div>
      )}
      <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

function BigScore({ value, label }: { value: number | null; label: string }) {
  const color = (value ?? 0) >= 70 ? '#3de8a8' : (value ?? 0) >= 50 ? '#facc2d' : '#ff7a93';
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 48, fontWeight: 800, color, fontFamily: "'Geist Mono', monospace", lineHeight: 1 }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--outline)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginTop: 6, fontFamily: "'Geist Mono', monospace" }}>
        {label}
      </div>
    </div>
  );
}

function RecBadge({ rec }: { rec: string }) {
  const style: React.CSSProperties =
    rec === 'Advance' ? { background: 'rgba(61,232,168,0.14)', border: '1px solid rgba(61,232,168,0.35)', color: '#3de8a8' } :
    rec === 'Hold'   ? { background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.3)', color: '#facc2d' } :
    rec              ? { background: 'rgba(255,122,147,0.12)', border: '1px solid rgba(255,122,147,0.3)', color: '#ff7a93' } :
                       { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--outline)' };
  return (
    <span style={{ ...style, padding: '5px 14px', borderRadius: 10, fontSize: 13, fontFamily: "'Geist Mono', monospace", letterSpacing: '0.07em', textTransform: 'uppercase' as const, fontWeight: 700 }}>
      {rec || '—'}
    </span>
  );
}

function LangBadge({ lang }: { lang: string }) {
  const label = lang === 'hi-en' ? 'Hinglish' : lang === 'en-IN' ? 'English' : lang === 'hi-IN' ? 'Hindi' : lang === 'te-IN' ? 'Telugu' : lang;
  return (
    <span style={{ background: 'rgba(91,94,244,0.08)', border: '1px solid rgba(91,94,244,0.2)', color: '#a5a8ff', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontFamily: "'Geist Mono', monospace", letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
      {label || '—'}
    </span>
  );
}

function Chip({ text, variant }: { text: string; variant: 'match' | 'miss' }) {
  const style: React.CSSProperties = variant === 'match'
    ? { background: 'rgba(61,232,168,0.1)', border: '1px solid rgba(61,232,168,0.25)', color: '#3de8a8' }
    : { background: 'rgba(255,122,147,0.1)', border: '1px solid rgba(255,122,147,0.25)', color: '#ff7a93' };
  return (
    <span style={{ ...style, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500 }}>
      {text}
    </span>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card-solid" style={{ padding: '22px 24px', marginBottom: 18 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Geist Mono', monospace", letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--outline)', marginBottom: 18 }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

export default function ApplicantDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const passcode = sessionStorage.getItem(PC_KEY) ?? '';
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    async function load() {
      setLoading(true);
      setError(null);
      setNotFound(false);
      try {
        const resp = await fetch(`/api/applicants?id=${encodeURIComponent(id!)}`, {
          headers: { 'x-recruiter-passcode': passcode },
        });
        if (resp.status === 401) { navigate('/recruiter'); return; }
        if (resp.status === 404) { setNotFound(true); return; }
        const d = await resp.json().catch(() => null);
        if (!resp.ok) { setError(d?.error ?? `Error ${resp.status}`); return; }
        setData(d);
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id, passcode, navigate]);

  const backBtn = (
    <button
      onClick={() => navigate('/recruiter')}
      style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--outline)', fontSize: 13, padding: 0, marginBottom: 24 }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--on-surface)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--outline)'}
    >
      <ArrowLeft size={15} /> Back to Applicants
    </button>
  );

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoaderCircle size={30} color="var(--primary-brand)" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>
        {backBtn}
        <p style={{ color: 'var(--outline)' }}>Applicant not found.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>
        {backBtn}
        <p style={{ color: 'var(--error)' }}>{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const candidate_name: string = data.candidate_name ?? '—';
  const email: string = data.email ?? '';
  const job_title: string = data.job_title ?? '';
  const job_location: string = data.job_location ?? '';
  const resume_skills: string[] = Array.isArray(data.resume_skills) ? data.resume_skills : [];
  const ats: { score?: number; matched_skills?: string[]; missing_skills?: string[]; summary?: string } | null = data.ats ?? null;
  const turns: any[] | null = Array.isArray(data.turns) ? data.turns : [];
  const overall: { interview_score?: number; recommendation?: string; summary?: string; strengths?: string[]; red_flags?: string[] } | null = data.overall ?? null;
  const status: string = data.status ?? '';
  const provider: string = data.provider ?? '';
  const created_at: string = data.created_at ?? '';
  const language: string = data.language ?? '';

  const providerLabel = provider === 'evon' ? 'Evon' : provider === 'groq' ? 'Llama via Groq' : provider || 'AI';

  return (
    <div style={{ minHeight: '100vh', maxWidth: 820, margin: '0 auto', padding: '32px 24px 60px' }}>
      {backBtn}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="glass-card-solid" style={{ padding: '24px 26px', marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>{candidate_name || '—'}</h1>
            {email && <p style={{ fontSize: 13, color: 'var(--outline)', fontFamily: "'Geist Mono', monospace", marginTop: 4, margin: 0 }}>{email}</p>}
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              {job_title && (
                <span style={{ fontSize: 13, color: 'var(--on-surface)', background: 'rgba(91,94,244,0.12)', border: '1px solid rgba(91,94,244,0.25)', padding: '4px 12px', borderRadius: 8 }}>
                  {job_title}{job_location ? ` · ${job_location}` : ''}
                </span>
              )}
              <span style={{ fontSize: 11, color: 'var(--outline)', fontFamily: "'Geist Mono', monospace" }}>
                Applied {formatDate(created_at)}
              </span>
              <span style={{
                fontSize: 11, fontFamily: "'Geist Mono', monospace", letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                padding: '3px 10px', borderRadius: 8, fontWeight: 600,
                ...(status === 'completed'   ? { background: 'rgba(91,94,244,0.12)', color: '#a5a8ff' } :
                    status === 'in_progress' ? { background: 'rgba(250,204,21,0.08)', color: '#facc2d' } :
                                               { background: 'rgba(61,232,168,0.07)', color: '#3de8a8' }),
              }}>
                {status === 'completed' ? 'Completed' : status === 'in_progress' ? 'In Interview' : 'Applied'}
              </span>
            </div>
          </div>
          {overall?.recommendation && <RecBadge rec={overall.recommendation} />}
          {language && <LangBadge lang={language} />}
        </div>
      </div>

      {/* ── ATS Section ────────────────────────────────────────────────────── */}
      {ats && (
        <SectionCard title="ATS Screening">
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'start' }}>
            <BigScore value={ats.score ?? null} label="ATS Score" />
            <div>
              {ats.summary && (
                <p style={{ fontSize: 13, color: 'var(--on-surface)', lineHeight: 1.65, marginBottom: 16 }}>{ats.summary}</p>
              )}
              {Array.isArray(ats.matched_skills) && ats.matched_skills.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--outline)', marginBottom: 8 }}>Matched Skills</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {ats.matched_skills.map((s: string) => <Chip key={s} text={s} variant="match" />)}
                  </div>
                </div>
              )}
              {Array.isArray(ats.missing_skills) && ats.missing_skills.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--outline)', marginBottom: 8 }}>Missing Skills</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {ats.missing_skills.map((s: string) => <Chip key={s} text={s} variant="miss" />)}
                  </div>
                </div>
              )}
            </div>
          </div>
          {Array.isArray(resume_skills) && resume_skills.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--outline)', marginBottom: 8 }}>Resume Skills</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {resume_skills.map((s: string) => (
                  <span key={s} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--on-surface)', padding: '3px 10px', borderRadius: 20, fontSize: 12 }}>{s}</span>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Interview Overall ───────────────────────────────────────────────── */}
      {overall && (
        <SectionCard title="Interview Assessment">
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'start' }}>
            <BigScore value={overall.interview_score ?? null} label="Interview Score" />
            <div>
              {overall.recommendation && (
                <div style={{ marginBottom: 14 }}>
                  <RecBadge rec={overall.recommendation} />
                </div>
              )}
              {overall.summary && (
                <p style={{ fontSize: 13, color: 'var(--on-surface)', lineHeight: 1.65, marginBottom: 16 }}>{overall.summary}</p>
              )}
              {Array.isArray(overall.strengths) && overall.strengths.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#3de8a8', marginBottom: 8 }}>Strengths</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {overall.strengths.map((s: string, i: number) => (
                      <li key={i} style={{ fontSize: 13, color: 'var(--on-surface)', lineHeight: 1.65, marginBottom: 4 }}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(overall.red_flags) && overall.red_flags.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#ff7a93', marginBottom: 8 }}>Red Flags</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {overall.red_flags.map((s: string, i: number) => (
                      <li key={i} style={{ fontSize: 13, color: 'var(--on-surface)', lineHeight: 1.65, marginBottom: 4 }}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Per-question Cards ─────────────────────────────────────────────── */}
      {Array.isArray(turns) && turns.length > 0 && (
        <SectionCard title="Interview Turns">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {turns.map((turn: any, idx: number) => (
              <div key={idx} style={{ padding: '18px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--outline)', marginBottom: 8 }}>
                  Question {idx + 1}
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#fff', lineHeight: 1.55, marginBottom: 12 }}>
                  {turn.question || '—'}
                </p>
                {turn.transcript && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--outline)', marginBottom: 6 }}>Transcript</div>
                    <p style={{ fontSize: 13, color: 'var(--on-surface)', lineHeight: 1.65, background: 'rgba(255,255,255,0.03)', padding: '10px 13px', borderRadius: 8 }}>
                      {turn.transcript}
                    </p>
                  </div>
                )}
                {turn.criteria && (
                  <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <ScoreBar value={turn.criteria.relevance ?? null} max={10} label="Relevance" />
                    <ScoreBar value={turn.criteria.depth ?? null} max={10} label="Depth" />
                    <ScoreBar value={turn.criteria.clarity ?? null} max={10} label="Clarity" />
                  </div>
                )}
                {turn.feedback && (
                  <div>
                    <div style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--outline)', marginBottom: 6 }}>Feedback</div>
                    <p style={{ fontSize: 13, color: 'var(--on-surface)', lineHeight: 1.65, fontStyle: 'italic' }}>{turn.feedback}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: 'var(--outline)', fontFamily: "'Geist Mono', monospace", letterSpacing: '0.04em' }}>
          Scored by: <strong style={{ color: 'var(--on-surface)' }}>{providerLabel}</strong>. AI-assisted; the final decision is the recruiter's.
        </p>
      </div>
    </div>
  );
}

