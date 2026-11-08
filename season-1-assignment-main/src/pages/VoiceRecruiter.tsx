import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  RefreshCw, LoaderCircle, ChevronRight, Copy, Check,
  Users, Briefcase, ToggleLeft, ToggleRight, Plus, ExternalLink,
} from 'lucide-react';

// ── Passcode key (sessionStorage) ────────────────────────────────────────────
const PC_KEY = 'recruiterPasscode';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  const t = iso ? new Date(iso) : null;
  if (!t || Number.isNaN(t.getTime())) return '—';
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function ScoreBar({ value, max = 100, color }: { value: number | null; max?: number; color?: string }) {
  const pct = value != null ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const c = color ?? (pct >= 70 ? '#3de8a8' : pct >= 50 ? '#facc2d' : '#ff7a93');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: c, borderRadius: 4, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, color: 'var(--outline)', minWidth: 26, textAlign: 'right' }}>
        {value != null ? value : '—'}
      </span>
    </div>
  );
}

function RecBadge({ rec }: { rec: string }) {
  const style: React.CSSProperties =
    rec === 'Advance' ? { background: 'rgba(61,232,168,0.12)', border: '1px solid rgba(61,232,168,0.3)', color: '#3de8a8' } :
    rec === 'Hold'   ? { background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.3)', color: '#facc2d' } :
    rec              ? { background: 'rgba(255,122,147,0.12)', border: '1px solid rgba(255,122,147,0.3)', color: '#ff7a93' } :
                       { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--outline)' };
  return (
    <span style={{ ...style, padding: '3px 10px', borderRadius: 9, fontSize: 11, fontFamily: "'Geist Mono', monospace", letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
      {rec || '—'}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label =
    status === 'completed'   ? 'Completed' :
    status === 'in_progress' ? 'In Interview' :
    status === 'applied'     ? 'Applied' :
    status || '—';
  const style: React.CSSProperties =
    status === 'completed'   ? { background: 'rgba(91,94,244,0.12)', border: '1px solid rgba(91,94,244,0.3)', color: '#a5a8ff' } :
    status === 'in_progress' ? { background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.25)', color: '#facc2d' } :
    status === 'applied'     ? { background: 'rgba(61,232,168,0.07)', border: '1px solid rgba(61,232,168,0.2)', color: '#3de8a8' } :
                               { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--outline)' };
  return (
    <span style={{ ...style, padding: '3px 10px', borderRadius: 9, fontSize: 11, fontFamily: "'Geist Mono', monospace", letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
      {label}
    </span>
  );
}

// ── Passcode Gate ─────────────────────────────────────────────────────────────
function PasscodeGate({ onUnlock }: { onUnlock: (pc: string) => void }) {
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!val.trim()) return;
    setErr('');
    // Quick check: try hitting the API
    try {
      const resp = await fetch('/api/applicants', {
        headers: { 'x-recruiter-passcode': val.trim() },
      });
      if (resp.status === 401) {
        setErr('Wrong passcode. Please try again.');
        return;
      }
      sessionStorage.setItem(PC_KEY, val.trim());
      onUnlock(val.trim());
    } catch {
      setErr('Network error. Please try again.');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24 }}>
      <div className="glass-card-solid" style={{ width: '100%', maxWidth: 400, padding: '32px 28px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Recruiter Portal</h1>
        <p style={{ fontSize: 13, color: 'var(--outline)', marginBottom: 24 }}>
          Enter your recruiter passcode to continue.
        </p>
        <form onSubmit={submit}>
          <input
            ref={inputRef}
            type="password"
            autoFocus
            value={val}
            onChange={e => setVal(e.target.value)}
            placeholder="Recruiter passcode"
            style={{
              width: '100%', padding: '11px 13px', borderRadius: 9, boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--on-surface)', fontSize: 14, outline: 'none', marginBottom: 14,
            }}
          />
          {err && (
            <div style={{ padding: '9px 13px', borderRadius: 8, background: 'rgba(255,122,147,0.08)', border: '1px solid rgba(255,122,147,0.25)', color: 'var(--error)', fontSize: 13, marginBottom: 14 }}>
              {err}
            </div>
          )}
          <button type="submit" className="btn-primary" style={{ width: '100%' }}>
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Applicants Tab ────────────────────────────────────────────────────────────
function ApplicantsTab({ passcode }: { passcode: string }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobFilter, setJobFilter] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'interview'>('date');
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/applicants', {
        headers: { 'x-recruiter-passcode': passcode },
      });
      if (resp.status === 401) { setError('Unauthorized.'); return; }
      const d = await resp.json().catch(() => null);
      if (!resp.ok) { setError(d?.error ?? `Error ${resp.status}`); return; }
      setItems(Array.isArray(d) ? d : []);
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Collect unique job titles for filter dropdown
  const jobTitles: string[] = [...new Set((items ?? []).map((r: any) => r.job_title).filter(Boolean))];

  let rows = (items ?? []).filter((r: any) => !jobFilter || r.job_title === jobFilter);
  if (sortBy === 'interview') {
    rows = [...rows].sort((a, b) => (b.interview_score ?? -1) - (a.interview_score ?? -1));
  } else {
    rows = [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const mono: React.CSSProperties = { fontFamily: "'Geist Mono', monospace", fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'var(--outline)' };

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={jobFilter}
          onChange={e => setJobFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--on-surface)', fontSize: 13, cursor: 'pointer' }}
        >
          <option value="">All jobs</option>
          {jobTitles.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as 'date' | 'interview')}
          style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--on-surface)', fontSize: 13, cursor: 'pointer' }}
        >
          <option value="date">Sort by Date</option>
          <option value="interview">Sort by Interview Score</option>
        </select>
        <button
          onClick={() => void load()}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--on-surface)', fontSize: 13, cursor: 'pointer' }}
        >
          <RefreshCw size={14} style={{ ...(loading ? { animation: 'spin 1s linear infinite' } : {}) }} />
          Refresh
        </button>
        {error && <span style={{ color: 'var(--error)', fontSize: 13 }}>{error}</span>}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <th style={{ ...mono, textAlign: 'left', padding: '8px 12px' }}>Candidate</th>
              <th style={{ ...mono, textAlign: 'left', padding: '8px 12px' }}>Job</th>
              <th style={{ ...mono, padding: '8px 12px', minWidth: 100 }}>ATS Score</th>
              <th style={{ ...mono, padding: '8px 12px', minWidth: 110 }}>Interview</th>
              <th style={{ ...mono, padding: '8px 12px' }}>Rec.</th>
              <th style={{ ...mono, padding: '8px 12px' }}>Status</th>
              <th style={{ ...mono, padding: '8px 12px' }}>Date</th>
              <th style={{ ...mono, padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '32px 12px' }}>
                <LoaderCircle size={22} color="var(--primary-brand)" style={{ animation: 'spin 1s linear infinite' }} />
              </td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '32px 12px', color: 'var(--outline)' }}>
                No applicants yet.
              </td></tr>
            )}
            {!loading && rows.map((row: any) => (
              <tr
                key={row.id}
                onClick={() => navigate(`/recruiter/applicant/${row.id}`)}
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--on-surface)' }}>{row.candidate_name || '—'}</div>
                  {row.email && <div style={{ fontSize: 11, color: 'var(--outline)', fontFamily: "'Geist Mono', monospace", marginTop: 2 }}>{row.email}</div>}
                </td>
                <td style={{ padding: '10px 12px', color: 'var(--outline)' }}>{row.job_title || '—'}</td>
                <td style={{ padding: '10px 12px', minWidth: 100 }}><ScoreBar value={row.ats_score} /></td>
                <td style={{ padding: '10px 12px', minWidth: 110 }}><ScoreBar value={row.interview_score} /></td>
                <td style={{ padding: '10px 12px' }}><RecBadge rec={row.recommendation} /></td>
                <td style={{ padding: '10px 12px' }}><StatusBadge status={row.status} /></td>
                <td style={{ padding: '10px 12px', color: 'var(--outline)', fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>{formatDate(row.created_at)}</td>
                <td style={{ padding: '10px 12px' }}>
                  <Link
                    to={`/recruiter/applicant/${row.id}`}
                    onClick={e => e.stopPropagation()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--primary-brand)', fontSize: 12, textDecoration: 'none' }}
                  >
                    View <ChevronRight size={13} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Jobs Tab ──────────────────────────────────────────────────────────────────
function JobsTab({ passcode }: { passcode: string }) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', location: '', jd_text: '', skills: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function loadJobs() {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/jobs');
      const d = await resp.json().catch(() => null);
      if (!resp.ok) { setError(d?.error ?? `Error ${resp.status}`); return; }
      setJobs(Array.isArray(d) ? d : []);
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadJobs(); }, []);

  async function createJob(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    if (!form.title.trim()) { setFormErr('Title is required.'); return; }
    if (form.jd_text.trim().length < 50) { setFormErr('JD text must be at least 50 characters.'); return; }
    setSubmitting(true);
    try {
      const skills = form.skills.split(',').map(s => s.trim()).filter(Boolean);
      const resp = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-recruiter-passcode': passcode },
        body: JSON.stringify({ title: form.title.trim(), location: form.location.trim(), jd_text: form.jd_text.trim(), skills }),
      });
      const d = await resp.json().catch(() => null);
      if (!resp.ok) { setFormErr(d?.error ?? `Error ${resp.status}`); return; }
      setForm({ title: '', location: '', jd_text: '', skills: '' });
      await loadJobs();
    } catch {
      setFormErr('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleJob(id: string, current: boolean) {
    setTogglingId(id);
    try {
      await fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-recruiter-passcode': passcode },
        body: JSON.stringify({ id, active: !current }),
      });
      await loadJobs();
    } catch { /* ignore */ } finally {
      setTogglingId(null);
    }
  }

  async function copyLink(id: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/apply/${id}`);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* ignore */ }
  }

  const inputSt: React.CSSProperties = {
    width: '100%', padding: '10px 13px', borderRadius: 9, boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
    color: 'var(--on-surface)', fontSize: 13, outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Create form */}
      <div className="glass-card-solid" style={{ padding: '24px 22px' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> Post a new job
        </h3>
        <form onSubmit={createJob} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input style={inputSt} placeholder="Job title *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <input style={inputSt} placeholder="Location" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
          </div>
          <textarea
            style={{ ...inputSt, minHeight: 110, resize: 'vertical' }}
            placeholder="Job description (min 50 chars) *"
            value={form.jd_text}
            onChange={e => setForm(f => ({ ...f, jd_text: e.target.value }))}
          />
          <input style={inputSt} placeholder="Skills (comma-separated)" value={form.skills} onChange={e => setForm(f => ({ ...f, skills: e.target.value }))} />
          {formErr && (
            <div style={{ padding: '9px 13px', borderRadius: 8, background: 'rgba(255,122,147,0.08)', border: '1px solid rgba(255,122,147,0.25)', color: 'var(--error)', fontSize: 13 }}>
              {formErr}
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={submitting} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8 }}>
            {submitting ? <LoaderCircle size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
            Post Job
          </button>
        </form>
      </div>

      {/* Job list */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--outline)', fontFamily: "'Geist Mono', monospace", letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 14 }}>
          Active Jobs
        </h3>
        {error && <div style={{ color: 'var(--error)', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        {loading && <LoaderCircle size={20} color="var(--primary-brand)" style={{ animation: 'spin 1s linear infinite' }} />}
        {!loading && jobs.length === 0 && <p style={{ color: 'var(--outline)', fontSize: 13 }}>No jobs posted yet.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {jobs.map((job: any) => (
            <div key={job.id} className="glass-card-solid" style={{ padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>{job.title}</div>
                {job.location && <div style={{ fontSize: 12, color: 'var(--outline)', marginTop: 3 }}>{job.location}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={() => toggleJob(job.id, job.active !== false)}
                  disabled={togglingId === job.id}
                  title={job.active !== false ? 'Deactivate' : 'Activate'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: job.active !== false ? '#3de8a8' : 'var(--outline)', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                >
                  {job.active !== false ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                  {job.active !== false ? 'Active' : 'Inactive'}
                </button>
                <button
                  onClick={() => copyLink(job.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-brand)', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                >
                  {copiedId === job.id ? <Check size={14} /> : <Copy size={14} />}
                  Copy apply link
                </button>
                <a
                  href={`/apply/${job.id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--outline)', display: 'flex', alignItems: 'center' }}
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function VoiceRecruiter() {
  const [passcode, setPasscode] = useState<string>(() => sessionStorage.getItem(PC_KEY) ?? '');
  const [tab, setTab] = useState<'applicants' | 'jobs'>('applicants');

  function handleUnlock(pc: string) {
    setPasscode(pc);
  }

  if (!passcode) {
    return <PasscodeGate onUnlock={handleUnlock} />;
  }

  const tabBtn = (t: 'applicants' | 'jobs'): React.CSSProperties => ({
    padding: '9px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    background: tab === t ? 'rgba(91,94,244,0.18)' : 'transparent',
    color: tab === t ? '#c4c5ff' : 'var(--outline)',
    borderBottom: tab === t ? '2px solid #5b5ef4' : '2px solid transparent',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ minHeight: '100vh', maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <header style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>Recruiter Portal</h1>
            <p style={{ fontSize: 13, color: 'var(--outline)', marginTop: 4 }}>
              AI-assisted applicant screening &amp; job management.
            </p>
          </div>
          <button
            onClick={() => { sessionStorage.removeItem(PC_KEY); setPasscode(''); }}
            className="btn-ghost"
            style={{ fontSize: 12 }}
          >
            Sign out
          </button>
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 22, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button style={tabBtn('applicants')} onClick={() => setTab('applicants')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Users size={14} /> Applicants</span>
          </button>
          <button style={tabBtn('jobs')} onClick={() => setTab('jobs')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Briefcase size={14} /> Jobs</span>
          </button>
        </div>
      </header>

      {/* Tab content */}
      {tab === 'applicants' ? (
        <ApplicantsTab passcode={passcode} />
      ) : (
        <JobsTab passcode={passcode} />
      )}
    </div>
  );
}
