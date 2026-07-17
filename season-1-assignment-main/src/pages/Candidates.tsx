import { useState, useEffect } from 'react';
import {
  Mail, Loader2, CheckCircle,
  ChevronDown, ChevronUp, Send, Brain,
  MessageSquare, Zap, RefreshCw
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useJobStore } from '../store/jobStore';
import { useCandidateStore } from '../store/candidateStore';
import { fetchEmails, getSenderEmail, getResumeAttachments, buildResumeQuery } from '../services/gmailService';
import { sendShortlistEmail } from '../services/mailService';
import { parseResume } from '../lib/parser';
import { supabase, getCurrentUser } from '../lib/supabase';
import {
  calculateLocalScore,
  bulkScoreCandidates,
  generateInterviewQuestions
} from '../lib/groq';
import type { Candidate, ShortlistedCandidate, InterviewQuestion } from '../types';
import { format, subDays } from 'date-fns';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';

const normalizeList = (value: string[] | string | null | undefined): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value.split(',').map(item => item.trim()).filter(Boolean);
};

const extractName = (text: string) => {
  // 1. Regex: Name before "Email:"
  const emailPrefixMatch = text.match(/([^\n\r]+)(?=\s*Email:)/i);
  if (emailPrefixMatch && emailPrefixMatch[1].trim().length > 2) {
    return emailPrefixMatch[1].trim();
  }

  // 2. Regex: Explicit Name labels
  const labelMatch = text.match(/(?:Full Name|Name|Candidate Name):\s*([^\n\r]+)/i);
  if (labelMatch) return labelMatch[1].trim();

  // 3. First valid line strategy
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
  for (const line of lines) {
    if (!line.includes('@') && !line.includes('http') && !/^\d+$/.test(line) && !line.toLowerCase().includes('resume')) {
      return line;
    }
  }
  return 'Unknown Candidate';
};

/**
 * Local fallback ranking if AI fails. (Task 3 & Schema FIX)
 */
const getFallbackCandidates = (allCandidates: any[], jobId: string): ShortlistedCandidate[] => {
  return allCandidates.slice(0, 10).map((candidate, index) => ({
    id: candidate.id || crypto.randomUUID(),
    candidate_id: candidate.id || crypto.randomUUID(),
    job_id: jobId,
    rank: index + 1,
    score: candidate.localScore || 0,
    reason: "Selected via smart local ranking (Fallback).",
    summary: candidate.summary || "Fallback candidate info.",
    strengths: ["Strong local score"],
    weaknesses: [],
    candidate: candidate.candidateObj,
    email_status: 'pending' as const,
    created_at: new Date().toISOString()
 }));
};

// ─── Score Ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const radius = 40;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <svg className="absolute -rotate-90" width="96" height="96">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
        <circle
          cx="48" cy="48" r={radius} fill="none"
          stroke={color} strokeWidth="7"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease-out', filter: `drop-shadow(0 0 6px ${color}80)` }}
        />
      </svg>
      <div className="text-center">
        <p className="text-2xl font-bold font-display" style={{ color }}>{score}</p>
        <p className="text-xs text-white/40">/ 100</p>
      </div>
    </div>
  );
}

// ─── Candidate Card ───────────────────────────────────────────────────────────
function CandidateCard({
  entry, index, hrUserName, hrUserEmail, jobTitle, onEmailSent
}: {
  entry: ShortlistedCandidate;
  index: number;
  hrUserName: string;
  hrUserEmail: string;
  jobTitle: string;
  onEmailSent: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questions, setQuestions] = useState<InterviewQuestion[]>(entry.interview_questions || []);
  const [sendingEmail, setSendingEmail] = useState(false);
  const { updateShortlisted } = useCandidateStore();
  const { selectedJob } = useJobStore();

  const candidate = entry.candidate!;

  useEffect(() => {
    if (expanded && questions.length === 0) {
      async function fetchQs() {
        try {
          const currentUser = await getCurrentUser();
          const { data } = await supabase
            .from('interview_questions')
            .select('questions')
            .eq('shortlisted_id', entry.id)
            .eq('hr_user_id', currentUser.id)
            .single();
          if (data && data.questions) {
            setQuestions(data.questions);
            updateShortlisted(entry.id, { interview_questions: data.questions });
          }
        } catch (err) {
          // No questions found
        }
      }
      fetchQs();
    }
  }, [expanded, entry.id, questions.length, updateShortlisted]);

  const handleGenerateQuestions = async () => {
    setQuestionsLoading(true);
    try {
      const qs = await generateInterviewQuestions(candidate, selectedJob || {});
      setQuestions(qs);
      updateShortlisted(entry.id, { interview_questions: qs });
      
      // Save to Supabase
      const currentUser = await getCurrentUser();
      await supabase.from('interview_questions').insert({
        shortlisted_id: entry.id,
        hr_user_id: currentUser.id,
        questions: qs
      });
      
      toast.success('Interview questions generated & saved to DB!');
    } catch {
      toast.error('Failed to generate questions');
    } finally {
      setQuestionsLoading(false);
    }
  };

  const handleSendEmail = async () => {
    setSendingEmail(true);
    try {
      const ok = await sendShortlistEmail(
        candidate.email,
        candidate.name || 'Candidate',
        jobTitle,
        hrUserName,
        hrUserEmail
      );
      if (ok) {
        updateShortlisted(entry.id, { email_status: 'sent' });
        onEmailSent(entry.id);
        
        const currentUser = await getCurrentUser();
        await supabase.from('sent_emails').insert({
          candidate_id: candidate.id,
          hr_user_id: currentUser.id,
          status: 'sent',
          sent_at: new Date().toISOString()
        });
        
        toast.success(`Email sent to ${candidate.email}`);
      } else {
        updateShortlisted(entry.id, { email_status: 'failed' });
        
        const currentUser = await getCurrentUser();
        await supabase.from('sent_emails').insert({
          candidate_id: candidate.id,
          hr_user_id: currentUser.id,
          status: 'failed'
        });
        
        toast.error('Failed to send email');
      }
    } catch {
      updateShortlisted(entry.id, { email_status: 'failed' });
      toast.error('Email delivery failed');
    } finally {
      setSendingEmail(false);
    }
  };

  const diffColor = (d: string) =>
    d === 'hard' ? 'text-red-400 bg-red-500/10' : d === 'medium' ? 'text-amber-400 bg-amber-500/10' : 'text-emerald-400 bg-emerald-500/10';

  return (
    <div className={clsx(
      'glass-card-solid overflow-hidden transition-all duration-300 animate-slide-up hover:border-brand-400/25',
      'border', index === 0 && 'border-brand-400/40'
    )} style={{ animationDelay: `${index * 60}ms` }}>

      {/* Top bar */}
      <div className="flex items-start gap-4 p-5">
        {/* Rank */}
        <div className={clsx(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
          index === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
          index === 1 ? 'bg-slate-400/10 text-slate-400 border border-slate-500/20' :
          index === 2 ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
          'bg-white/5 text-white/30 border border-white/10'
        )}>
          #{index + 1}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="font-semibold text-white truncate">{candidate?.name || 'Unknown Candidate'}</h3>
            {/* Duplicates and frauds are now fetched via Flag objects or nested flags */}
            {entry.email_status === 'sent' && (
              <span className="badge-green flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Email Sent</span>
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-white/40">
            {candidate?.email && <span>{candidate.email}</span>}
            {candidate?.phone && <span>{candidate.phone}</span>}
            {candidate?.years_experience && <span>{candidate.years_experience} exp</span>}
          </div>
        </div>

        <ScoreRing score={entry.score} />
      </div>

      {/* Match + summary */}
      <div className="px-5 pb-4">
        {entry.match_percentage && (
          <div className="mb-3 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-white/8">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${entry.match_percentage}%`,
                  background: `linear-gradient(90deg, #6366f1, #10b981)`,
                }}
              />
            </div>
            <span className="text-xs font-semibold text-brand-400">{entry.match_percentage}% match</span>
          </div>
        )}

        <p className="text-sm text-white/60 font-semibold mb-1">AI Verdict Summary:</p>
        <p className="text-sm text-white/50 italic mb-4 leading-relaxed">{entry.summary}</p>

        <p className="text-sm text-white/60 font-semibold mb-1">Detailed Reason:</p>
        <p className="text-sm text-white/60 leading-relaxed mb-4">{entry.reason}</p>

        {/* Strengths & Weaknesses (Task 4 FIX) */}
        <div className="grid grid-cols-2 gap-4 bg-white/5 rounded-xl p-4 border border-white/5">
          <div>
            <p className="text-xs font-bold text-emerald-400 mb-2 uppercase tracking-wider">✓ Strengths</p>
            {normalizeList(entry.strengths).length > 0 ? (
              <ul className="space-y-1.5">
                {normalizeList(entry.strengths).slice(0, 4).map((s, idx) => (
                  <li key={`${s}-${idx}`} className="text-xs text-white/70 flex items-start gap-2">
                    <span className="h-1 w-1 rounded-full bg-emerald-500/50 mt-1.5 shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-white/40 italic">No strengths available</p>
            )}
          </div>
          <div>
            <p className="text-xs font-bold text-red-400 mb-2 uppercase tracking-wider">✗ Weaknesses</p>
            {normalizeList(entry.weaknesses).length > 0 ? (
              <ul className="space-y-1.5">
                {normalizeList(entry.weaknesses).slice(0, 4).map((s, idx) => (
                  <li key={`${s}-${idx}`} className="text-xs text-white/70 flex items-start gap-2">
                    <span className="h-1 w-1 rounded-full bg-red-500/50 mt-1.5 shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-white/40 italic">No major weaknesses identified</p>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-white/8 px-5 py-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => { setExpanded(!expanded); if (!expanded && questions.length === 0) handleGenerateQuestions(); }}
          className="btn-ghost text-xs"
        >
          <Brain className="h-3.5 w-3.5" />
          {expanded ? 'Hide' : 'Interview Questions'}
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        <button
          onClick={handleSendEmail}
          disabled={sendingEmail || entry.email_status === 'sent'}
          className={clsx(
            'btn-ghost text-xs',
            entry.email_status === 'sent' ? 'text-emerald-400' : ''
          )}
        >
          {sendingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {entry.email_status === 'sent' ? 'Email Sent' : sendingEmail ? 'Sending…' : 'Send Next Round Email'}
        </button>
      </div>

      {/* Interview Questions Panel */}
      {expanded && (
        <div className="border-t border-white/8 bg-white/2 p-5 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-brand-400" />
              AI-Generated Interview Questions
            </h4>
            <button onClick={handleGenerateQuestions} disabled={questionsLoading} className="btn-ghost text-xs">
              {questionsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Regenerate
            </button>
          </div>

          {questionsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-xl shimmer" />)}
            </div>
          ) : questions.length === 0 ? (
            <p className="text-sm text-white/40">No questions yet. Click "Interview Questions" to generate.</p>
          ) : (
            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={i} className="rounded-xl border border-white/8 bg-white/3 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-brand-400">{q.skill}</span>
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', diffColor(q.difficulty))}>
                      {q.difficulty}
                    </span>
                  </div>
                  <p className="text-sm text-white/70">{q.question}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Processing Progress ──────────────────────────────────────────────────────
function ProcessingBar() {
  const { processing } = useCandidateStore();
  if (processing.step === 'idle' || processing.step === 'complete') return null;

  const stepLabels: Record<string, string> = {
    fetching_emails: 'Fetching emails from Gmail…',
    downloading_attachments: 'Downloading resume attachments…',
    parsing_resumes: `Parsing resumes (${processing.current}/${processing.total})…`,
    anonymizing: 'Anonymizing for bias-free screening…',
    ai_scoring: `AI scoring candidates (${processing.current}/${processing.total})…`,
    detecting_duplicates: 'Detecting duplicate applications…',
    detecting_fraud: 'Detecting fraudulent resumes…',
    shortlisting: 'Generating final shortlist…',
    error: 'Error occurred',
  };

  return (
    <div className="glass-card-solid p-5 animate-slide-up">
      <div className="flex items-center gap-3 mb-3">
        <Loader2 className="h-5 w-5 text-brand-400 animate-spin" />
        <p className="text-sm font-semibold text-white">{stepLabels[processing.step] || processing.step}</p>
      </div>
      <div className="h-2 w-full rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-purple-500 transition-all duration-500"
          style={{ width: `${processing.progress}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-white/40">{Math.round(processing.progress)}% complete</p>
    </div>
  );
}

// ─── Main Candidates Page ─────────────────────────────────────────────────────
export default function Candidates() {
  const { user } = useAuthStore();
  const { selectedJob, jobs } = useJobStore();
  const { shortlisted, setShortlisted, setProcessing, biasFreeEnabled, setBiasFree, resetProcessing } = useCandidateStore();
  const navigate = useNavigate();

  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(false);

  const currentJob = selectedJob || jobs[0];

  const hrUser = {
    id: user?.id || '',
    name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'HR Team',
    email: user?.email || '',
  };

  useEffect(() => {
    async function loadHydration() {
      if (!currentJob?.id) return;
      try {
        const currentUser = await getCurrentUser();
        const { data: shorts } = await supabase
          .from('shortlisted_candidates')
          .select('*')
          .eq('job_id', currentJob.id)
          .eq('hr_user_id', currentUser.id)
          .order('rank', { ascending: true });
          
        if (shorts && shorts.length > 0) {
          const formatted = shorts.map((s: any) => ({
            ...s,
            email_status: 'pending' as const,
            candidate: s.candidate || s.candidates?.[0],
            duplicate_flag: s.duplicate_flag || s.duplicate_flags?.[0],
            fraud_flag: s.fraud_flag || s.fraud_flags?.[0],
            interview_questions: []
          }));
          setShortlisted(formatted);
        }
      } catch (e) {
        console.error("Hydration errored", e);
      }
    }
    
    if (shortlisted.length === 0) {
       loadHydration();
     }
  }, [currentJob?.id, shortlisted.length, setShortlisted]);

  const runPipeline = async () => {
    if (!currentJob) return toast.error('Please select a job role first');
    if (loading || isRunning) return;
    
    setLoading(true);
    setIsRunning(true);
    resetProcessing();
    setShortlisted([]); // Task: Clear UI state before new run (Stale UI Fix)

    let finalCandidates: ShortlistedCandidate[] = [];

    try {
      // STEP 1: Fetch Emails
      setProcessing({ step: 'fetching_emails', progress: 5, message: 'Fetching emails…' });
      
      const startUnix = Math.floor(new Date(dateFrom).getTime() / 1000);
      const endUnix = Math.floor(new Date(dateTo).setHours(23, 59, 59, 999) / 1000);
      const query = buildResumeQuery(startUnix, endUnix);
      
      const messages = await fetchEmails(query);

      if (messages.length === 0) {
        toast.error('No emails with resume attachments found in this date range.');
        return;
      }

      // STEP 2: Download & Parse Resumes
      setProcessing({ step: 'downloading_attachments', progress: 15, total: messages.length, current: 0 });
      const resumeFiles: Array<{ filename: string; blob: Blob; mimeType: string; senderEmail: string }> = [];

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const attachments = await getResumeAttachments(msg);
        const sender = getSenderEmail(msg);
        attachments.forEach((a) => resumeFiles.push({ ...a, senderEmail: sender }));
        setProcessing({ progress: 15 + (i / messages.length) * 15, current: i + 1 });
      }

      setProcessing({ step: 'parsing_resumes', progress: 30, total: resumeFiles.length, current: 0 });
      const parsedResumes: Array<{ rawText: string; senderEmail: string }> = [];

      for (let i = 0; i < resumeFiles.length; i++) {
        const file = resumeFiles[i];
        const text = await parseResume(file.blob, file.mimeType, file.filename);
        if (text.length > 50) parsedResumes.push({ rawText: text, senderEmail: file.senderEmail });
        setProcessing({ progress: 30 + (i / resumeFiles.length) * 15, current: i + 1 });
      }

      // NEW BULK WORKFLOW
      // STEP 3: Local Pre-scoring & Name Discovery
      setProcessing({ step: 'ai_scoring', progress: 45, total: parsedResumes.length, current: 0 });
      
      const candidateData = [];
      for (let i = 0; i < parsedResumes.length; i++) {
         const { rawText, senderEmail } = parsedResumes[i];
         
         const localScore = calculateLocalScore(rawText);
         const discoveredName = extractName(rawText);
         
         // Build temporary candidate object
         const tempId = crypto.randomUUID();
         const candidateObj: Candidate = {
            id: tempId,
            name: discoveredName,
            email: senderEmail,
            phone: '',
            score: 0,
            summary: '',
            skills: [],
            projects: [],
            years_experience: '',
            education: '',
            certifications: [],
            companies: [],
            tech_stack: [],
            keywords: [],
            raw_text: rawText,
            received_at: new Date().toISOString(),
             hr_user_id: '',
            created_at: new Date().toISOString(),
         };

         candidateData.push({
            id: tempId,
            name: discoveredName,
            email: senderEmail,
            skills: '',
            projects: '',
            summary: rawText.slice(0, 300),
            localScore,
            candidateObj,
            rawText
         });
         
         setProcessing({ progress: 45 + (i / parsedResumes.length) * 15, current: i + 1 });
      }

      // NO SLICING: Pass ALL candidates to the comparative engine
      const allCandidatesSorted = candidateData.sort((a, b) => b.localScore - a.localScore);

      // STEP 4: Bulk AI Ranking (ALL COMPARE)
      setProcessing({ step: 'ai_scoring', progress: 75, message: `Comparative Ranking for ALL ${allCandidatesSorted.length} candidates...` });
      
      try {
        const aiResults = await bulkScoreCandidates(allCandidatesSorted, currentJob);

        if (Array.isArray(aiResults) && aiResults.length > 0) {
           finalCandidates = aiResults.map(res => {
               // Exact match from original pool using name or email
               const matchedLocal = allCandidatesSorted.find(c => c.name === res.name || c.email === res.email) || allCandidatesSorted[0];
               return {
                  id: crypto.randomUUID(),
                  candidate_id: matchedLocal.id,
                  job_id: currentJob.id,
                  score: res.score,
                  rank: res.rank,
                  strengths: res.strengths,
                  weaknesses: res.weaknesses || [],
                  reason: res.reason,
                  summary: res.summary,
                  candidate_name: res.name || matchedLocal.name,
                  candidate_email: res.email || matchedLocal.email,
                  resume_text: res.summary,
                  candidate: matchedLocal.candidateObj,
                  email_status: 'pending' as const,
                  created_at: new Date().toISOString()
               };
            });
        } else {
            throw new Error("Bulk AI returned empty results");
        }
      } catch (aiErr) {
        console.error("Bulk AI failed, falling back to local Top 10", aiErr);
        finalCandidates = getFallbackCandidates(allCandidatesSorted, currentJob.id);
      }

      // Save to Supabase (Top 10) - Task 3 & 4 Schema & Stale UI Fix
      setProcessing({ step: 'shortlisting', progress: 95, message: 'Cleaning up previous results...' });
      try {
        // STEP 5: Clear old results first (Stale UI Fix)
        const currentUser = await getCurrentUser();
        const { error: delErr } = await supabase
          .from('shortlisted_candidates')
          .delete()
          .eq('hr_user_id', currentUser.id)
          .eq('job_id', currentJob.id);
        
        if (delErr) {
          console.error("Failed to clear previous shortlist:", delErr);
        }

        for (const shortlistMatch of finalCandidates) {
           // Insert candidate if not exists.
           // Note: candidate_id might be missing from the table temporarily.
           await supabase.from('candidates').upsert({ ...shortlistMatch.candidate, hr_user_id: currentUser.id }, { onConflict: 'id' });
           
           // Insert shortlist entry with ACTUAL Schema Column Names (Task 3 & 4)
           const { error } = await supabase.from('shortlisted_candidates').insert({
              hr_user_id: currentUser.id,
              candidate_id: shortlistMatch.candidate_id,
              job_id: shortlistMatch.job_id,
              score: Math.min(100, Math.round(shortlistMatch.score)),
              rank: shortlistMatch.rank,
              candidate_name: shortlistMatch.candidate_name,
              candidate_email: shortlistMatch.candidate_email,
              reason: shortlistMatch.reason,
              strengths: shortlistMatch.strengths,
              weaknesses: shortlistMatch.weaknesses,
              resume_text: shortlistMatch.summary
           });

           if (error) {
              console.error("Supabase insert failed (likely schema mismatch):", error);
           }
        }
      } catch (dbErr) {
        console.error("Critical database operation failed:", dbErr);
      }

    } catch (err: any) {
      console.error("Pipeline failed", err);
      const isAuthError = err.message?.includes('token') || err.message?.includes('login');
      if (isAuthError) {
        toast.error('Session expired. Please log in again.');
        setTimeout(() => navigate('/login'), 2000);
      }
    } finally {
      console.log("FINAL CANDIDATE CARD DATA:", finalCandidates);

      if (finalCandidates.length > 0) {
        setShortlisted(finalCandidates);
      }
      setProcessing({ step: 'complete', progress: 100 });
      setIsRunning(false);
      setLoading(false);
      if (finalCandidates.length > 0) {
        toast.success(`✅ ${finalCandidates.length} candidates short-listed!`);
      }
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">AI Resume Screening</h1>
        <p className="mt-1 text-sm text-white/50">Fetch resumes from Gmail, run AI scoring, and get your Top 10 shortlist.</p>
      </div>

      <div className="glass-card-solid p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="label">Screening For</label>
            {currentJob ? (
              <div className="flex items-center gap-3 rounded-xl border border-brand-400/30 bg-brand-500/10 p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/20">
                  <Zap className="h-4 w-4 text-brand-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{currentJob.title}</p>
                  <p className="text-xs text-brand-400/70">{currentJob.experience_level}</p>
                </div>
              </div>
            ) : (
              <button onClick={() => navigate('/jobs')} className="input-field text-left">Select a job role</button>
            )}
          </div>
          <div>
            <label className="label">From Date</label>
            <input type="date" className="input-field" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To Date</label>
            <input type="date" className="input-field" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-3">
            <div onClick={() => setBiasFree(!biasFreeEnabled)} className={clsx('relative h-6 w-11 rounded-full', biasFreeEnabled ? 'bg-emerald-500' : 'bg-white/15')}>
              <div className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform', biasFreeEnabled ? 'translate-x-5' : 'translate-x-0.5')} />
            </div>
            <p className="text-sm font-semibold text-white">Bias-Free AI Screening</p>
          </label>
          <button 
            onClick={runPipeline} 
            disabled={loading || isRunning || !currentJob} 
            className="btn-primary"
          >
            {loading || isRunning ? 'Processing…' : 'Fetch & Score Resumes'}
          </button>
        </div>
      </div>

      <ProcessingBar />

      {/* Silently handle aiLimitReached without showing the warning banner */}


      {shortlisted.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="section-title">🏆 Top {shortlisted.length} Candidates</h2>
            {isRunning && (
              <div className="flex items-center gap-2 text-xs text-brand-400 font-semibold animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin" />
                Updating shortlist... this may take 5–6 minutes
              </div>
            )}
          </div>
          <div className={clsx("space-y-4", isRunning && "opacity-60 transition-opacity")}>
            {shortlisted.map((entry, i) => (
              <CandidateCard 
                key={`${entry.candidate_id}-${entry.rank}`} 
                entry={entry} 
                index={i} 
                hrUserName={hrUser.name} 
                hrUserEmail={hrUser.email} 
                jobTitle={currentJob?.title || ''} 
                onEmailSent={() => {}} 
              />
            ))}
          </div>
        </div>
      )}

      {shortlisted.length === 0 && !isRunning && (
        <div className="flex flex-col items-center py-20 text-center">
          <Mail className="h-12 w-12 text-brand-500/20 mb-4" />
          <h3 className="text-lg font-semibold text-white">Ready to screen</h3>
          <p className="text-sm text-white/40">Select dates and start the AI pipeline.</p>
        </div>
      )}
    </div>
  );
}
