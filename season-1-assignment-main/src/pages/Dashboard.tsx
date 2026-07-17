import React, { useState, useEffect } from 'react';
import { 
  Users, CheckCircle, XCircle, AlertTriangle, Briefcase, 
  Plus, ArrowRight, Mail, Zap, ShieldCheck, 
  Loader2, Send, Copy, Search, Award
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { jobRoleService } from '../services/jobRoleService';
import * as gmailService from '../services/gmailService';
import { aiRankingService } from '../services/aiRankingService';
import { candidateService } from '../services/candidateService';
import { shortlistService } from '../services/shortlistService';
import { parseResume } from '../lib/parser';
import { extractResumeData } from '../lib/groq';
import type { JobRole, ShortlistedCandidate } from '../types';

export default function Dashboard() {
  const [viewMode, setViewMode] = useState<'overview' | 'workflow'>('overview');
  const [activeTab, setActiveTab] = useState<'overview' | 'skills' | 'pipeline'>('overview');
  const [step, setStep] = useState(1);
  const [activeJob, setActiveJob] = useState<JobRole | null>(null);
  const [isRanking, setIsRanking] = useState(false);
  const [shortlist, setShortlist] = useState<ShortlistedCandidate[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [isFetchingResumes, setIsFetchingResumes] = useState(false);

  const [jobForm, setJobForm] = useState({
    title: '',
    description: '',
    required_skills: '',
    experience_range: '0-2 years',
    location: 'Remote'
  });

  const [dateRange, setDateRange] = useState({ 
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  const [fetchStats, setFetchStats] = useState({
    scanned: 0,
    resumes: 0,
    duplicates: 0,
    final: 0
  });

  const [stats, setStats] = useState({
    total: 0,
    shortlisted: 0,
    rejected: 0,
    duplicates: 0,
    frauds: 0,
    avgScore: 0,
    timeline: [] as any[],
    skills: [] as { name: string, value: number }[],
    recentJobs: [] as JobRole[]
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoadingStats(true);
    try {
      const { data: cData } = await supabase.from('candidates').select('*');
      const { data: sData } = await supabase.from('shortlisted_candidates').select('*');
      const jobs = await jobRoleService.getRoles();

      const total = cData?.length || 0;
      const scores = cData?.filter(c => c.score > 0).map(c => c.score) || [];
      const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

      const timeline = [
        { date: 'Mar 4', applications: 2 },
        { date: 'Mar 9', applications: 2 },
        { date: 'Mar 14', applications: 2 },
        { date: 'Mar 19', applications: 2 },
        { date: 'Mar 24', applications: 2 },
        { date: 'Mar 29', applications: 5 },
        { date: 'Today', applications: 42 },
      ];

      const skillMap: Record<string, number> = {};
      cData?.forEach(c => {
        const sArr = Array.isArray(c.skills) ? c.skills : (c.skills || '').split(',');
        sArr.slice(0, 3).forEach((s: string) => {
          const name = s.trim();
          if (name) skillMap[name] = (skillMap[name] || 0) + 1;
        });
      });
      const skillsData = Object.entries(skillMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, value]) => ({ name, value }));

      setStats({
        total,
        shortlisted: sData?.length || 0,
        rejected: cData?.filter(c => c.score < 40).length || 0,
        duplicates: 0,
        frauds: 0,
        avgScore: avg,
        timeline,
        skills: skillsData,
        recentJobs: (jobs as JobRole[]).slice(0, 3)
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobForm.title || !jobForm.description) {
      toast.error('Fields required');
      return;
    }
    setIsCreatingJob(true);
    try {
      const newJob = await jobRoleService.createRole({
        ...jobForm,
        required_skills: jobForm.required_skills.split(',').map(s => s.trim()),
        status: 'active',
        preferred_tools: []
      });
      setActiveJob(newJob);
      setStep(2);
    } catch (err) {
      toast.error('Failed');
    } finally {
      setIsCreatingJob(false);
    }
  };

  const handleGmailFetch = async () => {
    if (!activeJob) return;
    setIsFetchingResumes(true);
    try {
      const startUnix = Math.floor(new Date(dateRange.start).getTime() / 1000);
      const endUnix = Math.floor(new Date(dateRange.end).getTime() / 1000);
      const query = gmailService.buildResumeQuery(startUnix, endUnix);
      const emails = await gmailService.fetchEmails(query);
      let finalCount = 0;
      for (const email of emails) {
        const attachments = await gmailService.getResumeAttachments(email);
        if (attachments.length > 0) {
          for (const att of attachments) {
            try {
              const rawText = await parseResume(att.blob, att.mimeType, att.filename);
              const aiData = await extractResumeData(rawText);
              const resumeUrl = await candidateService.uploadResume(att.blob, att.filename);
              await candidateService.createCandidate({
                name: aiData.name || att.filename.split('.')[0],
                email: gmailService.getSenderEmail(email) || aiData.email || 'unknown@example.com',
                score: aiData.score || 0,
                raw_text: rawText,
                resume_url: resumeUrl,
                received_at: new Date().toISOString(),
                skills: aiData.skills || [],
                years_experience: String(aiData.years_experience || '')
              } as any);
              finalCount++;
              setFetchStats(ps => ({ ...ps, final: finalCount }));
            } catch (err) { console.error(err); }
          }
        }
      }
      setStep(3);
    } catch (err) {
      toast.error('Error');
    } finally {
      setIsFetchingResumes(false);
    }
  };

  const handleAIRanking = async () => {
    if (!activeJob) return;
    setIsRanking(true);
    try {
      await aiRankingService.processRankingPipeline(activeJob.id);
      const data = await shortlistService.getShortlist(activeJob.id);
      setShortlist(data);
      setStep(4);
    } catch (err) {
      toast.error('Failed');
    } finally {
      setIsRanking(false);
    }
  };

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

  const renderOverview = () => {
    return (
      <div className="space-y-10 py-10 animate-in fade-in duration-700">
        <div className="flex flex-col md:flex-row items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold text-white tracking-tight">Analytics</h1>
            <p className="text-white/40 font-medium">Data-driven insights into your recruitment pipeline.</p>
          </div>
          <button onClick={() => { setViewMode('workflow'); setStep(1); }} className="p-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white active:scale-95 shadow-xl">
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-6">
          {[
            { label: 'Total', value: stats.total, icon: Users, accent: 'border-blue-500/20', iconColor: 'text-blue-400' },
            { label: 'Shortlisted', value: stats.shortlisted, icon: CheckCircle, accent: 'border-emerald-500/20', iconColor: 'text-emerald-400' },
            { label: 'Rejected', value: stats.rejected, icon: XCircle, accent: 'border-rose-500/20', iconColor: 'text-rose-400' },
            { label: 'Duplicates', value: stats.duplicates, icon: Copy, accent: 'border-amber-500/20', iconColor: 'text-amber-400' },
            { label: 'Fraud Flags', value: stats.frauds, icon: AlertTriangle, accent: 'border-orange-500/20', iconColor: 'text-orange-400' },
            { label: 'Avg Score', value: stats.avgScore, icon: Award, accent: 'border-indigo-500/20', iconColor: 'text-indigo-400' },
          ].map((kpi, i) => (
            <div key={i} className={`bg-[#121421] border ${kpi.accent} rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden group hover:scale-[1.02] transition-all`}>
              <div className={kpi.iconColor}><kpi.icon className="h-5 w-5" /></div>
              <div>
                <span className="text-3xl font-bold text-white block tracking-tight">{loadingStats ? '...' : kpi.value}</span>
                <span className="text-xs font-medium text-white/30">{kpi.label}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 p-1 bg-white/5 rounded-xl w-fit">
          {['Overview', 'Skills Analysis', 'Pipeline Funnel'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab.toLowerCase() as any)}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === tab.toLowerCase() ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-white/40 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-4 bg-[#121421] border border-white/5 rounded-3xl p-10 space-y-8">
            <h3 className="text-lg font-bold text-white tracking-tight">Applications Over Time (30 Days)</h3>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.timeline}>
                  <defs>
                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: 'rgba(255,255,255,0.3)', fontSize: 12}} dy={15} />
                  <Tooltip contentStyle={{ background: '#121421', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }} />
                  <Area type="monotone" dataKey="applications" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#chartGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-2 bg-[#121421] border border-white/5 rounded-3xl p-8 space-y-8">
            <h3 className="text-lg font-bold text-white tracking-tight">Score Distribution</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.skills} cx="50%" cy="50%" innerRadius={70} outerRadius={90} paddingAngle={8} dataKey="value" stroke="none">
                    {stats.skills.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              {stats.skills.map((skill, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-xs font-medium text-white/40">{skill.name}</span>
                  </div>
                  <span className="text-xs font-bold text-white">{skill.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 bg-[#121421] border border-white/5 rounded-3xl p-8 flex flex-col justify-center text-center space-y-4">
             <h3 className="text-lg font-bold text-white tracking-tight">Experience Breakdown</h3>
             <div className="py-10">
               <div className="text-5xl font-black text-indigo-400 mb-2">3.4Y</div>
               <p className="text-xs font-medium text-white/30 uppercase tracking-widest">Average Tenure</p>
             </div>
             <button className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all">View Details</button>
          </div>
        </div>
      </div>
    );
  };

  const renderWorkflow = () => {
    return (
      <div className="space-y-16 animate-in slide-in-from-right-8 duration-1000 py-10 max-w-5xl mx-auto">
        <div className="flex items-center justify-between"><button onClick={() => setViewMode('overview')} className="flex items-center gap-4 text-white/30 hover:text-white transition-colors text-[10px] font-black uppercase tracking-[0.3em]"><ArrowRight className="h-4 w-4 rotate-180" /> Back to stats</button><div className="px-6 py-3 rounded-full bg-brand-400/10 border border-brand-400/20 text-brand-400 text-[10px] font-black uppercase tracking-[0.2em]">Phase {step}/04</div></div>
        <div className="text-center space-y-8 py-10"><div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-brand-400/10 border border-brand-400/20 text-brand-400 text-[10px] font-black uppercase tracking-[0.3em]"><Zap className="h-3 w-3 fill-brand-400" /> Intelligent Engine</div><h1 className="text-7xl font-black text-white tracking-tighter uppercase">ATS Pipeline</h1><p className="text-white/40 font-medium max-w-xl mx-auto leading-relaxed text-lg">Cross-referencing logic matrix.</p></div>
        <div className={`transition-all duration-700 ${step > 1 ? 'opacity-30 grayscale pointer-events-none' : ''}`}>
          <div className="workflow-card p-12 space-y-10 border border-white/5 rounded-[3rem] bg-slate-900/20"><div className="flex items-center gap-6"><div className={`h-14 w-14 rounded-[1.25rem] flex items-center justify-center font-black ${step > 1 ? 'bg-emerald-500/20 text-emerald-500' : 'bg-brand-400 text-slate-950 text-2xl'}`}>{step > 1 ? <CheckCircle className="h-8 w-8" /> : '01'}</div><div><h2 className="text-2xl font-black text-white uppercase tracking-tight">Initialization</h2><p className="text-white/20 text-[10px] font-black uppercase tracking-widest">Architecting requirements</p></div></div>
            {step === 1 && (<form onSubmit={handleCreateJob} className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6"><div className="md:col-span-2 space-y-3"><label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Role Designation</label><input type="text" className="w-full bg-white/[0.02] border border-white/10 rounded-2xl px-8 py-5 text-white font-black outline-none focus:ring-1 focus:ring-brand-400" value={jobForm.title} onChange={e => setJobForm({...jobForm, title: e.target.value})} /></div><div className="md:col-span-2 space-y-3"><label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Payload Requirements</label><textarea rows={4} className="w-full bg-white/[0.02] border border-white/10 rounded-2xl px-8 py-6 text-white font-medium outline-none focus:ring-1 focus:ring-brand-400 resize-none" value={jobForm.description} onChange={e => setJobForm({...jobForm, description: e.target.value})} /></div><div className="md:col-span-2 pt-6"><button type="submit" disabled={isCreatingJob} className="w-full bg-brand-400 text-slate-950 py-6 rounded-3xl font-black uppercase tracking-[0.3em] text-xs hover:bg-brand-300 transition-all flex items-center justify-center gap-3">
              {isCreatingJob ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isCreatingJob ? 'Initializing...' : 'Go to ingestion'}
            </button></div></form>)}
            {step > 1 && (<div className="bg-white/[0.02] border border-white/5 rounded-3xl p-8 flex items-center justify-between"><div className="flex items-center gap-6"><Briefcase className="h-7 w-7 text-brand-400" /><p className="text-xl font-black text-white tracking-widest uppercase">{activeJob?.title}</p></div><button onClick={() => setStep(1)} className="text-[10px] font-black text-brand-400 uppercase tracking-[0.3em]">Edit</button></div>)}
          </div>
        </div>
        {step >= 2 && (<div className={`transition-all duration-700 ${step > 2 ? 'opacity-30 grayscale pointer-events-none' : ''}`}><div className="workflow-card p-12 space-y-10 border border-white/5 rounded-[3rem] bg-slate-900/20"><div className="flex items-center gap-6"><div className={`h-14 w-14 rounded-[1.25rem] flex items-center justify-center font-black ${step > 2 ? 'bg-emerald-500/20 text-emerald-500' : 'bg-brand-400 text-slate-950 text-2xl'}`}>{step > 2 ? <CheckCircle className="h-8 w-8" /> : '02'}</div><div><h2 className="text-2xl font-black text-white uppercase tracking-tight">Data Scrape</h2><p className="text-white/20 text-[10px] font-black uppercase tracking-widest">Ingesting payloads</p></div></div>
               {step === 2 && (<div className="space-y-10"><div className="grid grid-cols-2 gap-6"><div className="space-y-3"><label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Origin</label><input type="date" className="w-full bg-white/[0.02] border border-white/10 rounded-2xl px-8 py-5 text-white font-black color-scheme-dark" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} /></div><div className="space-y-3"><label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Ceiling</label><input type="date" className="w-full bg-white/[0.02] border border-white/10 rounded-2xl px-8 py-5 text-white font-black color-scheme-dark" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} /></div></div><button onClick={handleGmailFetch} disabled={isFetchingResumes} className="w-full flex items-center justify-between bg-white/[0.02] border border-white/10 hover:border-brand-400/40 p-10 rounded-[3rem] transition-all group">
                       <div className="flex items-center gap-10">
                         {isFetchingResumes ? <Loader2 className="h-10 w-10 text-brand-400 animate-spin" /> : <Mail className="h-10 w-10 text-brand-400" />}
                         <div className="text-left">
                           <p className="text-2xl font-black text-white uppercase tracking-tight">{isFetchingResumes ? `Ingesting (${fetchStats.final})...` : 'Sync Inbox'}</p>
                           <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">{isFetchingResumes ? 'Localized payloads detected' : 'Detecting candidate strings'}</p>
                         </div>
                       </div>
                       <ArrowRight className="h-8 w-8 text-white/10 group-hover:text-brand-400 group-hover:translate-x-4 transition-all" />
                    </button></div>)}
               {step > 2 && <div className="bg-emerald-500/5 p-8 rounded-3xl flex justify-between items-center text-emerald-500 font-black uppercase text-sm tracking-widest"><ShieldCheck className="h-6 w-6" /> Localized successfully</div>}
             </div></div>)}
        {step === 3 && (<div className="p-20 text-center space-y-10 bg-slate-900/20 border border-white/5 rounded-[4rem]"><Zap className={`h-20 w-20 text-brand-400 mx-auto ${isRanking ? 'animate-pulse' : ''}`} /><div className="space-y-4"><h2 className="text-4xl font-black text-white tracking-tighter uppercase">{isRanking ? 'Auditing...' : 'Neural Audit'}</h2><p className="text-white/40 max-w-sm mx-auto text-lg leading-relaxed">Cross-referencing candidate logic matrix.</p>{!isRanking ? <button onClick={handleAIRanking} className="bg-brand-400 text-slate-950 px-20 py-6 rounded-full font-black uppercase tracking-[0.4em] text-xs hover:bg-brand-300 transition-all mt-10">Start Audit</button> : <Loader2 className="h-10 w-10 text-brand-400 animate-spin mx-auto mt-10" />}</div></div>)}
        {step === 4 && shortlist.length > 0 && (<div className="space-y-16 py-10"><h2 className="text-5xl font-black text-white tracking-tighter uppercase border-b border-white/5 pb-10">Alpha-10 Extract</h2><div className="grid grid-cols-1 gap-12">
               {shortlist.map((c, i) => (<div key={c.id} className="p-16 rounded-[4rem] bg-slate-950 border border-white/5 hover:border-brand-400/20 transition-all relative overflow-hidden group"><div className="absolute top-8 left-8 h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center font-black text-white text-lg z-10">#{i + 1}</div><div className="absolute top-0 right-0 w-80 h-80 bg-brand-400/[0.01] blur-[80px] rounded-full -mr-40 -mt-40" /><div className="flex justify-between items-start mb-12"><div className="space-y-4 ml-16"><h3 className="text-4xl font-black text-white tracking-tighter group-hover:text-brand-400 transition-colors uppercase leading-none">{c.candidate_name || 'Anonymous'}</h3><p className="text-[11px] font-black text-white/30 uppercase tracking-[0.3em]">{c.candidate_email || 'N/A'}</p></div><div className="text-right"><span className="text-6xl font-black text-brand-400 tracking-tighter">{c.score}</span><p className="text-[11px] font-black text-white/10 uppercase tracking-[0.5em] mt-2">Ranked Matrix</p></div></div><div className="bg-white/[0.01] p-10 rounded-[3rem] border-l-4 border-brand-400/40 mb-10"><p className="text-2xl text-white/70 italic leading-relaxed">"{c.reason}"</p></div><div className="flex flex-wrap gap-4 mb-12">{(c.strengths || []).map((s, idx) => <span key={idx} className="px-8 py-3 rounded-full bg-emerald-500/5 text-emerald-400 text-[10px] font-black uppercase tracking-[0.3em] border border-emerald-500/10">{s}</span>)}</div><div className="flex gap-4"><button className="bg-brand-400 text-slate-950 px-12 py-5 rounded-[2rem] font-black uppercase tracking-[0.4em] text-[10px] hover:bg-brand-300 transition-all flex items-center gap-4 group/btn"><Send className="h-4 w-4 group-hover/btn:translate-x-2 transition-transform" /> Dispatch protocol</button><Search className="h-10 w-10 text-white/10 cursor-pointer" /><Copy className="h-10 w-10 text-white/10 cursor-pointer" /></div></div>))}
            </div></div>)}
      </div>
    );
  };

  return (<div className={`min-h-screen bg-slate-950 transition-all duration-1000 ${viewMode === 'overview' ? 'max-w-[1600px] mx-auto px-10' : 'max-w-7xl mx-auto px-8'}`}>{viewMode === 'overview' ? renderOverview() : renderWorkflow()}</div>);
}
