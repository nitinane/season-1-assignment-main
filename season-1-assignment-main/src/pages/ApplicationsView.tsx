/**
 * ApplicationsView — Pipeline management (Agents 3, 4, 5, 7, 8)
 * All agent logic preserved; full UI redesign.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Upload, FolderOpen, Loader2, RefreshCw, Zap,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  FileText, Briefcase, Star, X, Calendar, Send, AlertTriangle, Mail,
  ChevronRight
} from 'lucide-react';
import { scheduleInterview } from '../agents/interviewSchedulerAgent';
import { notifyShortlistedCandidate } from '../agents/shortlistNotifierAgent';
import { draftDecisionEmail, sendDecisionEmail } from '../agents/hiringDecisionMailerAgent';
import { useDropzone } from 'react-dropzone';
import { applicationService } from '../services/applicationService';
import { ingestFromFile } from '../agents/applicationIngestorAgent';
import { scoreApplication, scoreAllPendingForJob } from '../agents/resumeScorerAgent';
import { jobRoleService } from '../services/jobRoleService';
import { getGoogleToken } from '../services/authService';
import { ingestFromDriveFolder } from '../agents/applicationIngestorAgent';
import type { Application } from '../agents/applicationIngestorAgent';
import type { JobRole } from '../types';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

// ─── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<Application['status'], string> = {
  ingested:            'Ingested',
  scored:              'Scored',
  shortlisted:         'Shortlisted',
  interview_scheduled: 'Interview',
  hired:               'Hired',
  rejected:            'Rejected',
};

function PipelineBadge({ status }: { status: Application['status'] }) {
  return (
    <span className={`pipeline-badge status-${status}`} style={{ fontSize: 10.5 }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function ScorePill({ score }: { score: number | null }) {
  if (score === null) return <span style={{ color: 'var(--outline)', fontSize: 12, fontFamily: "'Geist Mono', monospace" }}>—</span>;
  const cls = score >= 80 ? 'score-high' : score >= 60 ? 'score-mid' : 'score-low';
  return <span className={`score-badge ${cls}`} style={{ fontSize: 12 }}>{score}</span>;
}

// ─── Score Breakdown Popover ────────────────────────────────────────────────────

function ScoreBreakdown({ reasoning }: { reasoning: string | null }) {
  const [open, setOpen] = useState(false);
  if (!reasoning) return null;
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(reasoning); } catch { return null; }
  if (!parsed) return null;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--outline)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        Details {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>
      {open && (
        <div style={{
          position: 'absolute', left: 0, top: 24, zIndex: 20,
          width: 320, borderRadius: 12, padding: '14px 16px',
          background: 'var(--surface-high)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column', gap: 8,
          fontSize: 12,
        }}>
          <p style={{ color: 'var(--on-surface-muted)', margin: 0, lineHeight: 1.6 }}>{String(parsed['reasoning'] ?? '')}</p>
          {Boolean(parsed['advantage_notes']) && (
            <p style={{ color: 'var(--tertiary)', margin: 0 }}>⭐ {String(parsed['advantage_notes'])}</p>
          )}
          {Array.isArray(parsed['matched_skills']) && (parsed['matched_skills'] as string[]).length > 0 && (
            <div>
              <span style={{ color: 'var(--outline)' }}>Matched: </span>
              <span style={{ color: '#3de8a8' }}>{(parsed['matched_skills'] as string[]).join(', ')}</span>
            </div>
          )}
          {Array.isArray(parsed['missing_skills']) && (parsed['missing_skills'] as string[]).length > 0 && (
            <div>
              <span style={{ color: 'var(--outline)' }}>Missing: </span>
              <span style={{ color: '#ff7a93' }}>{(parsed['missing_skills'] as string[]).join(', ')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Drive Poll Panel ────────────────────────────────────────────────────────────

function DrivePollPanel({ selectedJobId, onIngested }: { selectedJobId: string; onIngested: () => void }) {
  const [folderId, setFolderId] = useState(import.meta.env.VITE_DRIVE_RESUME_FOLDER_ID || '');
  const [polling, setPolling] = useState(false);

  const handlePoll = async () => {
    if (!folderId.trim()) return toast.error('Enter a Google Drive folder ID');
    if (!selectedJobId)   return toast.error('Select a job first');
    setPolling(true);
    try {
      const token = await getGoogleToken();
      const summary = await ingestFromDriveFolder(folderId.trim(), selectedJobId, token);
      if (summary.ingested > 0) {
        toast.success(`Ingested ${summary.ingested} new resume(s) from Drive`);
        onIngested();
      } else if (summary.skipped > 0) {
        toast.success(`All ${summary.skipped} file(s) already ingested`);
      } else {
        toast.error('No resume files found in that folder');
      }
      if (summary.errors.length > 0) {
        summary.errors.forEach((err) => toast.error(err, { duration: 6000 }));
      }
    } catch (e) {
      toast.error('Drive poll failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setPolling(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <input
        id="drive-folder-id-input"
        className="input-field"
        style={{ height: 36, fontSize: 12, flex: 1 }}
        placeholder="Google Drive folder ID"
        value={folderId}
        onChange={(e) => setFolderId(e.target.value)}
      />
      <button
        id="drive-poll-btn"
        onClick={handlePoll}
        disabled={polling || !selectedJobId}
        className="btn-secondary"
        style={{ height: 36, fontSize: 12, flexShrink: 0 }}
      >
        {polling ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <FolderOpen size={13} />}
        {polling ? 'Polling…' : 'Poll Drive'}
      </button>
    </div>
  );
}

// ─── Candidate Detail Drawer ─────────────────────────────────────────────────────

function CandidateDrawer({
  app,
  onClose,
  onShortlist,
  shortlistingLoading,
  schedulingAppId, setSchedulingAppId,
  scheduleDateTime, setScheduleDateTime,
  submittingSchedule,
  onConfirmSchedule,
  decisionAppId, setDecisionAppId,
  decisionResult, setDecisionResult,
  decisionNotes, setDecisionNotes,
  draftedEmail, setDraftedEmail,
  draftingEmailLoading,
  sendingDecisionLoading,
  onDraftDecision,
  onSendDecision,
  interviewQuestions,
  loadingQuestions,
}: {
  app: Application;
  onClose: () => void;
  onShortlist: (id: string) => void;
  shortlistingLoading: boolean;
  schedulingAppId: string | null;
  setSchedulingAppId: (v: string | null) => void;
  scheduleDateTime: string;
  setScheduleDateTime: (v: string) => void;
  submittingSchedule: boolean;
  onConfirmSchedule: (id: string) => void;
  decisionAppId: string | null;
  setDecisionAppId: (v: string | null) => void;
  decisionResult: 'pass' | 'fail';
  setDecisionResult: (v: 'pass' | 'fail') => void;
  decisionNotes: string;
  setDecisionNotes: (v: string) => void;
  draftedEmail: { subject: string; body: string } | null;
  setDraftedEmail: (v: { subject: string; body: string } | null) => void;
  draftingEmailLoading: boolean;
  sendingDecisionLoading: boolean;
  onDraftDecision: (id: string) => void;
  onSendDecision: (id: string) => void;
  interviewQuestions: any[];
  loadingQuestions: boolean;
}) {
  let reasoning: Record<string, unknown> | null = null;
  try { if (app.score_reasoning) reasoning = JSON.parse(app.score_reasoning); } catch {}

  const placeholderText = '[[TO BE FILLED BY HR BEFORE SENDING]]';
  const sendEnabled = draftedEmail && !draftedEmail.body.includes(placeholderText);

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(91,94,244,0.2) 0%, rgba(159,119,247,0.15) 100%)',
              border: '1px solid rgba(91,94,244,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 17, fontWeight: 700, color: 'var(--primary)',
            }}>
              {(app.candidate_name || '?').charAt(0)}
            </div>
            <div>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--on-surface)', margin: '0 0 4px' }}>
                {app.candidate_name || 'Unknown Candidate'}
              </p>
              <p style={{ fontSize: 12, color: 'var(--outline)', margin: 0 }}>{app.candidate_email || '—'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--outline)', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Score + Status row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ScorePill score={app.score} />
            <PipelineBadge status={app.status} />
            {app.score !== null && (
              <div style={{ flex: 1 }}>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${app.score}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* AI Score reasoning */}
          {reasoning && (
            <div style={{
              padding: '14px 16px', borderRadius: 10,
              background: 'rgba(91,94,244,0.06)', border: '1px solid rgba(91,94,244,0.15)',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div className="ai-draft-banner" style={{ alignSelf: 'flex-start' }}>
                <Zap size={10} />
                Agent 4 · AI Score Reasoning
              </div>
              {Boolean(reasoning['reasoning']) && (
                <p style={{ fontSize: 12.5, color: 'var(--on-surface-muted)', lineHeight: 1.7, margin: 0 }}>
                  {String(reasoning['reasoning'])}
                </p>
              )}
              {Boolean(reasoning['advantage_notes']) && (
                <p style={{ fontSize: 12, color: 'var(--tertiary)', margin: 0 }}>
                  ⭐ {String(reasoning['advantage_notes'])}
                </p>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Array.isArray(reasoning['matched_skills']) && (reasoning['matched_skills'] as string[]).map((s: string, i: number) => (
                  <span key={i} className="badge badge-green" style={{ fontSize: 10 }}>✓ {s}</span>
                ))}
                {Array.isArray(reasoning['missing_skills']) && (reasoning['missing_skills'] as string[]).map((s: string, i: number) => (
                  <span key={i} className="badge badge-red" style={{ fontSize: 10 }}>✗ {s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Interview Questions (§5.3 — HR only, never emailed) */}
          {(interviewQuestions.length > 0 || loadingQuestions) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>Interview Questions</p>
                <div className="ai-draft-banner" style={{ fontSize: 10 }}>
                  Agent 6 · HR use only
                </div>
              </div>
              {loadingQuestions ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--outline)', fontSize: 12 }}>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading questions…
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {interviewQuestions.map((q: any, i: number) => (
                    <div key={i} style={{
                      padding: '10px 14px', borderRadius: 9,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      fontSize: 12.5, color: 'var(--on-surface-muted)', lineHeight: 1.6,
                    }}>
                      <span style={{ color: 'var(--outline)', fontFamily: "'Geist Mono', monospace", fontSize: 10, marginRight: 6 }}>Q{i + 1}</span>
                      {typeof q === 'string' ? q : q.question || JSON.stringify(q)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Actions ── */}

          {/* Shortlist (§5.3) */}
          {(app.status === 'scored') && (
            <div style={{
              padding: '14px 16px', borderRadius: 10,
              background: 'rgba(61,232,168,0.06)', border: '1px solid rgba(61,232,168,0.15)',
            }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--tertiary)', margin: '0 0 10px' }}>
                Shortlist this candidate?
              </p>
              <p style={{ fontSize: 12, color: 'var(--on-surface-muted)', margin: '0 0 12px', lineHeight: 1.6 }}>
                Agent 5 will send a shortlist notification email. You remain in control of the timing.
              </p>
              <button
                onClick={() => onShortlist(app.id)}
                disabled={shortlistingLoading}
                className="btn-primary"
                style={{ fontSize: 12 }}
              >
                {shortlistingLoading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Star size={13} />}
                {shortlistingLoading ? 'Shortlisting…' : 'Shortlist & Notify (Agent 5)'}
              </button>
            </div>
          )}

          {/* Interview Scheduling (§5.4) */}
          {app.status === 'shortlisted' && (
            <div style={{
              padding: '14px 16px', borderRadius: 10,
              background: 'rgba(247,192,64,0.06)', border: '1px solid rgba(247,192,64,0.15)',
            }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber)', margin: '0 0 10px' }}>
                Schedule Interview
              </p>
              {schedulingAppId === app.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label className="label">Date & Time</label>
                    <input
                      type="datetime-local"
                      className="input-field color-scheme-dark"
                      style={{ fontSize: 13 }}
                      value={scheduleDateTime}
                      onChange={(e) => setScheduleDateTime(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => onConfirmSchedule(app.id)}
                      disabled={submittingSchedule || !scheduleDateTime}
                      className="btn-primary"
                      style={{ fontSize: 12, flex: 1, justifyContent: 'center' }}
                    >
                      {submittingSchedule ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Mail size={13} />}
                      {submittingSchedule ? 'Scheduling…' : 'Confirm & Send Invite (Agent 7)'}
                    </button>
                    <button onClick={() => { setSchedulingAppId(null); setScheduleDateTime(''); }} className="btn-secondary" style={{ fontSize: 12 }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setSchedulingAppId(app.id)}
                  className="btn-secondary"
                  style={{ fontSize: 12 }}
                >
                  <Calendar size={13} /> Set Date & Time
                </button>
              )}
            </div>
          )}

          {/* Hiring Decision (§5.5) */}
          {app.status === 'interview_scheduled' && (
            <div style={{
              padding: '16px 18px', borderRadius: 10,
              background: 'rgba(91,94,244,0.06)', border: '1px solid rgba(91,94,244,0.15)',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface)', margin: '0 0 4px' }}>
                  Hiring Decision
                </p>
                <p style={{ fontSize: 11.5, color: 'var(--outline)', margin: 0 }}>
                  Agent 8 drafts the email. You must edit the compensation placeholder before sending.
                </p>
              </div>

              {decisionAppId !== app.id ? (
                <button onClick={() => { setDecisionAppId(app.id); setDraftedEmail(null); }} className="btn-secondary" style={{ fontSize: 12 }}>
                  <CheckCircle2 size={13} /> Make Hiring Decision
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Pass / Fail */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {(['pass', 'fail'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => { setDecisionResult(r); setDraftedEmail(null); }}
                        style={{
                          padding: '10px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          background: decisionResult === r
                            ? r === 'pass' ? 'rgba(61,232,168,0.15)' : 'rgba(255,122,147,0.15)'
                            : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${decisionResult === r
                            ? r === 'pass' ? 'rgba(61,232,168,0.4)' : 'rgba(255,122,147,0.4)'
                            : 'rgba(255,255,255,0.09)'}`,
                          color: decisionResult === r
                            ? r === 'pass' ? '#3de8a8' : '#ff7a93'
                            : 'var(--on-surface-muted)',
                          transition: 'all 0.2s',
                        }}
                      >
                        {r === 'pass' ? '✓ Pass / Offer' : '✗ Reject'}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="label">Interview Notes (optional)</label>
                    <textarea
                      className="input-field"
                      style={{ minHeight: 70, fontSize: 12 }}
                      placeholder="Feedback, strengths, concerns…"
                      value={decisionNotes}
                      onChange={(e) => setDecisionNotes(e.target.value)}
                    />
                  </div>

                  <button
                    onClick={() => onDraftDecision(app.id)}
                    disabled={draftingEmailLoading}
                    className="btn-secondary"
                    style={{ fontSize: 12, justifyContent: 'center' }}
                  >
                    {draftingEmailLoading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={13} />}
                    {draftingEmailLoading ? 'Drafting email…' : 'Draft Email with AI (Agent 8)'}
                  </button>

                  {/* Email draft editor */}
                  {draftedEmail && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div className="ai-draft-banner">
                        <AlertTriangle size={11} />
                        AI Draft — edit the placeholder before sending
                      </div>

                      <div>
                        <label className="label">Subject</label>
                        <input
                          className="input-field"
                          style={{ fontSize: 12 }}
                          value={draftedEmail.subject}
                          onChange={(e) => setDraftedEmail({ ...draftedEmail, subject: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="label">Body</label>
                        <textarea
                          className="input-field"
                          style={{ minHeight: 180, fontSize: 12, lineHeight: 1.7, fontFamily: 'Inter, sans-serif' }}
                          value={draftedEmail.body}
                          onChange={(e) => setDraftedEmail({ ...draftedEmail, body: e.target.value })}
                        />
                      </div>

                      {/* Hard constraint: send disabled until placeholder edited */}
                      {draftedEmail.body.includes(placeholderText) && (
                        <div style={{
                          padding: '12px 14px', borderRadius: 9,
                          background: 'rgba(255,122,147,0.08)', border: '1px solid rgba(255,122,147,0.2)',
                          display: 'flex', alignItems: 'flex-start', gap: 8,
                        }}>
                          <AlertTriangle size={14} color="var(--error)" style={{ flexShrink: 0, marginTop: 1 }} />
                          <p style={{ fontSize: 12, color: 'var(--error)', margin: 0, lineHeight: 1.5 }}>
                            You must replace the <code style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10 }}>[[TO BE FILLED BY HR BEFORE SENDING]]</code> placeholder in the email body before you can send.
                          </p>
                        </div>
                      )}

                      <button
                        id="send-decision-btn"
                        onClick={() => onSendDecision(app.id)}
                        disabled={!sendEnabled || sendingDecisionLoading}
                        className="btn-primary"
                        style={{
                          justifyContent: 'center', fontSize: 12,
                          opacity: sendEnabled ? 1 : 0.4,
                          cursor: sendEnabled ? 'pointer' : 'not-allowed',
                        }}
                        title={sendEnabled ? 'Send decision email' : 'Edit the placeholder first'}
                      >
                        {sendingDecisionLoading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />}
                        {sendingDecisionLoading ? 'Sending…' : 'Send Decision Email'}
                      </button>

                      <button onClick={() => { setDecisionAppId(null); setDraftedEmail(null); }} className="btn-ghost" style={{ fontSize: 12 }}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────────

export default function ApplicationsView() {
  const [jobs, setJobs] = useState<JobRole[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState<string | null>(null);
  const [scoringAll, setScoringAll] = useState(false);
  const [showDrive, setShowDrive] = useState(false);
  const [sortBy, setSortBy] = useState<'score_desc' | 'score_asc' | 'date_desc' | 'date_asc'>('score_desc');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Candidate detail drawer
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [interviewQuestions, setInterviewQuestions] = useState<any[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [shortlistingLoading, setShortlistingLoading] = useState(false);

  // Agent 7 scheduling
  const [schedulingAppId, setSchedulingAppId] = useState<string | null>(null);
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [submittingSchedule, setSubmittingSchedule] = useState(false);

  // Agent 8 decision
  const [decisionAppId, setDecisionAppId] = useState<string | null>(null);
  const [decisionResult, setDecisionResult] = useState<'pass' | 'fail'>('pass');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [draftedEmail, setDraftedEmail] = useState<{ subject: string; body: string } | null>(null);
  const [draftingEmailLoading, setDraftingEmailLoading] = useState(false);
  const [sendingDecisionLoading, setSendingDecisionLoading] = useState(false);

  const [seedingLoading, setSeedingLoading] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      const fetchedJobs = await jobRoleService.getRoles();
      setJobs(fetchedJobs);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const handleLoadDemo = async () => {
    setSeedingLoading(true);
    const toastId = toast.loading('Loading demo data…');
    try {
      const { seedDemoData } = await import('../services/demoService');
      const res = await seedDemoData();
      toast.success('Demo dataset loaded!', { id: toastId });
      await loadJobs();
      if (res.jobRoleId) setSelectedJobId(res.jobRoleId);
    } catch (e: any) {
      toast.error(`Seeding failed: ${e.message}`, { id: toastId });
    } finally {
      setSeedingLoading(false);
    }
  };

  const loadApplications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await applicationService.getApplications(selectedJobId || undefined);
      setApplications(data);
    } catch { toast.error('Failed to load applications'); }
    finally { setLoading(false); }
  }, [selectedJobId]);

  const refreshDetail = useCallback(async (appId: string) => {
    try {
      const { data } = await supabase.from('applications').select('*').eq('id', appId).single();
      if (data) {
        const updated = data as Application;
        setSelectedApp(updated);
        setApplications((prev) => prev.map((a) => (a.id === appId ? updated : a)));
        const { data: interviewData } = await supabase.from('interviews').select('questions').eq('application_id', appId).maybeSingle();
        if (interviewData?.questions) setInterviewQuestions(interviewData.questions);
      }
    } catch (e) { console.error(e); }
  }, []);

  const handleOpenDetail = async (app: Application) => {
    setSelectedApp(app);
    setLoadingQuestions(true);
    setInterviewQuestions([]);
    setSchedulingAppId(null);
    setDecisionAppId(null);
    setDraftedEmail(null);
    try {
      const { data } = await supabase.from('interviews').select('questions').eq('application_id', app.id).maybeSingle();
      if (data?.questions) setInterviewQuestions(data.questions);
    } catch { /* ignore */ }
    finally { setLoadingQuestions(false); }
  };

  useEffect(() => { loadApplications(); }, [loadApplications]);

  // Upload drop zone (Agent 3 + 4)
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!selectedJobId) { toast.error('Select a job role first'); return; }
    for (const file of acceptedFiles) {
      const toastId = toast.loading(`Ingesting ${file.name}…`);
      try {
        const ingestResult = await ingestFromFile(file, selectedJobId);
        if (!ingestResult.success) { toast.error(ingestResult.error ?? 'Ingest failed', { id: toastId }); continue; }
        toast.loading(`Scoring ${file.name}…`, { id: toastId });
        const scoreResult = await scoreApplication(ingestResult.application!.id);
        if (scoreResult.success) {
          toast.success(`${file.name} → score ${scoreResult.data.match_score}/100`, { id: toastId });
        } else {
          toast.success(`${file.name} ingested (scoring failed: ${scoreResult.error})`, { id: toastId });
        }
      } catch (e) { toast.error(String(e), { id: toastId }); }
    }
    loadApplications();
  }, [selectedJobId, loadApplications]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
    },
    multiple: true,
  });

  const handleScoreOne = async (appId: string) => {
    setScoring(appId);
    try {
      const result = await scoreApplication(appId);
      if (result.success) {
        toast.success(`Score: ${result.data.match_score}/100`);
        loadApplications();
        if (selectedApp?.id === appId) refreshDetail(appId);
      } else {
        toast.error('Scoring failed: ' + result.error);
      }
    } finally { setScoring(null); }
  };

  const handleShortlistCandidate = async (appId: string) => {
    setShortlistingLoading(true);
    const toastId = toast.loading('Shortlisting & sending notification email…');
    try {
      const res = await notifyShortlistedCandidate(appId);
      if (res.success) {
        toast.success('Candidate shortlisted and email sent!', { id: toastId });
        loadApplications();
        refreshDetail(appId);
      } else {
        toast.error(`Shortlisting failed: ${res.error}`, { id: toastId });
      }
    } catch (e: any) {
      toast.error(`Error: ${e.message}`, { id: toastId });
    } finally {
      setShortlistingLoading(false);
    }
  };

  const handleConfirmSchedule = async (appId: string) => {
    if (!scheduleDateTime) return toast.error('Select a date and time');
    setSubmittingSchedule(true);
    const toastId = toast.loading('Scheduling interview & sending invitation…');
    try {
      const res = await scheduleInterview(appId, scheduleDateTime);
      if (res.success) {
        toast.success('Interview scheduled and invite sent!', { id: toastId });
        setSchedulingAppId(null); setScheduleDateTime('');
        loadApplications(); refreshDetail(appId);
      } else { toast.error(`Scheduling failed: ${res.error}`, { id: toastId }); }
    } catch (e: any) { toast.error(`Error: ${e.message}`, { id: toastId }); }
    finally { setSubmittingSchedule(false); }
  };

  const handleDraftDecision = async (appId: string) => {
    setDraftingEmailLoading(true); setDraftedEmail(null);
    try {
      const res = await draftDecisionEmail(appId, decisionResult, decisionNotes);
      if (res.success && res.email) { setDraftedEmail(res.email); toast.success('Draft email ready — review before sending!'); }
      else { toast.error(`Drafting failed: ${res.error}`); }
    } catch (e: any) { toast.error(`Error: ${e.message}`); }
    finally { setDraftingEmailLoading(false); }
  };

  const handleSendDecision = async (appId: string) => {
    if (!draftedEmail) return toast.error('Draft the email first');
    setSendingDecisionLoading(true);
    const toastId = toast.loading('Sending decision email…');
    try {
      const res = await sendDecisionEmail(appId, decisionResult, draftedEmail.subject, draftedEmail.body);
      if (res.success) {
        toast.success(`Decision sent! Candidate marked as ${decisionResult === 'pass' ? 'hired' : 'rejected'}.`, { id: toastId });
        setDecisionAppId(null); setDecisionNotes(''); setDraftedEmail(null);
        loadApplications(); refreshDetail(appId);
      } else { toast.error(`Sending failed: ${res.error}`, { id: toastId }); }
    } catch (e: any) { toast.error(`Error: ${e.message}`, { id: toastId }); }
    finally { setSendingDecisionLoading(false); }
  };

  const handleScoreAll = async () => {
    if (!selectedJobId) return toast.error('Select a job first');
    const pending = applications.filter((a) => a.status === 'ingested');
    if (pending.length === 0) return toast.error('No unscored applications');
    setScoringAll(true);
    try {
      const results = await scoreAllPendingForJob(selectedJobId);
      const passed = results.filter((r) => r.success).length;
      toast.success(`Scored ${passed}/${results.length} applications`);
      loadApplications();
    } finally { setScoringAll(false); }
  };

  const pendingCount = applications.filter((a) => a.status === 'ingested').length;

  const filteredAndSortedApps = applications
    .filter((app) => filterStatus === 'all' ? true : app.status === filterStatus)
    .sort((a, b) => {
      if (sortBy === 'score_desc') return (b.score ?? 0) - (a.score ?? 0);
      if (sortBy === 'score_asc')  return (a.score ?? 0) - (b.score ?? 0);
      if (sortBy === 'date_desc')  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === 'date_asc')   return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return 0;
    });

  const StatusPill = ({ status }: { status: string }) => {
    const counts: Record<string, number> = {};
    applications.forEach(a => { counts[a.status] = (counts[a.status] || 0) + 1; });
    const count = counts[status] || 0;
    const isActive = filterStatus === status;
    return (
      <button
        onClick={() => setFilterStatus(isActive ? 'all' : status)}
        style={{
          padding: '5px 12px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
          cursor: 'pointer', transition: 'all 0.15s',
          background: isActive ? 'rgba(91,94,244,0.15)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${isActive ? 'rgba(91,94,244,0.35)' : 'rgba(255,255,255,0.08)'}`,
          color: isActive ? 'var(--primary)' : 'var(--outline)',
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        {STATUS_LABELS[status as Application['status']] || status}
        {count > 0 && (
          <span style={{
            fontSize: 10, padding: '1px 5px', borderRadius: 9999,
            background: isActive ? 'rgba(91,94,244,0.2)' : 'rgba(255,255,255,0.07)',
            color: isActive ? 'var(--primary)' : 'var(--outline)',
          }}>
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--on-surface)', letterSpacing: '-0.02em', margin: 0 }}>
            Applications Pipeline
          </h1>
          <p style={{ fontSize: 13, color: 'var(--on-surface-muted)', marginTop: 3 }}>
            {applications.length} total · Agent 3 ingests · Agent 4 scores
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => loadApplications()} className="btn-secondary" style={{ padding: '8px 12px', fontSize: 12 }}>
            <RefreshCw size={13} />
          </button>
          {pendingCount > 0 && (
            <button id="score-all-btn" onClick={handleScoreAll} disabled={scoringAll} className="btn-primary" style={{ fontSize: 12 }}>
              {scoringAll ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={13} />}
              {scoringAll ? 'Scoring…' : `Score All (${pendingCount})`}
            </button>
          )}
        </div>
      </div>

      {/* ── Empty / Demo State ─────────────────────────────── */}
      {jobs.length === 0 && (
        <div style={{
          padding: '20px 22px', borderRadius: 14,
          background: 'rgba(91,94,244,0.07)', border: '1px solid rgba(91,94,244,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <div>
            <p style={{ fontWeight: 700, color: 'var(--on-surface)', margin: '0 0 4px' }}>🚀 No job roles yet</p>
            <p style={{ fontSize: 12, color: 'var(--on-surface-muted)', margin: 0, maxWidth: 480 }}>
              Load the demo dataset (Senior Full Stack Engineer + 4 candidates) to immediately try AI screening, shortlisting and interview scheduling.
            </p>
          </div>
          <button onClick={handleLoadDemo} disabled={seedingLoading} className="btn-primary" style={{ flexShrink: 0, fontSize: 12 }}>
            {seedingLoading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={13} />}
            {seedingLoading ? 'Loading…' : 'Load Demo Data'}
          </button>
        </div>
      )}

      {/* ── Filters + Ingestion Bar ─────────────────────────── */}
      <div className="glass-card-solid" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          {/* Job selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Briefcase size={14} color="var(--outline)" />
            <select
              id="applications-job-select"
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="input-field"
              style={{ height: 34, fontSize: 12, width: 190 }}
            >
              <option value="">All job roles</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <select
            id="sort-by-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="input-field"
            style={{ height: 34, fontSize: 12, width: 165 }}
          >
            <option value="score_desc">Score: High → Low</option>
            <option value="score_asc">Score: Low → High</option>
            <option value="date_desc">Newest First</option>
            <option value="date_asc">Oldest First</option>
          </select>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowDrive(!showDrive)}
              className={showDrive ? 'btn-primary' : 'btn-secondary'}
              style={{ fontSize: 12, padding: '6px 12px' }}
            >
              <FolderOpen size={13} />
              {showDrive ? 'Hide Drive' : 'Drive Folder'}
            </button>
          </div>
        </div>

        {/* Status filter pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => setFilterStatus('all')}
            style={{
              padding: '5px 12px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
              background: filterStatus === 'all' ? 'rgba(91,94,244,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${filterStatus === 'all' ? 'rgba(91,94,244,0.35)' : 'rgba(255,255,255,0.08)'}`,
              color: filterStatus === 'all' ? 'var(--primary)' : 'var(--outline)',
            }}
          >
            All ({applications.length})
          </button>
          {(['ingested','scored','shortlisted','interview_scheduled','hired','rejected'] as const).map(s => (
            <StatusPill key={s} status={s} />
          ))}
        </div>

        {/* Drive panel */}
        {showDrive && !selectedJobId && (
          <p style={{ fontSize: 12, color: 'var(--amber)', margin: 0 }}>⚠ Select a job role to enable Drive polling.</p>
        )}
        {showDrive && selectedJobId && (
          <DrivePollPanel selectedJobId={selectedJobId} onIngested={loadApplications} />
        )}
      </div>

      {/* ── Upload Drop Zone ─────────────────────────────────── */}
      {selectedJobId && (
        <div
          {...getRootProps()}
          id="applications-dropzone"
          style={{
            borderRadius: 12, border: `2px dashed ${isDragActive ? 'rgba(91,94,244,0.6)' : 'rgba(255,255,255,0.1)'}`,
            padding: '28px 24px', textAlign: 'center', cursor: 'pointer',
            background: isDragActive ? 'rgba(91,94,244,0.07)' : 'rgba(255,255,255,0.02)',
            transition: 'all 0.2s',
          }}
        >
          <input {...getInputProps()} />
          <Upload size={28} color="var(--outline)" style={{ display: 'block', margin: '0 auto 10px' }} />
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--on-surface-muted)', margin: '0 0 4px' }}>
            {isDragActive ? 'Drop resumes here…' : 'Drop PDF / DOCX resumes to ingest'}
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--outline)', margin: 0 }}>
            Agent 3 ingests · Agent 4 scores automatically
          </p>
        </div>
      )}

      {!selectedJobId && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(247,192,64,0.07)', border: '1px solid rgba(247,192,64,0.18)',
          fontSize: 12, color: '#f7c040',
        }}>
          <AlertCircle size={14} />
          Select a job role above to enable resume upload and Drive polling.
        </div>
      )}

      {/* ── Applications Table ─────────────────────────────── */}
      <div className="glass-card-solid" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>
            Candidates
            <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'rgba(255,255,255,0.07)', color: 'var(--outline)', fontWeight: 600 }}>
              {filteredAndSortedApps.length}
            </span>
          </p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 56 }}>
            <Loader2 size={24} color="var(--outline)" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : filteredAndSortedApps.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><FileText size={26} color="var(--outline)" /></div>
            <p style={{ fontWeight: 600, color: 'var(--on-surface-muted)', margin: '0 0 6px' }}>No applications yet</p>
            <p style={{ fontSize: 12, color: 'var(--outline)', margin: 0 }}>Upload resumes above or poll a Drive folder</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Score</th>
                <th>Status</th>
                <th>Ingested</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedApps.map((app) => {
                const isScoring = scoring === app.id;
                return (
                  <tr key={app.id} onClick={() => handleOpenDetail(app)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                          background: 'linear-gradient(135deg, rgba(91,94,244,0.15) 0%, rgba(159,119,247,0.1) 100%)',
                          border: '1px solid rgba(91,94,244,0.2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700, color: 'var(--primary)',
                        }}>
                          {(app.candidate_name || '?').charAt(0)}
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>
                            {app.candidate_name || 'Unknown'}
                          </p>
                          <p style={{ fontSize: 11, color: 'var(--outline)', margin: 0 }}>
                            {app.candidate_email || '—'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                        <ScorePill score={app.score} />
                        <ScoreBreakdown reasoning={app.score_reasoning} />
                      </div>
                    </td>
                    <td><PipelineBadge status={app.status} /></td>
                    <td>
                      <span style={{ fontSize: 12, color: 'var(--outline)' }}>
                        {new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        {app.status === 'ingested' && (
                          <button
                            onClick={() => handleScoreOne(app.id)}
                            disabled={isScoring}
                            className="btn-secondary"
                            style={{ padding: '5px 10px', fontSize: 11 }}
                          >
                            {isScoring ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={11} />}
                            {isScoring ? 'Scoring…' : 'Score'}
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenDetail(app)}
                          className="btn-ghost"
                          style={{ padding: '5px 10px', fontSize: 11 }}
                        >
                          View <ChevronRight size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Candidate Detail Drawer ─────────────────────────── */}
      {selectedApp && (
        <CandidateDrawer
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
          onShortlist={handleShortlistCandidate}
          shortlistingLoading={shortlistingLoading}
          schedulingAppId={schedulingAppId}
          setSchedulingAppId={setSchedulingAppId}
          scheduleDateTime={scheduleDateTime}
          setScheduleDateTime={setScheduleDateTime}
          submittingSchedule={submittingSchedule}
          onConfirmSchedule={handleConfirmSchedule}
          decisionAppId={decisionAppId}
          setDecisionAppId={setDecisionAppId}
          decisionResult={decisionResult}
          setDecisionResult={setDecisionResult}
          decisionNotes={decisionNotes}
          setDecisionNotes={setDecisionNotes}
          draftedEmail={draftedEmail}
          setDraftedEmail={setDraftedEmail}
          draftingEmailLoading={draftingEmailLoading}
          sendingDecisionLoading={sendingDecisionLoading}
          onDraftDecision={handleDraftDecision}
          onSendDecision={handleSendDecision}
          interviewQuestions={interviewQuestions}
          loadingQuestions={loadingQuestions}
        />
      )}
    </div>
  );
}
