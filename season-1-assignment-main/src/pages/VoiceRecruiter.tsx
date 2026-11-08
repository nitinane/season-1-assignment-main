import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RefreshCw, LoaderCircle, Copy, Check, Headset } from 'lucide-react';

const GUEST_NOTE = (
  <p style={{ fontSize: 12, color: 'var(--outline)', marginTop: 4 }}>
    Login to copy this link — otherwise passcode stays on this device only.
  </p>
);

function Badge({ rec }: { rec: string }) {
  const style: React.CSSProperties =
    rec === 'Advance' ? { background: 'rgba(61,232,168,0.12)', border: '1px solid rgba(61,232,168,0.3)', color: '#3de8a8' } :
    rec === 'Hold'   ? { background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.3)', color: '#facc2d' } :
                      { background: 'rgba(255,122,147,0.12)', border: '1px solid rgba(255,122,147,0.3)', color: '#ff7a93' };
  return (
    <span style={{ ...style, padding: '3px 10px', borderRadius: 9, fontSize: 11, fontFamily: "'Geist Mono', monospace", letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
      {rec}
    </span>
  );
}

export default function VoiceRecruiter() {
  const [params] = useSearchParams();
  const [passcode, setPasscode] = useState('');
  const [showGnote, setShowGnote] = useState(false);
  const [roleOverride, setRoleOverride] = useState((params.get('role') ?? '').trim() || '');
  const [items, setItems] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wrongPasscode, setWrongPasscode] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = () => void load();

  async function load() {
    setLoading(true);
    setError(null);
    setWrongPasscode(false);
    setShowGnote(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('role', roleOverride);
      const resp = await fetch(`/api/voice-list?${url.searchParams.toString()}`, {
        method: 'GET',
        headers: { 'x-recruiter-passcode': passcode },
      });
      if (resp.status === 401) {
        setWrongPasscode(true);
        setError('Wrong passcode');
        return;
      }
      const d = await resp.json().catch(() => null);
      if (!resp.ok) {
        setError(d?.error ?? `Server error (${resp.status})`);
        setItems([]);
        return;
      }
      setItems(Array.isArray(d?.items) ? d.items : []);
      setError(null);
    } catch {
      setError('Network error. Please try again.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + '/voice-screen?role=' + encodeURIComponent(roleOverride));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>
      <header style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Recruiter Voice List</h1>
        <p style={{ fontSize: 12, color: 'var(--outline)', marginTop: 4 }}>
          Powered by Gnani Prisma + Evon-class scoring. Passcode kept in sessionStorage only.
        </p>
      </header>

      {/* Passcode */}
      <div className="glass-card-solid" style={{ padding: '18px 20px', marginBottom: 16 }}>
        <label htmlFor="passcode-input" style={{ display: 'block', fontSize: 11, fontFamily: "'Geist Mono', monospace", fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--outline)', marginBottom: 7 }}>Recruiter passcode</label>
        <input
          id="passcode-input"
          type="password"
          autoFocus
          value={passcode}
          onChange={e => setPasscode(e.target.value)}
          placeholder="Enter passcode"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: 'var(--on-surface)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
        />
        {showGnote && <div style={{ fontSize: 11, color: 'var(--tertiary)', marginTop: 10 }}>Visible — passcode is stored in sessionStorage for the current tab only.</div>}
        <button onClick={() => setShowGnote(s => !s)} disabled={!passcode} style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--outline)', fontSize: 11, fontFamily: "'Geist Mono', monospace", letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {showGnote ? 'Hide' : 'Show'} passcode
        </button>
        <button onClick={refresh} disabled={loading || !!wrongPasscode} style={{ marginLeft: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-brand)', display: 'flex', alignItems: 'center', gap: 8, padding: 0 }}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* Wrong passcode notice */}
      {wrongPasscode && (
        <div style={{ padding: '10px 14px', borderRadius: 9, background: 'rgba(255,122,147,0.08)', border: '1px solid rgba(255,122,147,0.25)', color: 'var(--error)', fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>
          Wrong passcode. Please check what you entered and refresh.
        </div>
      )}

      {/* Error */}
      {error && !wrongPasscode && (
        <div style={{ padding: '10px 14px', borderRadius: 9, background: 'rgba(255,122,147,0.08)', border: '1px solid rgba(255,122,147,0.25)', color: 'var(--error)', fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <th style={{ textAlign: 'left', padding: '8px 10px', fontFamily: "'Geist Mono', monospace", fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--outline)', textTransform: 'uppercase' }}>Candidate</th>
            <th style={{ padding: '8px 10px', fontFamily: "'Geist Mono', monospace", fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--outline)' }}>Role</th>
            <th style={{ padding: '8px 10px', fontFamily: "'Geist Mono', monospace", fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--outline)' }}>Date</th>
            <th style={{ padding: '8px 10px', fontFamily: "'Geist Mono', monospace", fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--outline)' }}>Avg Score</th>
            <th style={{ padding: '8px 10px', fontFamily: "'Geist Mono', monospace", fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--outline)' }}>Recommendation</th>
            <th style={{ padding: '8px 10px', fontFamily: "'Geist Mono', monospace", fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--outline)' }}></th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '18px 10px' }}><LoaderCircle size={22} color="var(--primary-brand)" /></td></tr>
          )}
          {!loading && items?.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px 10px', color: 'var(--outline)' }}>No screenings yet.</td></tr>
          )}
          {!loading && Array.isArray(items) && items.length > 0 && (
            items.map((row) => (
              <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '10px 10px', color: 'var(--on-surface)' }}>{String(row.candidate_name ?? '')}</td>
                <td style={{ padding: '10px 10px', color: 'var(--outline)' }}>{String(row.role ?? '') || '—'}</td>
                <td style={{ padding: '10px 10px', color: 'var(--outline)', fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>{formatDate(row.created_at)}</td>
                <td style={{ padding: '10px 10px', color: 'var(--on-surface)', fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>{String(row.overall?.average ?? '-')}</td>
                <td style={{ padding: '10px 10px' }}><Badge rec={row.overall?.recommendation ?? 'Reject'} /></td>
                <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' }}>
                  <button onClick={() => window.open(`/voice-results/${row.id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-brand)', textDecoration: 'none', fontSize: 12 }}>
                    View scorecard →
                  </button>
                  <button onClick={copyLink} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-brand)', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    Copy candidate link
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Role override input */}
      <div style={{ marginTop: 14, maxWidth: 420 }}>
        <input
          value={roleOverride}
          onChange={e => setRoleOverride(e.target.value)}
          placeholder="Filter by role (appended as ?role=...)"
          style={{ width: '100%', padding: '9px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: 'var(--on-surface)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* Recruiter note */}
      <div style={{ marginTop: 18, fontSize: 11, color: 'var(--tertiary)', textAlign: 'center' }}>
        {GUEST_NOTE}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const t = iso ? new Date(iso) : null;
  if (!t || Number.isNaN(t.getTime())) return '—';
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
