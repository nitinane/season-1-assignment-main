import { Link } from 'react-router-dom';
import { UserCheck, Briefcase, ArrowRight, Sparkles } from 'lucide-react';

export default function Landing() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--surface, #09091a)' }}>
      {/* Header */}
      <header
        style={{
          padding: '18px 32px',
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
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #5b5ef4 0%, #9f77f7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={18} color="#fff" />
          </div>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>HireFlow AI</span>
        </div>
      </header>

      {/* Hero Content */}
      <div
        style={{
          maxWidth: 820,
          margin: '0 auto',
          padding: '64px 24px 48px',
          width: '100%',
          boxSizing: 'border-box',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontFamily: "'Geist Mono', monospace",
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--primary-brand, #7d82f7)',
            background: 'rgba(125,130,247,0.1)',
            padding: '5px 12px',
            borderRadius: 20,
            display: 'inline-block',
            marginBottom: 16,
          }}
        >
          Autonomous Hiring Intelligence
        </span>

        <h1 style={{ fontSize: 36, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', margin: '0 0 14px' }}>
          Welcome to HireFlow AI
        </h1>

        <p style={{ fontSize: 15, color: 'var(--outline, #94a3b8)', lineHeight: 1.6, maxWidth: 540, margin: '0 auto 48px' }}>
          Autonomous resume scoring and real-time conversational AI voice screening. Choose how you want to proceed:
        </p>

        {/* 2 Cards Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 24,
            textAlign: 'left',
          }}
        >
          {/* Applicant Card */}
          <Link
            to="/careers"
            className="glass-card-solid"
            style={{
              padding: '32px 28px',
              borderRadius: 16,
              textDecoration: 'none',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'all 0.2s ease',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'rgba(91,94,244,0.15)',
                  border: '1px solid rgba(91,94,244,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 20,
                }}
              >
                <Briefcase size={22} color="var(--primary-brand, #7d82f7)" />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>
                I'm an applicant
              </h2>
              <p style={{ fontSize: 13, color: 'var(--on-surface-muted, #cbd5e1)', lineHeight: 1.6, margin: 0 }}>
                Browse open roles, submit your resume, and complete your quick AI voice interview.
              </p>
            </div>

            <div
              style={{
                marginTop: 28,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--primary-brand, #7d82f7)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Explore Careers <ArrowRight size={15} />
            </div>
          </Link>

          {/* Recruiter Card */}
          <Link
            to="/recruiter"
            className="glass-card-solid"
            style={{
              padding: '32px 28px',
              borderRadius: 16,
              textDecoration: 'none',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'all 0.2s ease',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'rgba(61,232,168,0.15)',
                  border: '1px solid rgba(61,232,168,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 20,
                }}
              >
                <UserCheck size={22} color="var(--tertiary, #3de8a8)" />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>
                I'm a recruiter
              </h2>
              <p style={{ fontSize: 13, color: 'var(--on-surface-muted, #cbd5e1)', lineHeight: 1.6, margin: 0 }}>
                Access the recruiter dashboard to review scorecards, listen to interviews, and manage candidates.
              </p>
            </div>

            <div
              style={{
                marginTop: 28,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--tertiary, #3de8a8)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Open Recruiter Portal <ArrowRight size={15} />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

