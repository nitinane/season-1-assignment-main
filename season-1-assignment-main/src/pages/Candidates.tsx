/**
 * Candidates — Candidate detail view (§5.3)
 * Shows AI score breakdown, interview questions, and shortlist action
 * for candidates associated with the selected job role.
 */

import { useState, useEffect } from 'react';
import {
  Loader2, Star, Zap, RefreshCw, Briefcase, ChevronRight,
  Brain, MessageSquare, Users, ArrowLeft
} from 'lucide-react';
import { useJobStore } from '../store/jobStore';
import { applicationService } from '../services/applicationService';
import { notifyShortlistedCandidate } from '../agents/shortlistNotifierAgent';
import { scoreApplication } from '../agents/resumeScorerAgent';
import type { Application } from '../agents/applicationIngestorAgent';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const STATUS_LABELS: Record<string, string> = {
  ingested:            'Ingested',
  scored:              'Scored',
  shortlisted:         'Shortlisted',
  interview_scheduled: 'Interview Scheduled',
  hired:               'Hired',
  rejected:            'Rejected',
};

function ScoreRing({ score }: { score: number }) {
  const radius = 36;
  const circ   = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const color  = score >= 80 ? '#3de8a8' : score >= 60 ? '#9f77f7' : score >= 40 ? '#f7c040' : '#ff7a93';

  return (
    <div style={{ position: 'relative', width: 88, height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={88} height={88} style={{ transform: 'rotate(-90deg)', position: 'absolute' }}>
        <circle cx={44} cy={44} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
        <circle
          cx={44} cy={44} r={radius} fill="none"
          stroke={color} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease', filter: `drop-shadow(0 0 6px ${color}70)` }}
        />
      </svg>
      <div style={{ textAlign: 'center', zIndex: 1 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "'Geist Mono', monospace", lineHeight: 1 }}>
          {score}
        </span>
        <span style={{ display: 'block', fontSize: 9, color: 'var(--outline)', fontFamily: "'Geist Mono', monospace", letterSpacing: '0.05em', marginTop: 2 }}>
          /100
        </span>
      </div>
    </div>
  );
}

export default function Candidates() {
  const navigate = useNavigate();
  const selectedJob = useJobStore((s) => s.selectedJob);

  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [interviewQuestions, setInterviewQuestions] = useState<any[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [scoring, setScoring] = useState<string | null>(null);
  const [shortlisting, setShortlisting] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedJob) return;
    loadApplications();
  }, [selectedJob]);

  const loadApplications = async () => {
    if (!selectedJob) return;
    setLoading(true);
    try {
      const data = await applicationService.getApplications(selectedJob.id);
      setApplications(data);
    } catch {
      toast.error('Failed to load candidates');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectApp = async (app: Application) => {
    setSelectedApp(app);
    setInterviewQuestions([]);
    setLoadingQuestions(true);
    try {
      const { data } = await supabase
        .from('interviews')
        .select('questions')
        .eq('application_id', app.id)
        .maybeSingle();
      if (data?.questions) setInterviewQuestions(data.questions);
    } catch { /* ignore */ }
    finally { setLoadingQuestions(false); }
  };

  const handleScore = async (appId: string) => {
    setScoring(appId);
    try {
      const result = await scoreApplication(appId);
      if (result.success) {
        toast.success(`Score: ${result.data.match_score}/100`);
        await loadApplications();
        if (selectedApp?.id === appId) {
          const { data } = await supabase.from('applications').select('*').eq('id', appId).single();
          if (data) setSelectedApp(data as Application);
        }
      } else {
        toast.error('Scoring failed: ' + result.error);
      }
    } finally {
      setScoring(null);
    }
  };

  const handleShortlist = async (appId: string) => {
    setShortlisting(appId);
    const toastId = toast.loading('Shortlisting & sending notification email…');
    try {
      const res = await notifyShortlistedCandidate(appId);
      if (res.success) {
        toast.success('Candidate shortlisted and email sent!', { id: toastId });
        await loadApplications();
        const { data } = await supabase.from('applications').select('*').eq('id', appId).single();
        if (data) setSelectedApp(data as Application);
      } else {
        toast.error(`Shortlisting failed: ${res.error}`, { id: toastId });
      }
    } catch (e: any) {
      toast.error(`Error: ${e.message}`, { id: toastId });
    } finally {
      setShortlisting(null);
    }
  };

  // No job selected
  if (!selectedJob) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--on-surface)', letterSpacing: '-0.02em', margin: 0 }}>Candidates</h1>
          <p style={{ fontSize: 13, color: 'var(--on-surface-muted)', marginTop: 3 }}>Select a job role to view candidates</p>
        </div>
        <div className="empty-state" style={{ padding: '80px 24px' }}>
          <div className="empty-state-icon"><Users size={28} color="var(--primary)" /></div>
          <p style={{ fontWeight: 600, color: 'var(--on-surface)', margin: '0 0 8px' }}>No job role selected</p>
          <p style={{ fontSize: 13, color: 'var(--outline)', maxWidth: 320, lineHeight: 1.6, margin: '0 0 20px' }}>
            Go to Job Roles and click a role to view its candidates here.
          </p>
          <button onClick={() => navigate('/jobs')} className="btn-primary" style={{ fontSize: 12 }}>
            <Briefcase size={13} /> View Job Roles
          </button>
        </div>
      </div>
    );
  }

  let reasoning: Record<string, unknown> | null = null;
  try { if (selectedApp?.score_reasoning) reasoning = JSON.parse(selectedApp.score_reasoning); } catch {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <button
            onClick={() => navigate('/jobs')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--outline)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8 }}
          >
            <ArrowLeft size={12} /> Back to Job Roles
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--on-surface)', letterSpacing: '-0.02em', margin: 0 }}>
            {selectedJob.title}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--on-surface-muted)', marginTop: 3 }}>
            {applications.length} candidate{applications.length !== 1 ? 's' : ''} · {selectedJob.experience_level || 'Any experience'}
          </p>
        </div>
        <button onClick={loadApplications} className="btn-secondary" style={{ padding: '8px 12px', fontSize: 12 }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* ── Job skills */}
      {(selectedJob.required_skills || []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--outline)', fontFamily: "'Geist Mono', monospace", letterSpacing: '0.05em', textTransform: 'uppercase' }}>Required:</span>
          {(Array.isArray(selectedJob.required_skills) ? selectedJob.required_skills : String(selectedJob.required_skills).split(',')).map((s: string, i: number) => (
            <span key={i} className="badge badge-purple" style={{ fontSize: 10 }}>{s.trim()}</span>
          ))}
        </div>
      )}

      {/* ── Two-column layout ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, alignItems: 'start' }}>

        {/* Candidate list */}
        <div className="glass-card-solid" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>Candidates</p>
          </div>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
              <Loader2 size={22} color="var(--outline)" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : applications.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 20px' }}>
              <p style={{ fontSize: 12, color: 'var(--outline)' }}>No candidates yet. Upload resumes in Applications.</p>
              <button onClick={() => navigate('/applications')} className="btn-secondary" style={{ fontSize: 11, marginTop: 10, padding: '6px 14px' }}>
                Go to Applications
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {applications
                .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                .map((app) => {
                  const isSelected = selectedApp?.id === app.id;
                  const scoreColor = !app.score ? 'var(--outline)' : app.score >= 80 ? '#3de8a8' : app.score >= 60 ? '#9f77f7' : '#ff7a93';
                  return (
                    <button
                      key={app.id}
                      onClick={() => handleSelectApp(app)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 16px', width: '100%', textAlign: 'left',
                        background: isSelected ? 'rgba(91,94,244,0.08)' : 'transparent',
                        borderLeft: isSelected ? '2px solid var(--primary-brand)' : '2px solid transparent',
                        border: 'none', cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg, rgba(91,94,244,0.15) 0%, rgba(159,119,247,0.1) 100%)',
                        border: `1px solid ${isSelected ? 'rgba(91,94,244,0.35)' : 'rgba(255,255,255,0.08)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700, color: isSelected ? 'var(--primary)' : 'var(--on-surface-muted)',
                      }}>
                        {(app.candidate_name || '?').charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12.5, fontWeight: 600, color: isSelected ? 'var(--on-surface)' : 'var(--on-surface-muted)', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {app.candidate_name || 'Unknown'}
                        </p>
                        <span className={`pipeline-badge status-${app.status}`} style={{ fontSize: 9.5 }}>
                          {STATUS_LABELS[app.status] || app.status}
                        </span>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 800, color: scoreColor, fontFamily: "'Geist Mono', monospace", flexShrink: 0 }}>
                        {app.score ?? '—'}
                      </span>
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedApp ? (
          <div className="glass-card-solid" style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '22px 24px' }}>

            {/* Candidate header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <ScoreRing score={selectedApp.score ?? 0} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--on-surface)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
                  {selectedApp.candidate_name || 'Unknown Candidate'}
                </h2>
                <p style={{ fontSize: 12.5, color: 'var(--outline)', margin: '0 0 10px' }}>
                  {selectedApp.candidate_email || '—'}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className={`pipeline-badge status-${selectedApp.status}`}>
                    {STATUS_LABELS[selectedApp.status] || selectedApp.status}
                  </span>
                  {selectedApp.score === null && (
                    <button
                      onClick={() => handleScore(selectedApp.id)}
                      disabled={scoring === selectedApp.id}
                      className="btn-secondary"
                      style={{ padding: '3px 10px', fontSize: 11 }}
                    >
                      {scoring === selectedApp.id ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={11} />}
                      Score with AI
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Score reasoning (Agent 4) */}
            {reasoning && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Brain size={14} color="var(--primary)" />
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>AI Score Analysis</p>
                  <div className="ai-draft-banner" style={{ fontSize: 10 }}><Zap size={10} /> Agent 4</div>
                </div>

                {Boolean(reasoning['reasoning']) && (
                  <p style={{ fontSize: 13, color: 'var(--on-surface-muted)', lineHeight: 1.7, margin: 0 }}>
                    {String(reasoning['reasoning'])}
                  </p>
                )}

                {Boolean(reasoning['advantage_notes']) && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 9,
                    background: 'rgba(61,232,168,0.07)', border: '1px solid rgba(61,232,168,0.2)',
                  }}>
                    <p style={{ fontSize: 12, color: 'var(--tertiary)', margin: 0 }}>⭐ {String(reasoning['advantage_notes'])}</p>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 16 }}>
                  {Array.isArray(reasoning['matched_skills']) && (reasoning['matched_skills'] as string[]).length > 0 && (
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 10.5, fontFamily: "'Geist Mono', monospace", fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--tertiary)', margin: '0 0 8px' }}>Matched Skills</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {(reasoning['matched_skills'] as string[]).map((s: string, i: number) => (
                          <span key={i} className="badge badge-green" style={{ fontSize: 10 }}>✓ {s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {Array.isArray(reasoning['missing_skills']) && (reasoning['missing_skills'] as string[]).length > 0 && (
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 10.5, fontFamily: "'Geist Mono', monospace", fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--error)', margin: '0 0 8px' }}>Gap Areas</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {(reasoning['missing_skills'] as string[]).map((s: string, i: number) => (
                          <span key={i} className="badge badge-red" style={{ fontSize: 10 }}>✗ {s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Score progress bar */}
            {selectedApp.score !== null && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--outline)', fontFamily: "'Geist Mono', monospace", letterSpacing: '0.05em', textTransform: 'uppercase' }}>Match Score</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--on-surface)', fontFamily: "'Geist Mono', monospace" }}>{selectedApp.score}/100</span>
                </div>
                <div className="progress-bar-track" style={{ height: 6 }}>
                  <div className="progress-bar-fill" style={{ width: `${selectedApp.score}%` }} />
                </div>
              </div>
            )}

            {/* Interview Questions (Agent 6 — HR only) */}
            {(interviewQuestions.length > 0 || loadingQuestions) && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <MessageSquare size={14} color="var(--primary)" />
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>Interview Questions</p>
                  <div className="ai-draft-banner" style={{ fontSize: 10 }}><Zap size={10} /> Agent 6 · HR use only</div>
                </div>

                {loadingQuestions ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--outline)', fontSize: 12 }}>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading questions…
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {interviewQuestions.map((q: any, i: number) => {
                      const qText = typeof q === 'string' ? q : q.question || JSON.stringify(q);
                      const qType = q.type || (i < 3 ? 'Technical' : i < 6 ? 'Behavioral' : 'Gap-Focused');
                      return (
                        <div key={i} style={{
                          padding: '12px 14px', borderRadius: 9,
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.07)',
                        }}>
                          <p style={{ fontSize: 10, fontFamily: "'Geist Mono', monospace", fontWeight: 600, letterSpacing: '0.05em', color: 'var(--outline)', margin: '0 0 5px', textTransform: 'uppercase' }}>
                            Q{i + 1} · {qType}
                          </p>
                          <p style={{ fontSize: 13, color: 'var(--on-surface-muted)', lineHeight: 1.6, margin: 0 }}>{qText}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Shortlist Action */}
            {selectedApp.status === 'scored' && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--on-surface-muted)', margin: '0 0 12px', lineHeight: 1.6 }}>
                  Manually shortlist this candidate — Agent 5 will send a notification email to them.
                </p>
                <button
                  onClick={() => handleShortlist(selectedApp.id)}
                  disabled={shortlisting === selectedApp.id}
                  className="btn-primary"
                  style={{ fontSize: 13 }}
                >
                  {shortlisting === selectedApp.id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Star size={14} />}
                  {shortlisting === selectedApp.id ? 'Shortlisting…' : 'Shortlist & Notify (Agent 5)'}
                </button>
              </div>
            )}

            {/* Navigate to full pipeline for further actions */}
            {['shortlisted', 'interview_scheduled'].includes(selectedApp.status) && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--on-surface-muted)', margin: '0 0 10px' }}>
                  {selectedApp.status === 'shortlisted'
                    ? 'Schedule an interview or make a hiring decision in the Applications pipeline.'
                    : 'Make the final hiring decision in the Applications pipeline.'}
                </p>
                <button onClick={() => navigate('/applications')} className="btn-secondary" style={{ fontSize: 12 }}>
                  Open in Applications <ChevronRight size={12} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="glass-card-solid" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', textAlign: 'center' }}>
            <div className="empty-state-icon"><Users size={26} color="var(--primary)" /></div>
            <p style={{ fontWeight: 600, color: 'var(--on-surface-muted)', margin: '0 0 6px' }}>Select a candidate</p>
            <p style={{ fontSize: 12, color: 'var(--outline)', margin: 0 }}>
              Click a candidate on the left to see their AI score, reasoning, and interview questions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
