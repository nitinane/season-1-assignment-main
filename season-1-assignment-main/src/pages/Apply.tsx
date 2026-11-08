import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Briefcase, MapPin, Sparkles, UploadCloud, LoaderCircle } from 'lucide-react';
import { parsePDF } from '../lib/parser';

interface JobDetails {
  id: string;
  title: string;
  location: string;
  jd_text: string;
}

export default function Apply() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const [job, setJob] = useState<JobDetails | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [parsingPdf, setParsingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadJob() {
      if (!jobId) return;
      try {
        setLoadingJob(true);
        setLoadError(null);
        const res = await fetch(`/api/jobs?id=${encodeURIComponent(jobId)}`);
        if (!res.ok) {
          throw new Error('Job not found');
        }
        const data = await res.json();
        if (active) {
          setJob(data);
        }
      } catch {
        if (active) {
          setLoadError('The requested job position could not be found or has been closed.');
        }
      } finally {
        if (active) setLoadingJob(false);
      }
    }

    void loadJob();
    return () => {
      active = false;
    };
  }, [jobId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selected = e.target.files?.[0];
    if (!selected) {
      setFile(null);
      return;
    }

    if (selected.size > 5 * 1024 * 1024) {
      setError('Resume file exceeds maximum size of 5 MB. Please select a smaller file.');
      setFile(null);
      e.target.value = '';
      return;
    }

    if (!selected.name.toLowerCase().endsWith('.pdf') && selected.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      setFile(null);
      e.target.value = '';
      return;
    }

    setFile(selected);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!jobId || !job) {
      setError('Job details not loaded.');
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 1 || trimmedName.length > 80) {
      setError('Please enter your full name (1-80 characters).');
      return;
    }

    const trimmedEmail = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || trimmedEmail.length > 120 || !emailRegex.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!file) {
      setError('Please upload your resume in PDF format.');
      return;
    }

    if (!consent) {
      setError('You must agree to the AI processing consent to proceed.');
      return;
    }

    setSubmitting(true);
    setParsingPdf(true);

    let extractedText = '';
    try {
      extractedText = await parsePDF(file);
    } catch {
      setSubmitting(false);
      setParsingPdf(false);
      setError('Please upload a text-based PDF');
      return;
    }

    setParsingPdf(false);

    if (!extractedText || extractedText.trim().length < 200) {
      setSubmitting(false);
      setError('Please upload a text-based PDF');
      return;
    }

    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          candidate_name: trimmedName,
          email: trimmedEmail,
          resume_text: extractedText.trim(),
          consent: true,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error ?? `Application submission failed (${res.status})`);
      }

      if (!data?.id) {
        throw new Error('Server returned invalid application ID.');
      }

      navigate(`/interview/${encodeURIComponent(data.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit application. Please try again.');
      setSubmitting(false);
    }
  };

  if (loadingJob) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', background: 'var(--surface, #09091a)' }}>
        <LoaderCircle size={32} color="var(--primary-brand, #7d82f7)" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ fontSize: 13, color: 'var(--outline, #94a3b8)', marginTop: 12 }}>Loading job details…</p>
      </div>
    );
  }

  if (loadError || !job) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--surface, #09091a)' }}>
        <div style={{ maxWidth: 520, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>Position Unavailable</h1>
          <p style={{ fontSize: 13, color: 'var(--outline, #94a3b8)', marginTop: 8 }}>{loadError ?? 'Job not found.'}</p>
          <Link
            to="/careers"
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 18, textDecoration: 'none', fontSize: 13, padding: '10px 20px' }}
          >
            <ArrowLeft size={14} /> Back to Open Positions
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--surface, #09091a)' }}>
      {/* Header */}
      <header
        style={{
          padding: '16px 28px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(9,9,26,0.98)',
        }}
      >
        <Link
          to="/careers"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--outline, #94a3b8)',
            textDecoration: 'none',
            fontSize: 13,
          }}
        >
          <ArrowLeft size={15} /> All Careers
        </Link>
      </header>

      {/* Main Form Container */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px 60px', width: '100%', boxSizing: 'border-box' }}>
        {/* Job Details Card */}
        <div className="glass-card-solid" style={{ padding: '24px 28px', borderRadius: 14, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary-brand, #7d82f7)', fontSize: 11, fontFamily: "'Geist Mono', monospace", letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
            <Briefcase size={13} />
            <span>Application</span>
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>
            {job.title}
          </h1>

          {job.location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--outline, #94a3b8)', fontSize: 12, marginBottom: 16 }}>
              <MapPin size={13} />
              <span>{job.location}</span>
            </div>
          )}

          <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
            <h2 style={{ fontSize: 12, fontFamily: "'Geist Mono', monospace", textTransform: 'uppercase', color: 'var(--outline, #94a3b8)', letterSpacing: '0.06em', margin: '0 0 8px' }}>
              Job Description
            </h2>
            <div style={{ fontSize: 13, color: 'var(--on-surface-muted, #cbd5e1)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {job.jd_text}
            </div>
          </div>
        </div>

        {/* Form Card */}
        <form onSubmit={handleSubmit} className="glass-card-solid" style={{ padding: '26px 28px', borderRadius: 14 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 18px' }}>
            Your Application
          </h2>

          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="candidate-name"
              style={{
                display: 'block',
                fontSize: 11,
                fontFamily: "'Geist Mono', monospace",
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--outline, #94a3b8)',
                marginBottom: 7,
              }}
            >
              Full name *
            </label>
            <input
              id="candidate-name"
              type="text"
              required
              disabled={submitting}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 9,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.09)',
                color: 'var(--on-surface, #fff)',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label
              htmlFor="candidate-email"
              style={{
                display: 'block',
                fontSize: 11,
                fontFamily: "'Geist Mono', monospace",
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--outline, #94a3b8)',
                marginBottom: 7,
              }}
            >
              Email address *
            </label>
            <input
              id="candidate-email"
              type="email"
              required
              disabled={submitting}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. priya.sharma@example.com"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 9,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.09)',
                color: 'var(--on-surface, #fff)',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              htmlFor="resume-upload"
              style={{
                display: 'block',
                fontSize: 11,
                fontFamily: "'Geist Mono', monospace",
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--outline, #94a3b8)',
                marginBottom: 7,
              }}
            >
              Resume PDF (max 5 MB) *
            </label>
            <div
              style={{
                border: '1px dashed rgba(255,255,255,0.18)',
                borderRadius: 10,
                padding: '18px',
                textAlign: 'center',
                background: 'rgba(255,255,255,0.02)',
                position: 'relative',
              }}
            >
              <input
                id="resume-upload"
                type="file"
                accept=".pdf,application/pdf"
                required
                disabled={submitting}
                onChange={handleFileChange}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, pointerEvents: 'none' }}>
                <UploadCloud size={24} color={file ? 'var(--tertiary, #3de8a8)' : 'var(--primary-brand, #7d82f7)'} />
                <span style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>
                  {file ? file.name : 'Choose a text-based PDF'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--outline, #94a3b8)' }}>
                  {file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : 'PDF up to 5 MB'}
                </span>
              </div>
            </div>
          </div>

          {/* Consent Checkbox */}
          <div style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <input
              id="consent-checkbox"
              type="checkbox"
              required
              checked={consent}
              disabled={submitting}
              onChange={(e) => setConsent(e.target.checked)}
              style={{ marginTop: 3, cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--primary-brand, #7d82f7)' }}
            />
            <label htmlFor="consent-checkbox" style={{ fontSize: 12, color: 'var(--on-surface-muted, #cbd5e1)', lineHeight: 1.5, cursor: 'pointer' }}>
              I agree my resume and voice answers are processed by AI and shared with the recruiter
            </label>
          </div>

          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: '12px 14px',
                borderRadius: 9,
                background: 'rgba(255,122,147,0.08)',
                border: '1px solid rgba(255,122,147,0.25)',
                color: 'var(--error, #ff7a93)',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary"
            style={{
              width: '100%',
              fontSize: 13,
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: 9,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? (
              <>
                <LoaderCircle size={16} style={{ animation: 'spin 1s linear infinite' }} />
                <span>{parsingPdf ? 'Parsing resume PDF…' : 'Submitting application…'}</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>Submit & Proceed to Voice Interview</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
