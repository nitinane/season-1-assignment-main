import { useState, useEffect } from 'react';
import { Plus, Briefcase, X, ChevronRight, Loader2, Sparkles, CheckCircle2, AlertCircle, Share2, Copy, Check } from 'lucide-react';
import { generateAndSaveJD } from '../services/jdService';
import { generateAndSaveSocialDraft } from '../agents/socialPosterAgent';
import { supabase, getCurrentUser } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useJobStore } from '../store/jobStore';
import { useCandidateStore } from '../store/candidateStore';
import { useNavigate } from 'react-router-dom';
import type { JobRole } from '../types';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const EXPERIENCE_LEVELS = ['0–1 years (Intern)', '0–2 years (Junior)', '2–4 years (Mid)', '4–7 years (Senior)', '7+ years (Lead/Principal)'];

const normalizeList = (value: string[] | string | null | undefined) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value.split(',').map(item => item.trim()).filter(Boolean);
};

// ─── Agent 1 UI: Generate JD from raw HR notes ───────────────────────────────

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
  const [preview, setPreview] = useState<JDPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!notes.trim()) return toast.error('Please enter some HR notes first');
    setLoading(true);
    setPreview(null);
    setError(null);

    try {
      const { agentResult, savedJob } = await generateAndSaveJD(notes);

      if (!agentResult.success) {
        setError(agentResult.error);
        return;
      }

      // Show preview
      setPreview(agentResult.data);

      if (savedJob) {
        addJob(savedJob);
        toast.success('Job role generated and saved!');
        // Keep preview visible for 1.5 s then close
        setTimeout(() => onSuccess(), 1500);
      } else {
        toast.success('JD generated (not saved — check Supabase connection)');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
      toast.error('Generation failed: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Input */}
      <div>
        <label className="label">
          Raw HR Notes
          <span className="ml-2 text-xs text-white/30">describe the role in plain language</span>
        </label>
        <textarea
          id="jd-generator-notes"
          className="input-field min-h-36 resize-none font-mono text-xs leading-relaxed"
          placeholder={`e.g.\nWe need a senior backend engineer for our fintech startup.\nThey'll own payment microservices in Node.js + PostgreSQL, work with AWS…`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <p className="mt-1.5 text-xs text-white/30">
          Agent 1 · llama-3.3-70b-versatile · temp 0.3
        </p>
      </div>

      <button
        id="jd-generator-submit"
        onClick={handleGenerate}
        disabled={loading}
        className="btn-primary w-full justify-center"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? 'Generating JD…' : 'Generate Job Description'}
      </button>

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div>
            <p className="text-sm font-medium text-red-300">Generation failed</p>
            <p className="mt-0.5 text-xs text-red-400/70">{error}</p>
          </div>
        </div>
      )}

      {/* Preview of generated JD */}
      {preview && (
        <div className="space-y-4 rounded-xl border border-brand-400/20 bg-brand-500/8 p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-brand-400" />
            <p className="text-sm font-semibold text-brand-300">Generated Job Description</p>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-white/30">Title</span>
              <p className="mt-0.5 font-semibold text-white">{preview.title}</p>
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-white/30">Experience Level</span>
              <p className="mt-0.5 text-white/70">{preview.experience_level}</p>
            </div>
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-white/30">Required Skills</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {preview.required_skills.map((s, i) => (
                  <span key={i} className="badge-purple text-xs">{s}</span>
                ))}
              </div>
            </div>
            {preview.tools.length > 0 && (
              <div>
                <span className="text-xs font-medium uppercase tracking-wider text-white/30">Tools</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {preview.tools.map((t, i) => (
                    <span key={i} className="badge-blue text-xs">{t}</span>
                  ))}
                </div>
              </div>
            )}
            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-white/30">Responsibilities</span>
              <ul className="mt-1.5 space-y-1">
                {preview.responsibilities.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-white/60">
                    <span className="mt-0.5 text-brand-400">•</span>{r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function JobForm({ onSuccess }: { onSuccess: () => void }) {
  const user = useAuthStore((s) => s.user);
  const addJob = useJobStore((s) => s.addJob);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expLevel, setExpLevel] = useState(EXPERIENCE_LEVELS[1]);
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [toolInput, setToolInput] = useState('');
  const [tools, setTools] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

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
        status: 'active'
      }).select().single();

      if (error) throw error;
      addJob(data as JobRole);
      toast.success('Job role created!');
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create job role';
      // Show friendly message if Supabase isn't connected
      if (msg.includes('relation') || msg.includes('fetch')) {
        toast.error('Connect Supabase to save (see .env.example)');
        // Still add locally for demo
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
    <div className="space-y-5">
      <div>
        <label className="label">Job Title *</label>
        <input className="input-field" placeholder="e.g. Senior Frontend Developer" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div>
        <label className="label">Experience Level</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {EXPERIENCE_LEVELS.map((lvl) => (
            <button
              key={lvl}
              onClick={() => setExpLevel(lvl)}
              className={`rounded-xl border px-3 py-2 text-xs font-medium transition-all duration-150 ${expLevel === lvl ? 'border-brand-400/60 bg-brand-500/15 text-brand-300' : 'border-white/10 bg-white/3 text-white/50 hover:border-white/20 hover:text-white/70'}`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Required Skills *</label>
        <div className="flex gap-2">
          <input
            className="input-field"
            placeholder="e.g. React, TypeScript…"
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(skillInput, skills, setSkills, setSkillInput); } }}
          />
          <button onClick={() => addTag(skillInput, skills, setSkills, setSkillInput)} className="btn-secondary shrink-0 px-4">Add</button>
        </div>
        {skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {skills.map((s) => (
              <span key={s} className="badge-purple flex items-center gap-1">
                {s}
                <button onClick={() => setSkills(skills.filter((x) => x !== s))}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="label">Preferred Tools / Stack</label>
        <div className="flex gap-2">
          <input
            className="input-field"
            placeholder="e.g. Docker, AWS, Tailwind…"
            value={toolInput}
            onChange={(e) => setToolInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(toolInput, tools, setTools, setToolInput); } }}
          />
          <button onClick={() => addTag(toolInput, tools, setTools, setToolInput)} className="btn-secondary shrink-0 px-4">Add</button>
        </div>
        {tools.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {tools.map((t) => (
              <span key={t} className="badge-blue flex items-center gap-1">
                {t}
                <button onClick={() => setTools(tools.filter((x) => x !== t))}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="label">Job Description (optional)</label>
        <textarea
          className="input-field min-h-24 resize-none"
          placeholder="Brief job summary to help AI scoring…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <button onClick={handleSave} disabled={saving} className="btn-primary w-full justify-center">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {saving ? 'Creating…' : 'Create Job Role'}
      </button>
    </div>
  );
}

type PanelMode = 'none' | 'manual' | 'ai';

export default function Jobs() {
  const { jobs, setJobs, setSelectedJob } = useJobStore();
  const { clear } = useCandidateStore();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [panelMode, setPanelMode] = useState<PanelMode>('none');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // Agent 2 Social Poster State
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
        // Update local jobs list
        setJobs(jobs.map(j => j.id === jobId ? { ...j, social_draft: res.draft } : j));
        // Update selected job draft state
        if (selectedJobForDraft && selectedJobForDraft.id === jobId) {
          setSelectedJobForDraft({ ...selectedJobForDraft, social_draft: res.draft });
        }
      } else {
        toast.error(`Drafting failed: ${res.error}`);
      }
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
    } finally {
      setGeneratingDraft(false);
    }
  };

  const handleCopyPost = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPost(true);
    toast.success('LinkedIn post copy copied!');
    setTimeout(() => setCopiedPost(false), 2000);
  };

  const handleCopyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPrompt(true);
    toast.success('Image prompt copied!');
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        const currentUser = await getCurrentUser();
        const { data } = await supabase.from('job_roles').select('*').eq('hr_user_id', currentUser.id).order('created_at', { ascending: false });
        if (data) setJobs(data as JobRole[]);
      } catch (e) {
        console.error(e);
      }
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
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Job Roles</h1>
          <p className="mt-1 text-sm text-white/50">Create and manage roles to screen candidates against.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Agent 1 — Generate with AI */}
          <button
            id="jobs-generate-ai-btn"
            onClick={() => { setPanelMode(panelMode === 'ai' ? 'none' : 'ai'); setShowForm(false); }}
            className={`btn-secondary flex items-center gap-2 ${
              panelMode === 'ai' ? 'border-brand-400/50 text-brand-300' : ''
            }`}
          >
            <Sparkles className="h-4 w-4" />
            {panelMode === 'ai' ? 'Cancel' : 'Generate with AI'}
          </button>
          {/* Manual form */}
          <button
            id="jobs-new-role-btn"
            onClick={() => { setShowForm(!showForm); setPanelMode('none'); }}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            {showForm ? 'Cancel' : 'New Role'}
          </button>
        </div>
      </div>

      {/* Agent 1 — AI Generator Panel */}
      {panelMode === 'ai' && (
        <div className="glass-card-solid p-6 animate-slide-up">
          <div className="mb-5 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-400" />
            <h2 className="section-title">Generate Job Description with AI</h2>
          </div>
          <JDGeneratorPanel onSuccess={closeAll} />
        </div>
      )}

      {/* Manual Form */}
      {showForm && (
        <div className="glass-card-solid p-6 animate-slide-up">
          <h2 className="section-title mb-5">Create New Job Role</h2>
          <JobForm onSuccess={() => setShowForm(false)} />
        </div>
      )}

      {/* Job List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl shimmer" />)}
        </div>
      ) : jobs.length === 0 && !showForm ? (
        <div className="flex flex-col items-center py-24 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/10 border border-brand-500/20">
            <Briefcase className="h-8 w-8 text-brand-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">No job roles yet</h3>
          <p className="mt-2 text-sm text-white/40 max-w-sm">Create your first job role to start screening candidates with AI.</p>
          <button onClick={() => setShowForm(true)} className="mt-5 btn-primary">
            <Plus className="h-4 w-4" /> Create Job Role
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <div key={job.id} className="glass-card-solid p-5 group hover:border-brand-400/30 transition-all duration-200 cursor-pointer" onClick={() => handleSelect(job)}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 border border-brand-500/20">
                  <Briefcase className="h-5 w-5 text-brand-400" />
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedJobForDraft(job);
                    }}
                    title="View Social Post Draft"
                    className="p-1.5 rounded-lg border border-white/5 bg-white/3 text-white/40 hover:text-brand-300 hover:border-brand-500/35 transition-all"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </button>
                  <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-brand-400 transition-colors" />
                </div>
              </div>
              <h3 className="font-semibold text-white text-sm">{job.title}</h3>
              <p className="text-xs text-white/40 mt-0.5 mb-3">{job.experience_level}</p>
              <div className="flex flex-wrap gap-1.5">
                {normalizeList(job.required_skills).slice(0, 4).map((skill, index) => (
                  <span key={`${skill}-${index}`} className="badge-purple text-xs">{skill}</span>
                ))}
                {normalizeList(job.required_skills).length > 4 && (
                  <span className="badge-gray">+{normalizeList(job.required_skills).length - 4}</span>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-white/30">
                <span>Created {format(new Date(job.created_at), 'MMM d, yyyy')}</span>
                <span className="text-brand-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Screen candidates →
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agent 2 Social Draft Modal */}
      {selectedJobForDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0d0d1e] p-6 shadow-2xl animate-scale-up space-y-5 text-xs">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-2">
                <Share2 className="h-4.5 w-4.5 text-brand-400" />
                <h3 className="text-sm font-bold text-white">Social Media Post Draft — {selectedJobForDraft.title}</h3>
              </div>
              <button
                onClick={() => { setSelectedJobForDraft(null); setCopiedPost(false); setCopiedPrompt(false); }}
                className="rounded-lg p-1 text-white/40 hover:bg-white/5 hover:text-white transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {selectedJobForDraft.social_draft ? (
              <div className="space-y-4">
                {/* Post Copy Box */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-white/40">LinkedIn Post Copy</span>
                    <button
                      onClick={() => handleCopyPost(selectedJobForDraft.social_draft!.post_copy)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/5 bg-white/3 text-[11px] font-medium text-brand-300 hover:bg-brand-500/10 transition-all"
                    >
                      {copiedPost ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copiedPost ? 'Copied' : 'Copy Post'}
                    </button>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/2 p-4 font-sans text-white/70 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                    {selectedJobForDraft.social_draft.post_copy}
                  </div>
                </div>

                {/* Image Prompt Box */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-white/40">Suggested Image Prompt (AI Visual)</span>
                    <button
                      onClick={() => handleCopyPrompt(selectedJobForDraft.social_draft!.image_prompt)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/5 bg-white/3 text-[11px] font-medium text-brand-300 hover:bg-brand-500/10 transition-all"
                    >
                      {copiedPrompt ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copiedPrompt ? 'Copied' : 'Copy Prompt'}
                    </button>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/2 p-4 font-mono text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap">
                    {selectedJobForDraft.social_draft.image_prompt}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
                <Sparkles className="h-8 w-8 text-white/20 animate-pulse" />
                <div>
                  <h4 className="text-white/70 font-semibold">No Social Draft generated yet</h4>
                  <p className="text-white/30 max-w-sm mt-1">This job role doesn't have an active social media recruitment post draft.</p>
                </div>
                <button
                  onClick={() => handleGenerateSocialDraft(selectedJobForDraft.id)}
                  disabled={generatingDraft}
                  className="btn-primary h-9 px-4 text-xs flex items-center gap-1.5"
                >
                  {generatingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {generatingDraft ? 'Generating Draft…' : 'Generate Social Draft with AI'}
                </button>
              </div>
            )}
            
            {/* Footer */}
            <div className="border-t border-white/5 pt-4 text-right">
              <button
                onClick={() => { setSelectedJobForDraft(null); setCopiedPost(false); setCopiedPrompt(false); }}
                className="btn-secondary px-4 h-9 text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
