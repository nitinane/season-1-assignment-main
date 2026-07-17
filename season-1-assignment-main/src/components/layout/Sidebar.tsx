import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Briefcase, Users, BarChart3,
  Settings, LogOut, Zap, ChevronRight
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import clsx from 'clsx';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/jobs', icon: Briefcase, label: 'Job Roles' },
  { to: '/candidates', icon: Users, label: 'Candidates' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    clear();
    navigate('/login');
  };

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-white/8 bg-surface-50/60 backdrop-blur-xl">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 shadow-glow-sm">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <div>
          <span className="font-display text-lg font-bold text-white">HireFlow</span>
          <span className="font-display text-lg font-bold text-gradient"> AI</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to}>
            {({ isActive }) => (
              <div className={clsx(isActive ? 'nav-item-active' : 'nav-item')}>
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
                {isActive && <ChevronRight className="ml-auto h-3 w-3 opacity-50" />}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bias-Free Badge */}
      <div className="mx-3 mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          <span className="text-xs font-semibold text-emerald-400">Bias-Free AI Screening</span>
        </div>
        <p className="mt-1 text-xs text-emerald-400/60">Names & identifiers hidden during ranking</p>
      </div>

      {/* User footer */}
      <div className="border-t border-white/8 p-3">
        <div className="flex items-center gap-3 rounded-xl p-2">
          {user?.user_metadata?.avatar_url ? (
            <img
              src={user.user_metadata.avatar_url}
              alt="avatar"
              className="h-8 w-8 rounded-full object-cover ring-2 ring-brand-500/40"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">
              {user?.user_metadata?.full_name || user?.email?.split('@')[0]}
            </p>
            <p className="truncate text-xs text-white/40">{user?.email}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="rounded-lg p-1.5 text-white/30 transition-colors hover:bg-red-500/15 hover:text-red-400"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
