import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Briefcase, ArrowRight, LoaderCircle, Sparkles } from 'lucide-react';

interface JobItem {
  id: string;
  title: string;
  location: string;
  jd_text: string;
}

export default function Careers() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function fetchJobs() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/jobs');
        if (!res.ok) {
          throw new Error('Failed to load jobs');
        }
        const data = await res.json();
        if (active) {
          if (Array.isArray(data)) {
            setJobs(data);
          } else if (Array.isArray(data?.jobs)) {
            setJobs(data.jobs);
          } else {
            setJobs([]);
          }
        }
      } catch {
        if (active) {
          setError('Unable to load openings right now. Please try again later.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void fetchJobs();
    return () => {
      active = false;
    };
  }, []);

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
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
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
          <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>HireFlow Careers</span>
        </Link>
        {!loading && (
          <span
            style={{
              fontSize: 11,
              fontFamily: "'Geist Mono', monospace",
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--primary-brand, #7d82f7)',
              background: 'rgba(125,130,247,0.1)',
              padding: '4px 10px',
              borderRadius: 6,
            }}
          >
            {jobs.length} Open Position{jobs.length === 1 ? '' : 's'}
          </span>
        )}
      </header>

      {/* Main Container */}
      <div style={{ maxWidth: 840, margin: '0 auto', padding: '48px 24px 24px', width: '100%', boxSizing: 'border-box' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', margin: 0 }}>
          Open Positions
        </h1>
        <p style={{ fontSize: 14, color: 'var(--outline, #94a3b8)', marginTop: 8, lineHeight: 1.6, maxWidth: 600 }}>
          Select a role, upload your resume for automatic ATS screening, and complete your interactive AI voice interview.
        </p>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
            <LoaderCircle size={32} color="var(--primary-brand, #7d82f7)" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ fontSize: 13, color: 'var(--outline, #94a3b8)', marginTop: 12 }}>Loading job openings…</p>
          </div>
        )}

        {error && !loading && (
          <div style={{ marginTop: 24, padding: '14px 18px', borderRadius: 10, background: 'rgba(255,122,147,0.08)', border: '1px solid rgba(255,122,147,0.25)', color: 'var(--error, #ff7a93)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {!loading && !error && jobs.length === 0 && (
          <div className="glass-card-solid" style={{ marginTop: 32, padding: '48px 24px', textAlign: 'center', borderRadius: 14 }}>
            <Briefcase size={36} color="var(--outline, #94a3b8)" style={{ margin: '0 auto 12px' }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>No active job openings</h2>
            <p style={{ fontSize: 13, color: 'var(--outline, #94a3b8)', margin: 0 }}>
              There are currently no active job postings. Please check back later or check in with your recruiter.
            </p>
          </div>
        )}

        {!loading && !error && jobs.length > 0 && (
          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {jobs.map((job) => (
              <div
                key={job.id}
                className="glass-card-solid"
                style={{
                  padding: '24px 26px',
                  borderRadius: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--on-surface, #fff)', margin: 0 }}>
                      {job.title}
                    </h2>
                    {job.location && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, color: 'var(--outline, #94a3b8)', fontSize: 12 }}>
                        <MapPin size={13} />
                        <span>{job.location}</span>
                      </div>
                    )}
                  </div>

                  <Link
                    to={`/apply/${job.id}`}
                    className="btn-primary"
                    style={{
                      fontSize: 13,
                      padding: '9px 18px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      textDecoration: 'none',
                      borderRadius: 9,
                    }}
                  >
                    Apply <ArrowRight size={14} />
                  </Link>
                </div>

                <p style={{ fontSize: 13, color: 'var(--on-surface-muted, #cbd5e1)', lineHeight: 1.6, margin: 0 }}>
                  {job.jd_text.length > 220 ? `${job.jd_text.slice(0, 220)}…` : job.jd_text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
