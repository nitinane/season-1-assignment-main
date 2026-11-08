import React from 'react';
import { handleGoogleLogin } from '../services/authService';
import toast from 'react-hot-toast';
import { Zap, Brain, Shield, Sparkles, Send } from 'lucide-react';

const features = [
  { icon: Brain,    title: 'AI-Powered Scoring',   desc: 'Groq LLM ranks every resume with structured reasoning, not gut feel.' },
  { icon: Sparkles, title: 'Auto JD Generation',   desc: 'Paste rough notes — Agent 1 drafts a complete job description in seconds.' },
  { icon: Send,     title: 'HR Always Decides',     desc: 'AI drafts emails and questions. You review before anything goes out.' },
  { icon: Shield,   title: 'Bias-Free Screening',  desc: 'Names, photos, and location stripped before scoring — every time.' },
];

export default function Login() {
  const [loading, setLoading] = React.useState(false);

  const onLoginClick = async () => {
    setLoading(true);
    try {
      await handleGoogleLogin();
    } catch (err: any) {
      toast.error(err.message || 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg)' }}>

      {/* ── Left Hero Panel ─────────────────────────────────── */}
      <div
        className="hidden lg:flex"
        style={{
          width: '52%',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '52px 60px',
          position: 'relative',
          overflow: 'hidden',
          borderRight: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        {/* Ambient glows */}
        <div style={{ position: 'absolute', top: '-20%', left: '-15%', width: '70%', height: '70%', background: 'radial-gradient(circle, rgba(91,94,244,0.22) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-15%', right: '-10%', width: '55%', height: '55%', background: 'radial-gradient(circle, rgba(159,119,247,0.14) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '40%', right: '10%', width: '30%', height: '30%', background: 'radial-gradient(circle, rgba(61,232,168,0.06) 0%, transparent 65%)', pointerEvents: 'none' }} />

        {/* Floating particles */}
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: i % 2 === 0 ? 4 : 3,
            height: i % 2 === 0 ? 4 : 3,
            borderRadius: '50%',
            background: i % 3 === 0 ? 'var(--primary-brand)' : i % 3 === 1 ? 'var(--secondary-brand)' : 'var(--tertiary)',
            top: `${15 + i * 15}%`,
            left: `${60 + (i % 3) * 12}%`,
            opacity: 0.5,
            animation: `float ${3 + i * 0.7}s ease-in-out infinite`,
            animationDelay: `${i * 0.4}s`,
          }} />
        ))}

        {/* Logo */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: 'linear-gradient(135deg, #5b5ef4 0%, #9f77f7 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 28px rgba(91,94,244,0.55)',
          }}>
            <Zap size={22} color="#fff" fill="#fff" />
          </div>
          <div>
            <span style={{
              fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em',
              background: 'linear-gradient(135deg, #c4c5ff 0%, #d4c4ff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              display: 'block', lineHeight: 1.2,
            }}>
              HireFlow AI
            </span>
            <span style={{ fontSize: 11, color: 'var(--outline)', fontFamily: "'Geist Mono', monospace", letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Recruitment Platform
            </span>
          </div>
        </div>

        {/* Hero copy */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 14px', borderRadius: 9999,
            background: 'rgba(61,232,168,0.08)',
            border: '1px solid rgba(61,232,168,0.2)',
            marginBottom: 28,
          }}>
            <span className="dot-pulse" />
            <span style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", fontWeight: 600, letterSpacing: '0.06em', color: 'var(--tertiary)', textTransform: 'uppercase' }}>
              9 AI Agents Active
            </span>
          </div>

          <h1 style={{
            fontSize: 54, fontWeight: 800, lineHeight: 1.08,
            letterSpacing: '-0.04em', color: 'var(--on-surface)', marginBottom: 20,
          }}>
            Hire smarter,<br />
            <span style={{
              background: 'linear-gradient(135deg, #5b5ef4 0%, #9f77f7 50%, #5ba3f7 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              faster, fairer.
            </span>
          </h1>
          <p style={{
            fontSize: 16, color: 'var(--on-surface-muted)', lineHeight: 1.75,
            maxWidth: 440, marginBottom: 44,
          }}>
            AI-powered recruitment from "we need to hire" to "offer sent" — without removing HR's judgment from any consequential decision.
          </p>

          {/* Feature list */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} style={{
                padding: '16px 18px', borderRadius: 12,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                transition: 'border-color 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(196,197,255,0.18)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: 'rgba(91,94,244,0.12)',
                    border: '1px solid rgba(91,94,244,0.22)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={14} color="var(--primary)" />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)' }}>{title}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--on-surface-muted)', lineHeight: 1.6, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer trust badges */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 20, fontSize: 12, color: 'var(--outline)', alignItems: 'center' }}>
          {['Trusted by 200+ HR teams', 'SOC 2 Compliant', 'GDPR Ready'].map((t, i) => (
            <React.Fragment key={t}>
              <span>{t}</span>
              {i < 2 && <span style={{ opacity: 0.3 }}>·</span>}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Right Login Panel ──────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', position: 'relative' }}>

        {/* mobile ambient glow */}
        <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)', width: '80%', height: '60%', background: 'radial-gradient(circle, rgba(91,94,244,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>

          {/* Mobile logo */}
          <div className="lg:hidden" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 36 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #5b5ef4 0%, #9f77f7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 18px rgba(91,94,244,0.45)' }}>
              <Zap size={18} color="#fff" fill="#fff" />
            </div>
            <span style={{ fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #c4c5ff 0%, #d4c4ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              HireFlow AI
            </span>
          </div>

          {/* Card */}
          <div style={{
            background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-low) 100%)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 18, padding: '40px 36px',
            boxShadow: '0 24px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}>
            {/* Top gradient line */}
            <div style={{
              height: 2, borderRadius: '2px 2px 0 0',
              background: 'linear-gradient(90deg, var(--primary-brand) 0%, var(--secondary-brand) 100%)',
              margin: '-40px -36px 36px',
            }} />

            <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--on-surface)', marginBottom: 6, letterSpacing: '-0.02em' }}>
              Welcome back
            </h2>
            <p style={{ fontSize: 13.5, color: 'var(--on-surface-muted)', marginBottom: 28, lineHeight: 1.5 }}>
              Sign in with your Google Workspace account to access the recruitment platform.
            </p>

            {/* Scopes notice */}
            <div style={{
              marginBottom: 24, padding: '13px 15px', borderRadius: 10,
              background: 'rgba(247,192,64,0.07)',
              border: '1px solid rgba(247,192,64,0.18)',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>⚠️</span>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#f7c040', marginBottom: 3 }}>
                  Google Workspace Access Required
                </p>
                <p style={{ fontSize: 12, color: 'rgba(247,192,64,0.65)', lineHeight: 1.6, margin: 0 }}>
                  HireFlow AI needs Gmail (send emails) and Drive (read resume folder). We never store your Google credentials.
                </p>
              </div>
            </div>

            {/* Google Sign In Button */}
            <button
              onClick={onLoginClick}
              disabled={loading}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                padding: '13px 20px', borderRadius: 10,
                fontSize: 14, fontWeight: 600, color: 'var(--on-surface)',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: loading ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!loading) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.09)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.2)'; } }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)'; }}
            >
              {loading ? (
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
              ) : (
                <svg style={{ width: 20, height: 20 }} viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              {loading ? 'Connecting…' : 'Continue with Google'}
            </button>

            <p style={{ marginTop: 22, textAlign: 'center', fontSize: 11.5, color: 'var(--outline)', lineHeight: 1.65 }}>
              By signing in, you agree to our Terms of Service and Privacy Policy.<br />
              Your data is encrypted and never shared with third parties.
            </p>
          </div>

          <p style={{ marginTop: 18, textAlign: 'center', fontSize: 11, color: 'var(--outline-dim)' }}>
            HireFlow AI © 2025 · Built for modern recruitment teams
          </p>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
