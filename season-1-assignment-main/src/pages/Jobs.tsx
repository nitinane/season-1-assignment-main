import { useState, useEffect } from 'react';
import {
  Plus, Briefcase, X, ChevronRight, Loader2, Sparkles,
  CheckCircle2, AlertCircle, Share2, Copy, Check, Pencil
} from 'lucide-react';
import { generateAndSaveSocialDraft } from '../agents/socialPosterAgent';
import { runJDGeneratorAgent } from '../agents/jdGeneratorAgent';
import { notify_hr } from '../services/notificationService';
import { supabase, getCurrentUser } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useJobStore } from '../store/jobStore';
import { useCandidateStore } from '../store/candidateStore';
import { useNavigate } from 'react-router-dom';
import type { JobRole } from '../types';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const EXPERIENCE_LEVELS = [
  '0–1 years (Intern)',
  '0–2 years (Junior)',
  '2–4 years (Mid)',
  '4–7 years (Senior)',
  '7+ years (Lead/Principal)',
];

const normalizeList = (value: string[] | string | null | undefined) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value.split(',').map(item => item.trim()).filter(Boolean);
};

// ─── Agent 1: JD Generator Panel ─────────────────────────────────────────────

interface JDPreview {
  title: string;
  required_skills: string[];
  experience_level: string;
  responsibilities: string[];
  tools: string[];
}

function JDGeneratorPanel({ onSuccess }: { onSuccess: () => void }) {
  const addJob = useJobStore((s) => s.addJob);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<JDPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');
  const [skillsStr, setSkillsStr] = useState('');
  const [toolsStr, setToolsStr] = useState('');
  const [responsibilitiesStr, setResponsibilitiesStr] = useState('');
  const [description, setDescription] = useState('');

  const handleGenerate = async () => {
    if (!notes.trim()) return toast.error('Enter HR notes first');
    setLoading(true);
    setPreview(null);
    setError(null);
    try {
      const agentResult = await runJDGeneratorAgent(notes);
      if (!agentResult.success) { setError(agentResult.error); return; }
      const data = agentResult.data;
      setPreview(data);
      setTitle(data.title || '');
      setExperienceLevel(data.experience_level || '');
      setSkillsStr((data.required_skills || []).join('\n'));
      setToolsStr((data.tools || []).join('\n'));
      setResponsibilitiesStr((data.responsibilities || []).join('\n'));
      setDescription(notes);
      toast.success('JD draft ready — review and save!');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
      toast.error('Generation failed: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) return toast.error('Job title is required');
    const parsedSkills = skillsStr.split('\n').map(s => s.trim()).filter(Boolean);
    const parsedTools  = toolsStr.split('\n').map(t => t.trim()).filter(Boolean);
    const parsedResp   = responsibilitiesStr.split('\n').map(r => r.trim()).filter(Boolean);
    if (parsedSkills.length === 0) return toast.error('At least one skill required');
    if (parsedResp.length === 0)   return toast.error('At least one responsibility required');
    setSaving(true);
    try {
      const currentUser = await getCurrentUser();
      const { data, error: dbErr } = await supabase
        .from('job_roles')
        .insert({
          hr_user_id: currentUser.id,
          title: title.trim(),
          description: description.trim(),
          experience_level: experienceLevel.trim(),
          required_skills: parsedSkills,
          preferred_tools: parsedTools,
          status: 'active',
        })
        .select()
        .single();
      if (dbErr) throw dbErr;
      const savedJob = data as JobRole;
      addJob(savedJob);
      notify_hr(savedJob.hr_user_id, 'jd_created', `Job description created: "${savedJob.title}"`).catch(console.error);
      generateAndSaveSocialDraft(savedJob.id).catch(console.error);
      toast.success('Job role saved & pipeline started!');
      onSuccess();
    } catch (e: any) {
      toast.error('Failed to save: ' + (e.message || String(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* AI badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="ai-draft-banner">
          <Sparkles size={11} />
          Agent 1 · llama-3.3-70b-versatile · temp 0.3
        </div>
        {preview && (
          <button onClick={() => setPreview(null)} style={{ fontSize: 11, color: 'var(--outline)', background: 'none', border: 'none', cursor: 'pointer' }}>
            ← Start over
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '14px 16px', borderRadius: 10,
          background: 'rgba(255,122,147,0.08)',
          border: '1px solid rgba(255,122,147,0.2)',
        }}>
          <AlertCircle size={15} color="var(--error)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--error)', margin: '0 0 3px' }}>Generation failed</p>
            <p style={{ fontSize: 12, color: 'rgba(255,122,147,0.7)', margin: 0 }}>{error}</p>
          </div>
        </div>
      )}

      {/* Notes input */}
      {!preview && (
        <>
          <div>
            <label className="label">
              Raw HR Notes
              <span style={{ fontFamily: 'Inter, sans-serif', textTransform: 'none', letterSpacing: 0, fontSize: 11, color: 'var(--outline)', fontWeight: 400, marginLeft: 6 }}>
                describe the role in plain language
              </span>
            </label>
            <textarea
              id="jd-generator-notes"
              className="input-field"
              style={{ minHeight: 120, resize: 'vertical', fontFamily: "'Geist Mono', monospace", fontSize: 12, lineHeight: 1.7 }}
              placeholder={`e.g.\nWe need a senior backend engineer for our fintech startup.\nThey'll own payment microservices in Node.js + PostgreSQL, work with AWS…`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <button id="jd-generator-submit" onClick={handleGenerate} disabled={loading} className="btn-primary" style={{ justifyContent: 'center' }}>
            {loading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={15} />}
            {loading ? 'Generating JD…' : 'Generate Job Description with AI'}
          </button>
        </>
      )}

      {/* Editable preview */}
      {preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} className="animate-slide-up">
          <div style={{
            padding: '14px 16px', borderRadius: 10,
            background: 'rgba(61,232,168,0.07)',
            border: '1px solid rgba(61,232,168,0.2)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <CheckCircle2 size={15} color="var(--tertiary)" />
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--tertiary)', margin: 0 }}>
              Review & edit before saving — this is an AI draft
            </p>
          </div>

          <div>
            <label className="label">Job Title *</label>
            <input className="input-field" style={{ fontSize: 13 }} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">Experience Level</label>
            <input className="input-field" style={{ fontSize: 13 }} value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)} />
          </div>
          <div>
            <label className="label">Required Skills (one per line) *</label>
            <textarea className="input-field" style={{ minHeight: 80, fontSize: 13 }} value={skillsStr} onChange={(e) => setSkillsStr(e.target.value)} />
          </div>
          <div>
            <label className="label">Preferred Tools / Stack (one per line)</label>
            <textarea className="input-field" style={{ minHeight: 60, fontSize: 13 }} value={toolsStr} onChange={(e) => setToolsStr(e.target.value)} />
          </div>
          <div>
            <label className="label">Responsibilities (one per line) *</label>
            <textarea className="input-field" style={{ minHeight: 100, fontSize: 13 }} value={responsibilitiesStr} onChange={(e) => setResponsibilitiesStr(e.target.value)} />
          </div>
          <div>
            <label className="label">Internal Notes</label>
            <textarea className="input-field" style={{ minHeight: 60, fontSize: 13 }} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button id="jd-generator-save-btn" onClick={handleSave} disabled={saving} className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
              {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />}
              {saving ? 'Saving…' : 'Save Job Role & Start Pipeline'}
            </button>
            <button onClick={() => setPreview(null)} disabled={saving} className="btn-secondary" style={{ padding: '9px 16px' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Manual Job Form ──────────────────────────────────────────────────────────

function JobForm({ onSuccess }: { onSuccess: () => void }) {
  const user   = useAuthStore((s) => s.user);
  const addJob = useJobStore((s) => s.addJob);
  const [title, setTitle]           = useState('');
  const [description, setDescription] = useState('');
  const [expLevel, setExpLevel]     = useState(EXPERIENCE_LEVELS[1]);
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills]         = useState<string[]>([]);
  const [toolInput, setToolInput]   = useState('');
  const [tools, setTools]           = useState<string[]>([]);
  const [saving, setSaving]         = useState(false);

  const addTag = (val: string, list: string[], setList: (v: string[]) => void, setInput: (v: string) => void) => {
    const trimmed = val.trim();
    if (trimmed && !list.includes(trimmed)) setList([...list, trimmed]);
    setInput('');
  };

  const handleSave = async () => {
    if (!title.trim()) return toast.error('Job title is required');
    if (skills.length === 0) return toast.error('Add at least one required skill');
    setSaving(true);
    try {
      const currentUser = await getCurrentUser();
      const { data, error } = await supabase.from('job_roles').insert({
        hr_user_id: currentUser.id,
        title: title.trim(),
        description: description.trim(),
        experience_level: expLevel,
        required_skills: skills,
        preferred_tools: tools,
        status: 'active',
      }).select().single();
      if (error) throw error;
      addJob(data as JobRole);
      toast.success('Job role created!');
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create job role';
      if (msg.includes('relation') || msg.includes('fetch')) {
        toast.error('Connect Supabase to save (see .env.example)');
        addJob({ id: crypto.randomUUID(), hr_user_id: user?.id || '', title, description, experience_level: expLevel, required_skills: skills, preferred_tools: tools, status: 'active', created_at: new Date().toISOString() });
        onSuccess();
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label className="label">Job Title *</label>
        <input className="input-field" placeholder="e.g. Senior Frontend Developer" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div>
        <label className="label">Experience Level</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {EXPERIENCE_LEVELS.map((lvl) => (
            <button
              key={lvl}
              onClick={() => setExpLevel(lvl)}
              style={{
                padding: '8px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.15s',
                background: expLevel === lvl ? 'rgba(91,94,244,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${expLevel === lvl ? 'rgba(91,94,244,0.4)' : 'rgba(255,255,255,0.09)'}`,
                color: expLevel === lvl ? 'var(--primary)' : 'var(--on-surface-muted)',
              }}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Required Skills *</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input-field"
            placeholder="e.g. React, TypeScript…"
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(skillInput, skills, setSkills, setSkillInput); } }}
          />
          <button onClick={() => addTag(skillInput, skills, setSkills, setSkillInput)} className="btn-secondary" style={{ flexShrink: 0 }}>Add</button>
        </div>
        {skills.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {skills.map((s) => (
              <span key={s} className="badge badge-purple" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {s}
                <button onClick={() => setSkills(skills.filter((x) => x !== s))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'inherit' }}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="label">Preferred Tools / Stack</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input-field"
            placeholder="e.g. Docker, AWS…"
            value={toolInput}
            onChange={(e) => setToolInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(toolInput, tools, setTools, setToolInput); } }}
          />
          <button onClick={() => addTag(toolInput, tools, setTools, setToolInput)} className="btn-secondary" style={{ flexShrink: 0 }}>Add</button>
        </div>
        {tools.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {tools.map((t) => (
              <span key={t} className="badge badge-blue" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {t}
                <button onClick={() => setTools(tools.filter((x) => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'inherit' }}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="label">Job Description (optional)</label>
        <textarea
          className="input-field"
          style={{ minHeight: 80, resize: 'vertical' }}
          placeholder="Brief summary to help AI scoring…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ justifyContent: 'center' }}>
        {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
        {saving ? 'Creating…' : 'Create Job Role'}
      </button>
    </div>
  );
}

// ─── Main Jobs Page ───────────────────────────────────────────────────────────

type PanelMode = 'none' | 'manual' | 'ai';

export default function Jobs() {
  const { jobs, setJobs, setSelectedJob } = useJobStore();
  const { clear } = useCandidateStore();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [panelMode, setPanelMode] = useState<PanelMode>('none');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // Agent 2 social draft
  const [selectedJobForDraft, setSelectedJobForDraft] = useState<JobRole | null>(null);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [copiedPost, setCopiedPost] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const handleGenerateSocialDraft = async (jobId: string) => {
    setGeneratingDraft(true);
    try {
      const res = await generateAndSaveSocialDraft(jobId);
      if (res.success && res.draft) {
        toast.success('Social media draft created!');
        setJobs(jobs.map(j => j.id === jobId ? { ...j, social_draft: res.draft } : j));
        if (selectedJobForDraft?.id === jobId) setSelectedJobForDraft({ ...selectedJobForDraft, social_draft: res.draft });
      } else {
        toast.error(`Drafting failed: ${res.error}`);
      }
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
    } finally {
      setGeneratingDraft(false);
    }
  };

  const handleCopyPost   = (text: string) => { navigator.clipboard.writeText(text); setCopiedPost(true); toast.success('Post copy copied!'); setTimeout(() => setCopiedPost(false), 2000); };
  const handleCopyPrompt = (text: string) => { navigator.clipboard.writeText(text); setCopiedPrompt(true); toast.success('Image prompt copied!'); setTimeout(() => setCopiedPrompt(false), 2000); };

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        const currentUser = await getCurrentUser();
        const { data } = await supabase.from('job_roles').select('*').eq('hr_user_id', currentUser.id).order('created_at', { ascending: false });
        if (data) setJobs(data as JobRole[]);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [user, setJobs]);

  const handleSelect = (job: JobRole) => {
    setSelectedJob(job);
    clear();
    navigate('/candidates');
  };

  const closeAll = () => { setPanelMode('none'); setShowForm(false); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="animate-fade-in">

      {/* ── Header ────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--on-surface)', letterSpacing: '-0.02em', margin: 0 }}>
            Job Roles
          </h1>
          <p style={{ fontSize: 13, color: 'var(--on-surface-muted)', marginTop: 3 }}>
            {jobs.length} role{jobs.length !== 1 ? 's' : ''} · Create with AI or manually
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            id="jobs-generate-ai-btn"
            onClick={() => { setPanelMode(panelMode === 'ai' ? 'none' : 'ai'); setShowForm(false); }}
            className={panelMode === 'ai' ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: 12 }}
          >
            <Sparkles size={14} />
            {panelMode === 'ai' ? 'Close AI Panel' : 'Generate with AI'}
          </button>
          <button
            id="jobs-new-role-btn"
            onClick={() => { setShowForm(!showForm); setPanelMode('none'); }}
            className={showForm ? 'btn-secondary' : 'btn-primary'}
            style={{ fontSize: 12 }}
          >
            <Plus size={14} />
            {showForm ? 'Cancel' : 'New Role'}
          </button>
        </div>
      </div>

      {/* ── AI Generator Panel ────────────────────────────── */}
      {panelMode === 'ai' && (
        <div className="glass-card-solid animate-slide-up" style={{ padding: '24px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(91,94,244,0.15)', border: '1px solid rgba(91,94,244,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={16} color="var(--primary)" />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>Generate Job Description with AI</p>
              <p style={{ fontSize: 11.5, color: 'var(--outline)', marginTop: 2 }}>Agent 1 converts your rough notes into a structured, editable JD</p>
            </div>
          </div>
          <JDGeneratorPanel onSuccess={closeAll} />
        </div>
      )}

      {/* ── Manual Form ───────────────────────────────────── */}
      {showForm && (
        <div className="glass-card-solid animate-slide-up" style={{ padding: '24px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Pencil size={15} color="var(--on-surface-muted)" />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>Create New Job Role</p>
          </div>
          <JobForm onSuccess={() => setShowForm(false)} />
        </div>
      )}

      {/* ── Job List ──────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="shimmer" style={{ height: 140, borderRadius: 14 }} />
          ))}
        </div>
      ) : jobs.length === 0 && !showForm ? (
        <div className="empty-state" style={{ padding: '72px 24px' }}>
          <div className="empty-state-icon">
            <Briefcase size={28} color="var(--primary)" />
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--on-surface)', marginBottom: 8 }}>No job roles yet</p>
          <p style={{ fontSize: 13, color: 'var(--outline)', maxWidth: 340, lineHeight: 1.6, marginBottom: 20 }}>
            Create your first role to start screening candidates with AI. Use "Generate with AI" for a structured JD from your rough notes.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setPanelMode('ai')} className="btn-primary" style={{ fontSize: 12 }}>
              <Sparkles size={13} /> Generate with AI
            </button>
            <button onClick={() => setShowForm(true)} className="btn-secondary" style={{ fontSize: 12 }}>
              <Plus size={13} /> Manual Form
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {jobs.map((job) => (
            <div
              key={job.id}
              className="glass-card"
              style={{ padding: '20px 22px', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
              onClick={() => handleSelect(job)}
            >
              {/* Ambient glow */}
              <div style={{
                position: 'absolute', top: '-30%', right: '-20%',
                width: '60%', height: '60%',
                background: 'radial-gradient(circle, rgba(91,94,244,0.08) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  background: 'rgba(91,94,244,0.12)', border: '1px solid rgba(91,94,244,0.22)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Briefcase size={18} color="var(--primary)" />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedJobForDraft(job); }}
                    title="View Social Post Draft"
                    style={{
                      width: 30, height: 30, borderRadius: 7,
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: 'var(--outline)',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(91,94,244,0.1)'; (e.currentTarget as HTMLElement).style.color = 'var(--primary)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.color = 'var(--outline)'; }}
                  >
                    <Share2 size={13} />
                  </button>
                  <ChevronRight size={16} color="var(--outline-dim)" />
                </div>
              </div>

              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--on-surface)', margin: '0 0 4px', lineHeight: 1.3 }}>{job.title}</h3>
              <p style={{ fontSize: 11.5, color: 'var(--outline)', marginBottom: 14 }}>{job.experience_level || 'Any experience level'}</p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {normalizeList(job.required_skills).slice(0, 4).map((skill, index) => (
                  <span key={`${skill}-${index}`} className="badge badge-purple" style={{ fontSize: 10 }}>{skill}</span>
                ))}
                {normalizeList(job.required_skills).length > 4 && (
                  <span className="badge badge-gray" style={{ fontSize: 10 }}>+{normalizeList(job.required_skills).length - 4}</span>
                )}
              </div>

              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--outline-dim)' }}>
                  {format(new Date(job.created_at), 'MMM d, yyyy')}
                </span>
                <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                  Screen candidates <ChevronRight size={11} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Agent 2: Social Draft Modal ───────────────────── */}
      {selectedJobForDraft && (
        <div className="modal-overlay" onClick={() => setSelectedJobForDraft(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(91,94,244,0.12)', border: '1px solid rgba(91,94,244,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Share2 size={15} color="var(--primary)" />
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>Social Media Draft</p>
                  <p style={{ fontSize: 11, color: 'var(--outline)', marginTop: 2 }}>{selectedJobForDraft.title}</p>
                </div>
              </div>
              <button
                onClick={() => { setSelectedJobForDraft(null); setCopiedPost(false); setCopiedPrompt(false); }}
                style={{ width: 30, height: 30, borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--outline)' }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* AI badge */}
              <div className="ai-draft-banner" style={{ alignSelf: 'flex-start' }}>
                <Sparkles size={11} />
                Agent 2 · Draft only — copy to clipboard, no auto-publish
              </div>

              {selectedJobForDraft.social_draft ? (
                <>
                  {/* Post copy */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label className="label" style={{ margin: 0 }}>LinkedIn Post Copy</label>
                      <button
                        onClick={() => handleCopyPost(selectedJobForDraft.social_draft!.post_copy)}
                        className="btn-secondary"
                        style={{ padding: '5px 12px', fontSize: 11, height: 'auto' }}
                      >
                        {copiedPost ? <Check size={11} /> : <Copy size={11} />}
                        {copiedPost ? 'Copied!' : 'Copy Post'}
                      </button>
                    </div>
                    <div style={{
                      borderRadius: 10, padding: '14px 16px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      fontSize: 13, color: 'var(--on-surface-muted)',
                      lineHeight: 1.7, whiteSpace: 'pre-wrap',
                      maxHeight: 200, overflowY: 'auto',
                    }}>
                      {selectedJobForDraft.social_draft.post_copy}
                    </div>
                  </div>

                  {/* Image prompt */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label className="label" style={{ margin: 0 }}>Suggested Image Prompt</label>
                      <button
                        onClick={() => handleCopyPrompt(selectedJobForDraft.social_draft!.image_prompt)}
                        className="btn-secondary"
                        style={{ padding: '5px 12px', fontSize: 11, height: 'auto' }}
                      >
                        {copiedPrompt ? <Check size={11} /> : <Copy size={11} />}
                        {copiedPrompt ? 'Copied!' : 'Copy Prompt'}
                      </button>
                    </div>
                    <div style={{
                      borderRadius: 10, padding: '12px 16px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      fontFamily: "'Geist Mono', monospace", fontSize: 11.5,
                      color: 'var(--outline)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                    }}>
                      {selectedJobForDraft.social_draft.image_prompt}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 0', textAlign: 'center', gap: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={22} color="var(--outline)" />
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, color: 'var(--on-surface)', margin: '0 0 6px' }}>No draft yet</p>
                    <p style={{ fontSize: 12, color: 'var(--outline)', margin: 0, maxWidth: 280, lineHeight: 1.6 }}>
                      Generate a recruitment social post for this role using Agent 2.
                    </p>
                  </div>
                  <button
                    onClick={() => handleGenerateSocialDraft(selectedJobForDraft.id)}
                    disabled={generatingDraft}
                    className="btn-primary"
                    style={{ fontSize: 12 }}
                  >
                    {generatingDraft ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={13} />}
                    {generatingDraft ? 'Generating…' : 'Generate Social Draft'}
                  </button>
                </div>
              )}
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => { setSelectedJobForDraft(null); setCopiedPost(false); setCopiedPrompt(false); }} className="btn-secondary" style={{ fontSize: 12, padding: '8px 16px' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
