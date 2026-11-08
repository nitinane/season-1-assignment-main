import { NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import {
  LayoutDashboard, Briefcase, FileStack, Users, Settings, LogOut, Zap, Headset
} from 'lucide-react';

const navItems = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard'    },
  { to: '/jobs',         icon: Briefcase,        label: 'Job Roles'    },
  { to: '/applications', icon: FileStack,         label: 'Applications' },
  { to: '/candidates',   icon: Users,             label: 'Candidates'   },
  { to: '/recruiter', icon: Headset,              label: 'Voice Recruiter' },
  { to: '/settings',     icon: Settings,          label: 'Settings'     },
];

export default function Sidebar() {
  const user     = useAuthStore((s) => s.user);
  const clear    = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    clear();
    navigate('/login');
  };

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'HR User';
  const initials    = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <aside
      style={{
        width: 'var(--sidebar-w)',
        background: 'linear-gradient(180deg, var(--surface) 0%, rgba(9,9,26,0.98) 100%)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
      className="fixed left-0 top-0 h-screen flex flex-col z-40"
    >
      {/* ── Logo ─────────────────────────────────────────────── */}
      <div style={{ padding: '22px 18px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, #5b5ef4 0%, #9f77f7 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(91,94,244,0.45)',
          }}>
            <Zap size={17} color="#fff" fill="#fff" />
          </div>
          <div>
            <span style={{
              fontSize: 16, fontWeight: 700,
              background: 'linear-gradient(135deg, #c4c5ff 0%, #d4c4ff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              letterSpacing: '-0.02em',
              display: 'block', lineHeight: 1.2,
            }}>
              HireFlow AI
            </span>
            <span style={{ fontSize: 10, color: 'var(--outline)', fontFamily: "'Geist Mono', monospace", letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Recruitment Platform
            </span>
          </div>
        </div>
      </div>

      {/* ── Navigation ─────────────────────────────────────────── */}
      <nav style={{ flex: 1, padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        <p style={{ fontSize: 10, fontFamily: "'Geist Mono', monospace", fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--outline-dim)', padding: '4px 8px 10px', marginBottom: 2 }}>
          Menu
        </p>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} style={{ textDecoration: 'none' }}>
            {({ isActive }) => (
              <div
                className={isActive ? 'nav-item-active' : 'nav-item'}
                style={{ position: 'relative' }}
              >
                <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
                <span style={{ fontWeight: isActive ? 600 : 500, fontSize: 13 }}>{label}</span>
                {isActive && (
                  <div style={{
                    position: 'absolute', right: 10,
                    width: 4, height: 4, borderRadius: '50%',
                    background: 'var(--primary-brand)',
                    boxShadow: '0 0 6px var(--primary-brand)',
                  }} />
                )}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── AI Status Pill ─────────────────────────────────────── */}
      <div style={{ padding: '0 10px 12px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 9,
          background: 'rgba(61,232,168,0.07)',
          border: '1px solid rgba(61,232,168,0.15)',
        }}>
          <span className="dot-pulse" />
          <span style={{
            fontFamily: "'Geist Mono', monospace", fontSize: 10, fontWeight: 600,
            letterSpacing: '0.06em', color: 'var(--tertiary)', textTransform: 'uppercase',
          }}>
            AI Agents Online
          </span>
        </div>
      </div>

      {/* ── User footer ────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 9 }}>
          {user?.user_metadata?.avatar_url ? (
            <img
              src={user.user_metadata.avatar_url}
              alt="avatar"
              style={{
                width: 30, height: 30, borderRadius: '50%', objectFit: 'cover',
                border: '2px solid rgba(91,94,244,0.4)', flexShrink: 0,
              }}
            />
          ) : (
            <div style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #5b5ef4 0%, #9f77f7 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#fff',
            }}>
              {initials}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
              {displayName}
            </p>
            <p style={{ fontSize: 10, color: 'var(--outline)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '5px', borderRadius: 6,
              color: 'var(--outline)',
              transition: 'color 0.2s, background 0.2s',
              display: 'flex', flexShrink: 0,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = 'var(--error)';
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,122,147,0.1)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = 'var(--outline)';
              (e.currentTarget as HTMLElement).style.background = 'none';
            }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
