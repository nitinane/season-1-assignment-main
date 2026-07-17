/**
 * ApplicationsView — Pipeline management page for Agents 3 + 4
 *
 * Features:
 *   - List all applications with status badges and scores
 *   - Upload a resume file → Agent 3 ingest → Agent 4 score in one click
 *   - Poll a Google Drive folder → Agent 3 bulk ingest
 *   - Score individual unscored applications via Agent 4
 *   - Score all pending with one "Score All" button
 */

import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  Upload, FolderOpen, Loader2, RefreshCw, Zap,
  CheckCircle2, Clock, AlertCircle, ChevronDown, ChevronUp,
  FileText, Briefcase, Star, X,
} from 'lucide-react';
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

// ─── Status badge helpers ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  Application['status'],
  { label: string; className: string; icon: ReactNode }
> = {
  ingested: {
    label: 'Ingested',
    className: 'bg-blue-500/15 text-blue-300 border border-blue-500/20',
    icon: <Clock className="h-3 w-3" />,
  },
  scored: {
    label: 'Scored',
    className: 'bg-brand-500/15 text-brand-300 border border-brand-500/20',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  shortlisted: {
    label: 'Shortlisted',
    className: 'bg-green-500/15 text-green-300 border border-green-500/20',
    icon: <Star className="h-3 w-3" />,
  },
  interview_scheduled: {
    label: 'Interview',
    className: 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/20',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  hired: {
    label: 'Hired',
    className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-red-500/15 text-red-300 border border-red-500/20',
    icon: <X className="h-3 w-3" />,
  },
};

function scoreBadge(score: number | null) {
  if (score === null) return <span className="text-xs text-white/30">—</span>;
  const color =
    score >= 90 ? 'text-emerald-400' :
    score >= 70 ? 'text-brand-400' :
    score >= 50 ? 'text-yellow-400' :
    'text-red-400';
  return <span className={`font-mono font-bold text-sm ${color}`}>{score}</span>;
}

// ─── Score Breakdown Popover ──────────────────────────────────────────────────

function ScoreBreakdown({ reasoning }: { reasoning: string | null }) {
  const [open, setOpen] = useState(false);
  if (!reasoning) return null;

  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(reasoning); } catch { return null; }
  if (!parsed) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors"
      >
        Details {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-20 w-80 rounded-xl border border-white/10 bg-[#1a1a2e] p-4 shadow-xl text-xs space-y-2">
          <p className="font-medium text-white/70">{String(parsed['reasoning'] ?? '')}</p>
          {Boolean(parsed['advantage_notes']) && (
            <p className="text-brand-300">⭐ {String(parsed['advantage_notes'])}</p>
          )}
          {Array.isArray(parsed['matched_skills']) && (parsed['matched_skills'] as string[]).length > 0 && (
            <div>
              <span className="text-white/40">Matched:</span>{' '}
              <span className="text-green-300">{(parsed['matched_skills'] as string[]).join(', ')}</span>
            </div>
          )}
          {Array.isArray(parsed['missing_skills']) && (parsed['missing_skills'] as string[]).length > 0 && (
            <div>
              <span className="text-white/40">Missing:</span>{' '}
              <span className="text-red-300">{(parsed['missing_skills'] as string[]).join(', ')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Drive Folder Poll Panel ──────────────────────────────────────────────────

function DrivePollPanel({
  selectedJobId,
  onIngested,
}: {
  selectedJobId: string;
  onIngested: () => void;
}) {
  const [folderId, setFolderId] = useState('');
  const [polling, setPolling] = useState(false);

  const handlePoll = async () => {
    if (!folderId.trim()) return toast.error('Enter a Google Drive folder ID');
    if (!selectedJobId) return toast.error('Select a job first');
    setPolling(true);
    try {
      const token = await getGoogleToken();
      const summary = await ingestFromDriveFolder(folderId.trim(), selectedJobId, token);
      if (summary.ingested > 0) {
        toast.success(`Ingested ${summary.ingested} new resume(s) from Drive`);
        onIngested();
      } else if (summary.skipped > 0) {
        toast.success(`All ${summary.skipped} file(s) already ingested (no new files)`);
      } else {
        toast.error('No resume files found in that folder');
      }
      if (summary.errors.length > 0) {
        console.warn('[Drive Poll] Errors:', summary.errors);
        toast.error(`${summary.errors.length} file(s) failed — check console`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error('Drive poll failed: ' + msg);
    } finally {
      setPolling(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        id="drive-folder-id-input"
        className="input-field text-xs h-9 w-64"
        placeholder="Google Drive folder ID"
        value={folderId}
        onChange={(e) => setFolderId(e.target.value)}
      />
      <button
        id="drive-poll-btn"
        onClick={handlePoll}
        disabled={polling || !selectedJobId}
        className="btn-secondary h-9 text-xs px-3 flex items-center gap-1.5 shrink-0"
      >
        {polling ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderOpen className="h-3 w-3" />}
        {polling ? 'Polling…' : 'Poll Drive Folder'}
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ApplicationsView() {
  const [jobs, setJobs] = useState<JobRole[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState<string | null>(null); // applicationId being scored
  const [scoringAll, setScoringAll] = useState(false);
  const [showDrive, setShowDrive] = useState(false);

  // Load jobs on mount
  useEffect(() => {
    jobRoleService.getRoles().then(setJobs).catch(console.error);
  }, []);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await applicationService.getApplications(selectedJobId || undefined);
      setApplications(data);
    } catch (e) {
      toast.error('Failed to load applications');
    } finally {
      setLoading(false);
    }
  }, [selectedJobId]);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  // ── Upload drop zone ──
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!selectedJobId) {
        toast.error('Select a job role first');
        return;
      }
      for (const file of acceptedFiles) {
        const toastId = toast.loading(`Ingesting ${file.name}…`);
        try {
          // Agent 3: ingest
          const ingestResult = await ingestFromFile(file, selectedJobId);
          if (!ingestResult.success) {
            toast.error(ingestResult.error ?? 'Ingest failed', { id: toastId });
            continue;
          }
          toast.loading(`Scoring ${file.name}…`, { id: toastId });

          // Agent 4: score immediately
          const scoreResult = await scoreApplication(ingestResult.application!.id);
          if (scoreResult.success) {
            toast.success(
              `${file.name} → score ${scoreResult.data.match_score}/100`,
              { id: toastId }
            );
          } else {
            toast.success(`${file.name} ingested (scoring failed: ${scoreResult.error})`, { id: toastId });
          }
        } catch (e) {
          toast.error(String(e), { id: toastId });
        }
      }
      loadApplications();
    },
    [selectedJobId, loadApplications]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
    },
    multiple: true,
  });

  // ── Score single application ──
  const handleScoreOne = async (appId: string) => {
    setScoring(appId);
    try {
      const result = await scoreApplication(appId);
      if (result.success) {
        toast.success(`Score: ${result.data.match_score}/100`);
        loadApplications();
      } else {
        toast.error('Scoring failed: ' + result.error);
      }
    } finally {
      setScoring(null);
    }
  };

  // ── Score all pending ──
  const handleScoreAll = async () => {
    if (!selectedJobId) return toast.error('Select a job first');
    const pending = applications.filter((a) => a.status === 'ingested');
    if (pending.length === 0) return toast.error('No unscored applications');
    setScoringAll(true);
    try {
      const results = await scoreAllPendingForJob(selectedJobId);
      const passed = results.filter((r) => r.success).length;
      toast.success(`Scored ${passed}/${results.length} application(s)`);
      loadApplications();
    } finally {
      setScoringAll(false);
    }
  };

  const pendingCount = applications.filter((a) => a.status === 'ingested').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Applications Pipeline</h1>
          <p className="mt-1 text-sm text-white/50">
            Agent 3 ingests resumes · Agent 4 scores them against the JD
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadApplications} className="btn-secondary h-9 px-3" title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </button>
          {pendingCount > 0 && (
            <button
              id="score-all-btn"
              onClick={handleScoreAll}
              disabled={scoringAll}
              className="btn-primary h-9 px-4 text-sm flex items-center gap-2"
            >
              {scoringAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {scoringAll ? 'Scoring…' : `Score All (${pendingCount})`}
            </button>
          )}
        </div>
      </div>

      {/* Job selector + Drive poll */}
      <div className="glass-card-solid p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-white/40" />
            <select
              id="applications-job-select"
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="input-field h-9 text-sm w-56"
            >
              <option value="">All jobs</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setShowDrive(!showDrive)}
            className="btn-secondary h-9 text-xs px-3 flex items-center gap-1.5"
          >
            <FolderOpen className="h-3 w-3" />
            {showDrive ? 'Hide Drive' : 'Poll Drive Folder'}
          </button>
        </div>
        {showDrive && selectedJobId && (
          <DrivePollPanel selectedJobId={selectedJobId} onIngested={loadApplications} />
        )}
        {showDrive && !selectedJobId && (
          <p className="text-xs text-yellow-400/70">Select a job role to enable Drive polling.</p>
        )}
      </div>

      {/* Upload drop zone */}
      {selectedJobId && (
        <div
          {...getRootProps()}
          id="applications-dropzone"
          className={`rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 ${
            isDragActive
              ? 'border-brand-400/60 bg-brand-500/10'
              : 'border-white/10 bg-white/2 hover:border-white/20 hover:bg-white/4'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="mx-auto mb-3 h-8 w-8 text-white/30" />
          <p className="text-sm font-medium text-white/60">
            {isDragActive ? 'Drop resumes here…' : 'Drop PDF / DOCX resumes'}
          </p>
          <p className="mt-1 text-xs text-white/30">
            Agent 3 will ingest, then Agent 4 will score automatically
          </p>
        </div>
      )}

      {!selectedJobId && (
        <div className="flex items-center gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/8 p-4 text-sm text-yellow-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Select a job role above to upload resumes or poll Drive.
        </div>
      )}

      {/* Applications table */}
      <div className="glass-card-solid overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">
            Applications{' '}
            <span className="ml-1 rounded-full bg-white/8 px-2 py-0.5 text-xs text-white/50">
              {applications.length}
            </span>
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-white/30" />
          </div>
        ) : applications.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <FileText className="mb-3 h-10 w-10 text-white/20" />
            <p className="text-sm text-white/40">No applications yet</p>
            <p className="mt-1 text-xs text-white/25">
              Upload resumes above or poll a Drive folder
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/4">
            {applications.map((app) => {
              const statusCfg = STATUS_CONFIG[app.status];
              const isScoring = scoring === app.id;
              return (
                <div key={app.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/2 transition-colors">
                  {/* Candidate info */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{app.candidate_name}</p>
                    <p className="text-xs text-white/40 truncate">{app.candidate_email || '—'}</p>
                  </div>

                  {/* Score */}
                  <div className="w-12 text-center">{scoreBadge(app.score)}</div>

                  {/* Score breakdown */}
                  <div className="w-16">
                    <ScoreBreakdown reasoning={app.score_reasoning} />
                  </div>

                  {/* Status badge */}
                  <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${statusCfg.className}`}>
                    {statusCfg.icon}
                    {statusCfg.label}
                  </span>

                  {/* Score action */}
                  {app.status === 'ingested' && (
                    <button
                      id={`score-btn-${app.id}`}
                      onClick={() => handleScoreOne(app.id)}
                      disabled={isScoring || scoringAll}
                      className="btn-secondary h-7 px-3 text-xs flex items-center gap-1 shrink-0"
                    >
                      {isScoring
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Zap className="h-3 w-3" />}
                      {isScoring ? 'Scoring…' : 'Score'}
                    </button>
                  )}

                  {app.status !== 'ingested' && (
                    <div className="w-[72px]" /> /* spacer */
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
