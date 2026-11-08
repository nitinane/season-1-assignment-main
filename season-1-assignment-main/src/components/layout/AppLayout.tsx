import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { Bell } from 'lucide-react';

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/dashboard':    { title: 'Dashboard',    subtitle: 'Overview of your recruitment pipeline' },
  '/jobs':         { title: 'Job Roles',    subtitle: 'Create and manage open positions' },
  '/applications': { title: 'Applications', subtitle: 'Review and advance candidates through the pipeline' },
  '/candidates':   { title: 'Candidates',   subtitle: 'Candidate detail, AI scoring & interview questions' },
  '/settings':     { title: 'Settings',     subtitle: 'Integrations, notifications and account' },
};

export default function AppLayout() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const pageInfo = PAGE_TITLES[location.pathname] ?? { title: 'HireFlow AI', subtitle: '' };
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'HR User';

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Sidebar />

      <main
        className="flex-1 flex flex-col overflow-hidden relative"
        style={{ marginLeft: 'var(--sidebar-w)' }}
      >
        {/* Ambient background glows */}
        <div style={{
          position: 'fixed', top: '-5%', left: 'calc(var(--sidebar-w) + 5%)',
          width: '55%', height: '55%',
          background: 'radial-gradient(circle, rgba(91,94,244,0.1) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />
        <div style={{
          position: 'fixed', bottom: '-10%', right: '-5%',
          width: '40%', height: '40%',
          background: 'radial-gradient(circle, rgba(159,119,247,0.07) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Topbar */}
        <header className="topbar" style={{ position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--on-surface)', letterSpacing: '-0.01em' }}>
              {pageInfo.title}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--outline)', lineHeight: 1 }}>
              {pageInfo.subtitle}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              style={{
                width: 36, height: 36, borderRadius: 9,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--outline)',
                transition: 'all 0.2s', position: 'relative',
              }}
              title="Notifications"
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = 'var(--on-surface)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.color = 'var(--outline)'; }}
            >
              <Bell size={15} />
              {/* notification dot */}
              <span style={{
                position: 'absolute', top: 7, right: 7,
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--primary-brand)',
                boxShadow: '0 0 6px var(--primary-brand)',
              }} />
            </button>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 10px 5px 5px',
              borderRadius: 9,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              {user?.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt="avatar"
                  style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #5b5ef4 0%, #9f77f7 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: '#fff',
                }}>
                  {displayName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface-muted)' }}>
                {displayName.split(' ')[0]}
              </span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div style={{ flex: 1, overflowY: 'auto', position: 'relative', zIndex: 1 }}>
          <div style={{ padding: '28px 32px', minHeight: '100%' }}>
            <Outlet />
          </div>
        </div>
      </main>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--surface-low)',
            color: 'var(--on-surface)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '11px',
            fontSize: '13px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          },
          success: { iconTheme: { primary: '#3de8a8', secondary: 'var(--surface-low)' } },
          error:   { iconTheme: { primary: '#ff7a93', secondary: 'var(--surface-low)' } },
        }}
      />
    </div>
  );
}
