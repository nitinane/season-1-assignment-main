import { useState, useEffect } from 'react';
import {
  Briefcase, Users, CheckCircle2, Star, TrendingUp, Clock,
  Loader2, Zap, ArrowRight, Plus, RefreshCw
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { jobRoleService } from '../services/jobRoleService';
import { useNavigate } from 'react-router-dom';
import type { JobRole } from '../types';

const STATUS_COLORS: Record<string, string> = {
  ingested:            '#5ba3f7',
  scored:              '#9f77f7',
  shortlisted:         '#3de8a8',
  interview_scheduled: '#f7c040',
  hired:               '#3de8a8',
  rejected:            '#ff7a93',
};

const PIPELINE_LABELS: Record<string, string> = {
  ingested:            'Ingested',
  scored:              'Scored',
  shortlisted:         'Shortlisted',
  interview_scheduled: 'Interview Scheduled',
  hired:               'Hired',
  rejected:            'Rejected',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [loadingStats, setLoadingStats] = useState(true);
  const [seedingLoading, setSeedingLoading] = useState(false);

  const [stats, setStats] = useState({
    activeJobs:       0,
    totalApps:        0,
    shortlisted:      0,
    avgScore:         0,
    hired:            0,
    pendingReview:    0,
    recentJobs:       [] as JobRole[],
    timeline:         [] as { date: string; applications: number }[],
    pipeline:         [] as { name: string; value: number; color: string }[],
    recentApps:       [] as { name: string; job: string; score: number | null; status: string; created_at: string }[],
  });

  useEffect(() => { fetchDashboardData(); }, []);

  const fetchDashboardData = async () => {
    setLoadingStats(true);
    try {
      const { data: appData } = await supabase
        .from('applications')
        .select('id, candidate_name, score, status, created_at, job_id')
        .order('created_at', { ascending: false });

      const jobs = await jobRoleService.getRoles() as JobRole[];

      const apps = appData || [];
      const scores = apps.filter(a => a.score !== null && a.score > 0).map(a => a.score as number);
      const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

      // Pipeline breakdown
      const statusCount: Record<string, number> = {};
      apps.forEach(a => { statusCount[a.status] = (statusCount[a.status] || 0) + 1; });
      const pipelineData = Object.entries(statusCount).map(([status, count]) => ({
        name: PIPELINE_LABELS[status] || status,
        value: count,
        color: STATUS_COLORS[status] || '#8884d8',
      }));

      // Timeline (last 7 days)
      const now = Date.now();
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now - (6 - i) * 86400000);
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const count = apps.filter(a => {
          const appDate = new Date(a.created_at);
          return appDate.toDateString() === d.toDateString();
        }).length;
        return { date: label, applications: count };
      });

      // Job title map for recent apps
      const jobMap: Record<string, string> = {};
      jobs.forEach(j => { jobMap[j.id] = j.title; });

      const recentApps = apps.slice(0, 6).map(a => ({
        name: a.candidate_name || 'Unknown',
        job:  jobMap[a.job_id] || 'Unknown Role',
        score: a.score,
        status: a.status,
        created_at: a.created_at,
      }));

      setStats({
        activeJobs:    jobs.filter(j => j.status === 'active').length,
        totalApps:     apps.length,
        shortlisted:   apps.filter(a => ['shortlisted', 'interview_scheduled', 'hired'].includes(a.status)).length,
        avgScore:      avg,
        hired:         apps.filter(a => a.status === 'hired').length,
        pendingReview: apps.filter(a => a.status === 'ingested').length,
        recentJobs:    jobs.slice(0, 4),
        timeline:      days,
        pipeline:      pipelineData,
        recentApps,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleLoadDemo = async () => {
    setSeedingLoading(true);
    const toastId = toast.loading('Populating demo data…');
    try {
      const { seedDemoData } = await import('../services/demoService');
      await seedDemoData();
      toast.success('Demo dataset loaded!', { id: toastId });
      fetchDashboardData();
    } catch (e: any) {
      toast.error(`Seeding failed: ${e.message}`, { id: toastId });
    } finally {
      setSeedingLoading(false);
    }
  };

  const kpis = [
    {
      label: 'Active Jobs',
      value: stats.activeJobs,
      icon: Briefcase,
      accent: '#5b5ef4',
      glow: 'rgba(91,94,244,0.15)',
      action: () => navigate('/jobs'),
    },
    {
      label: 'Applications',
      value: stats.totalApps,
      icon: Users,
      accent: '#5ba3f7',
      glow: 'rgba(91,163,247,0.12)',
      action: () => navigate('/applications'),
    },
    {
      label: 'Shortlisted',
      value: stats.shortlisted,
      icon: Star,
      accent: '#3de8a8',
      glow: 'rgba(61,232,168,0.12)',
      action: () => navigate('/applications'),
    },
    {
      label: 'Avg Score',
      value: stats.avgScore,
      icon: TrendingUp,
      accent: '#9f77f7',
      glow: 'rgba(159,119,247,0.12)',
      action: null,
    },
    {
      label: 'Hired',
      value: stats.hired,
      icon: CheckCircle2,
      accent: '#3de8a8',
      glow: 'rgba(61,232,168,0.1)',
      action: null,
    },
    {
      label: 'Pending Review',
      value: stats.pendingReview,
      icon: Clock,
      accent: '#f7c040',
      glow: 'rgba(247,192,64,0.1)',
      action: () => navigate('/applications'),
    },
  ];

  const Skeleton = ({ h = 24, w = '100%' }: { h?: number; w?: string }) => (
    <div className="shimmer" style={{ height: h, width: w, borderRadius: 6 }} />
  );

  const scoreColor = (score: number | null) => {
    if (!score) return 'var(--outline)';
    if (score >= 80) return '#3de8a8';
    if (score >= 60) return '#9f77f7';
    return '#ff7a93';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="animate-fade-in">

      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--on-surface)', margin: 0 }}>
            Recruitment{' '}
            <span style={{
              background: 'linear-gradient(135deg, #5b5ef4 0%, #9f77f7 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              Overview
            </span>
          </h1>
          <p style={{ fontSize: 13, color: 'var(--on-surface-muted)', marginTop: 4 }}>
            Live pipeline stats across all active job roles.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={fetchDashboardData}
            disabled={loadingStats}
            className="btn-secondary"
            style={{ padding: '8px 14px', fontSize: 12 }}
          >
            <RefreshCw size={13} style={{ animation: loadingStats ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
          <button onClick={() => navigate('/jobs')} className="btn-primary" style={{ fontSize: 12, padding: '8px 16px' }}>
            <Plus size={13} />
            New Job Role
          </button>
        </div>
      </div>

      {/* ── Empty / Demo State ─────────────────────────────── */}
      {!loadingStats && stats.totalApps === 0 && stats.activeJobs === 0 && (
        <div style={{
          padding: '22px 24px', borderRadius: 14,
          background: 'linear-gradient(135deg, rgba(91,94,244,0.08) 0%, rgba(159,119,247,0.06) 100%)',
          border: '1px solid rgba(91,94,244,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: 'rgba(91,94,244,0.15)', border: '1px solid rgba(91,94,244,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={22} color="var(--primary)" fill="var(--primary)" style={{ opacity: 0.9 }} />
            </div>
            <div>
              <p style={{ fontWeight: 700, color: 'var(--on-surface)', fontSize: 14, marginBottom: 3 }}>
                🚀 Get started with HireFlow AI
              </p>
              <p style={{ fontSize: 12, color: 'var(--on-surface-muted)', lineHeight: 1.6, margin: 0, maxWidth: 560 }}>
                The database is empty. Load a demo dataset (Senior Full Stack Engineer + 4 candidates at different pipeline stages) to explore AI screening, shortlisting, and hiring decisions right now.
              </p>
            </div>
          </div>
          <button
            onClick={handleLoadDemo}
            disabled={seedingLoading}
            className="btn-primary"
            style={{ flexShrink: 0, fontSize: 12, padding: '9px 18px' }}
          >
            {seedingLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={14} />}
            {seedingLoading ? 'Loading Demo…' : 'Load Demo Data'}
          </button>
        </div>
      )}

      {/* ── KPI Cards ──────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14 }}>
        {kpis.map(({ label, value, icon: Icon, accent, glow, action }) => (
          <div
            key={label}
            className="stat-card"
            style={{
              borderTop: `2px solid ${accent}`,
              boxShadow: `0 -2px 20px ${glow}`,
              cursor: action ? 'pointer' : 'default',
              padding: '18px 20px',
            }}
            onClick={action ?? undefined}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: glow,
                border: `1px solid ${accent}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={16} color={accent} />
              </div>
              {action && <ArrowRight size={13} color="var(--outline-dim)" />}
            </div>
            {loadingStats ? (
              <Skeleton h={32} w="60%" />
            ) : (
              <span style={{
                fontSize: 30, fontWeight: 800, color: 'var(--on-surface)',
                letterSpacing: '-0.04em', display: 'block', lineHeight: 1,
              }}>
                {value}
              </span>
            )}
            <span style={{
              fontSize: 10.5, fontFamily: "'Geist Mono', monospace", fontWeight: 600,
              letterSpacing: '0.07em', textTransform: 'uppercase',
              color: 'var(--on-surface-muted)', marginTop: 6, display: 'block',
            }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* ── Charts Row ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>

        {/* Applications Timeline */}
        <div className="glass-card-solid" style={{ padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <p style={{ fontWeight: 700, color: 'var(--on-surface)', fontSize: 15, margin: 0 }}>Applications (7 days)</p>
              <p style={{ fontSize: 12, color: 'var(--outline)', marginTop: 3 }}>Daily ingestion count</p>
            </div>
            <span className="badge badge-purple" style={{ fontSize: 10 }}>Live</span>
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.timeline}>
                <defs>
                  <linearGradient id="appGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#5b5ef4" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#5b5ef4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'var(--outline)', fontSize: 11 }} dy={10} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface-high)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: 'var(--on-surface)' }}
                  itemStyle={{ color: 'var(--primary)' }}
                />
                <Area type="monotone" dataKey="applications" stroke="#5b5ef4" strokeWidth={2.5} fillOpacity={1} fill="url(#appGrad)" dot={{ fill: '#5b5ef4', strokeWidth: 0, r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pipeline Breakdown */}
        <div className="glass-card-solid" style={{ padding: '22px 24px' }}>
          <p style={{ fontWeight: 700, color: 'var(--on-surface)', fontSize: 15, margin: '0 0 4px' }}>Pipeline Status</p>
          <p style={{ fontSize: 12, color: 'var(--outline)', marginBottom: 16 }}>Candidates by stage</p>

          {stats.pipeline.length === 0 && !loadingStats ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 180, color: 'var(--outline)', fontSize: 12 }}>
              No data yet
            </div>
          ) : (
            <>
              <div style={{ height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.pipeline}
                      cx="50%" cy="50%"
                      innerRadius={42} outerRadius={62}
                      paddingAngle={4}
                      dataKey="value" stroke="none"
                    >
                      {stats.pipeline.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'var(--surface-high)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {stats.pipeline.map((item) => (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: 'var(--on-surface-muted)' }}>{item.name}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--on-surface)', fontFamily: "'Geist Mono', monospace" }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Bottom Row: Recent Apps + Active Jobs ──────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>

        {/* Recent Applications */}
        <div className="glass-card-solid" style={{ padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <p style={{ fontWeight: 700, color: 'var(--on-surface)', fontSize: 15, margin: 0 }}>Recent Applications</p>
            <button
              onClick={() => navigate('/applications')}
              style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              View all <ArrowRight size={12} />
            </button>
          </div>

          {loadingStats ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1,2,3,4].map(i => <Skeleton key={i} h={44} />)}
            </div>
          ) : stats.recentApps.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <p style={{ color: 'var(--outline)', fontSize: 13 }}>No applications yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {stats.recentApps.map((app, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 9,
                    transition: 'background 0.15s', cursor: 'pointer',
                  }}
                  onClick={() => navigate('/applications')}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: `linear-gradient(135deg, ${STATUS_COLORS[app.status] || '#5b5ef4'}22 0%, ${STATUS_COLORS[app.status] || '#5b5ef4'}11 100%)`,
                    border: `1px solid ${STATUS_COLORS[app.status] || '#5b5ef4'}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: STATUS_COLORS[app.status] || '#5b5ef4',
                  }}>
                    {app.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {app.name}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--outline)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {app.job}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {app.score !== null && (
                      <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(app.score), fontFamily: "'Geist Mono', monospace" }}>
                        {app.score}
                      </span>
                    )}
                    <span className={`pipeline-badge status-${app.status}`} style={{ fontSize: 10 }}>
                      {PIPELINE_LABELS[app.status] || app.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Job Roles */}
        <div className="glass-card-solid" style={{ padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <p style={{ fontWeight: 700, color: 'var(--on-surface)', fontSize: 15, margin: 0 }}>Active Roles</p>
            <button
              onClick={() => navigate('/jobs')}
              style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              Manage <ArrowRight size={12} />
            </button>
          </div>

          {loadingStats ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1,2,3].map(i => <Skeleton key={i} h={56} />)}
            </div>
          ) : stats.recentJobs.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0', flexDirection: 'column' }}>
              <div className="empty-state-icon"><Briefcase size={24} color="var(--primary)" /></div>
              <p style={{ color: 'var(--on-surface-muted)', fontSize: 13, fontWeight: 500, margin: '0 0 14px' }}>No job roles yet</p>
              <button onClick={() => navigate('/jobs')} className="btn-primary" style={{ fontSize: 12, padding: '8px 16px' }}>
                <Plus size={13} /> Create Role
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.recentJobs.map((job) => (
                <div
                  key={job.id}
                  style={{
                    padding: '12px 14px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                  onClick={() => navigate('/jobs')}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(91,94,244,0.07)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(91,94,244,0.2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)'; }}
                >
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)', margin: '0 0 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.title}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: 'var(--outline)' }}>{job.experience_level || 'Any experience'}</span>
                    <span className="badge badge-green" style={{ fontSize: 9.5 }}>Active</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
