import { useState, useEffect } from 'react';
import { Plus, Briefcase, X, ChevronRight, Loader2 } from 'lucide-react';
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

export default function Jobs() {
  const { jobs, setJobs, setSelectedJob } = useJobStore();
  const { clear } = useCandidateStore();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Job Roles</h1>
          <p className="mt-1 text-sm text-white/50">Create and manage roles to screen candidates against.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus className="h-4 w-4" />
          {showForm ? 'Cancel' : 'New Role'}
        </button>
      </div>

      {/* Form */}
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
                <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-brand-400 transition-colors" />
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
    </div>
  );
}
