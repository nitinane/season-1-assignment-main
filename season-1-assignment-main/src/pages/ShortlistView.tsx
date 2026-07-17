import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Award, Mail, Phone, Calendar, Loader2, CheckCircle2, 
  AlertCircle, ArrowRight, ExternalLink, Send, ShieldAlert, 
  MessageSquare, ChevronDown, User, Zap, Target
} from 'lucide-react';
import { jobRoleService } from '../services/jobRoleService';
import { shortlistService } from '../services/shortlistService';
import { sendShortlistEmail } from '../services/mailService';
import { fraudService } from '../services/fraudService';
import type { JobRole, ShortlistedCandidate } from '../types';
import toast from 'react-hot-toast';

export default function ShortlistView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>(searchParams.get('role') || '');
  const [shortlist, setShortlist] = useState<ShortlistedCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    jobRoleService.getRoles()
      .then(data => {
        setRoles(data);
        // If a role was passed in URL, fetch it immediately
        const roleId = searchParams.get('role');
        if (roleId) {
          fetchShortlist(roleId);
        }
      })
      .catch(console.error);
  }, []);

  const fetchShortlist = async (roleId: string) => {
    setLoading(true);
    try {
      const data = await shortlistService.getShortlist(roleId);
      setShortlist(data);
    } catch (error) {
      toast.error('Failed to fetch shortlist');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedRole(id);
    if (id) {
      fetchShortlist(id);
      // Update URL without refresh
      const newParams = new URLSearchParams(window.location.search);
      newParams.set('role', id);
      window.history.replaceState(null, '', `?${newParams.toString()}`);
    } else {
      setShortlist([]);
    }
  };

  const handleSendFollowUp = async (candidateId: string, email: string, name: string) => {
    const roleTitle = roles.find(r => r.id === selectedRole)?.title || 'Position';
    setActionLoading(`email-${candidateId}`);
    try {
      const ok = await sendShortlistEmail(email, name, roleTitle, 'HR Team', 'hiring@hireflow.ai');
      if (ok) toast.success(`Follow-up sent to ${name}`);
      else throw new Error('Mail server error');
    } catch (err) {
      toast.error('Failed to send follow-up');
    } finally {
      setActionLoading(null);
    }
  };

  const handleFlagFraud = async (candidateId: string, resumeText: string) => {
    setActionLoading(`fraud-${candidateId}`);
    try {
      await fraudService.runFraudAnalysis(candidateId, resumeText || 'Manual flag from shortlist');
      toast.success('Candidate flagged for fraud review');
    } catch (err) {
      toast.error('Failed to flag candidate');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-2 border-b border-white/5">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-brand-400/20 flex items-center justify-center">
              <Target className="h-7 w-7 text-brand-400" />
            </div>
            <h1 className="text-4xl font-bold text-white tracking-tighter">AI Top 10 Shortlist</h1>
          </div>
          <p className="text-white/40 font-medium max-w-xl">
            Our high-precision AI engine has analyzed all applicants against your job roles. 
            Below are the top 10 candidates who best match your requirements.
          </p>
        </div>
        
        <div className="w-full lg:w-72 space-y-2">
          <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] px-1">Select Target Role</label>
          <div className="relative group">
            <select
              value={selectedRole}
              onChange={handleRoleChange}
              className="w-full bg-slate-900 border border-white/10 group-hover:border-brand-400/50 rounded-2xl px-5 py-4 text-white font-bold focus:ring-2 focus:ring-brand-400 outline-none transition-all appearance-none cursor-pointer shadow-xl shadow-black/40"
            >
              <option value="" className="bg-slate-950">Select Job Role...</option>
              {roles.map(role => (
                <option key={role.id} value={role.id} className="bg-slate-950">{role.title}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-white/20 group-hover:text-brand-400 h-5 w-5 transition-colors" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col h-96 items-center justify-center gap-4">
          <div className="relative">
             <div className="absolute inset-0 bg-brand-400/20 blur-2xl rounded-full animate-pulse" />
             <Loader2 className="h-12 w-12 text-brand-400 animate-spin relative" />
          </div>
          <p className="text-sm font-bold text-white/30 uppercase tracking-widest animate-pulse">Consulting AI Knowledge Base...</p>
        </div>
      ) : shortlist.length === 0 ? (
        <div className="bg-white/[0.01] border border-white/5 rounded-[3rem] p-32 flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in zoom-in-95 duration-700">
          <div className="relative">
            <div className="absolute inset-0 bg-brand-400/10 blur-3xl rounded-full" />
            <div className="h-24 w-24 rounded-3xl bg-brand-400/10 flex items-center justify-center border border-brand-400/20">
              <Award className="h-12 w-12 text-brand-400 opacity-40" />
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="text-3xl font-bold text-white tracking-tight">No results yet.</h3>
            <p className="text-white/30 max-w-sm font-medium leading-relaxed">
              Select a job role from the dropdown above to view the AI-ranked top candidates, or go to the upload section to process new resumes.
            </p>
          </div>
          <button 
            onClick={() => navigate('/upload')}
            className="btn-primary"
          >
            Go to Upload Center <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-12">
          {shortlist.map((candidateEntry, index) => {
            const isTop3 = index < 3;

            return (
              <div 
                key={candidateEntry.id} 
                className="relative group animate-in slide-in-from-bottom-8 duration-700 fill-mode-both"
                style={{ animationDelay: `${index * 150}ms` }}
              >
                {/* Rank Floating Badge */}
                <div className={`absolute -left-4 -top-4 z-20 h-16 w-16 rounded-2xl flex items-center justify-center font-black text-2xl shadow-2xl transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6 ${
                  index === 0 ? 'bg-amber-400 text-slate-950 rotate-[-8deg] shadow-amber-400/40' :
                  index === 1 ? 'bg-slate-300 text-slate-950 rotate-[-4deg] shadow-slate-300/30' :
                  index === 2 ? 'bg-orange-400 text-slate-950 rotate-[-2deg] shadow-orange-400/30' :
                  'bg-slate-800 text-white shadow-black/50'
                }`}>
                  <span className="text-xs absolute top-2 left-3 opacity-40">RANK</span>
                  #{index + 1}
                </div>

                <div className={`relative overflow-hidden bg-slate-950 border rounded-[2.5rem] transition-all duration-500 ${
                  isTop3 ? 'border-brand-400/30 shadow-2xl shadow-brand-400/10' : 'border-white/10 hover:border-white/20'
                }`}>
                  {/* Glass Background Accents */}
                  <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-brand-400/[0.02] to-transparent pointer-events-none" />
                  
                  <div className="p-8 lg:p-12 flex flex-col lg:flex-row gap-12 relative z-10">
                    
                    {/* LEFT COLUMN: Profile & Stats */}
                    <div className="lg:w-1/3 flex flex-col gap-8">
                       <div className="flex items-start gap-6">
                          <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-white/10 to-transparent border border-white/10 flex items-center justify-center text-4xl font-bold text-white shadow-inner group-hover:scale-105 transition-transform duration-500">
                            {candidateEntry.candidate?.name?.charAt(0) || <User className="h-10 w-10 text-white/20" />}
                          </div>
                          <div className="space-y-1 pt-2">
                             <h3 className="text-3xl font-bold text-white tracking-tight group-hover:text-brand-300 transition-colors">
                               {candidateEntry.candidate_name || candidateEntry.candidate?.name}
                             </h3>
                             <div className="flex items-center gap-2">
                                <Zap className="h-4 w-4 text-brand-400 fill-brand-400" />
                                <span className="text-lg font-black text-brand-400 tracking-tight">{candidateEntry.score}/100 <span className="text-xs font-bold text-white/40 ml-1">MATCH SCORE</span></span>
                             </div>
                          </div>
                       </div>

                       <div className="space-y-4 pt-4 border-t border-white/5">
                          <div className="flex items-center gap-3 text-sm font-medium text-white/50 group-hover:text-white/80 transition-colors">
                            <Mail className="h-4 w-4 text-brand-400" />
                            {candidateEntry.candidate_email || candidateEntry.candidate?.email}
                          </div>
                          {candidateEntry.candidate?.phone && (
                            <div className="flex items-center gap-3 text-sm font-medium text-white/50">
                              <Phone className="h-4 w-4 text-brand-400" />
                              {candidateEntry.candidate.phone}
                            </div>
                          )}
                          <div className="flex items-center gap-3 text-sm font-medium text-white/50">
                            <Calendar className="h-4 w-4 text-brand-400" />
                            Imported {new Date(candidateEntry.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                          </div>
                       </div>

                       {/* Interactive Actions Grid */}
                       <div className="grid grid-cols-2 gap-3 pt-4">
                          <a 
                            href={candidateEntry.candidate?.resume_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-brand-400 hover:text-slate-950 transition-all font-bold text-xs"
                          >
                             <ExternalLink className="h-3 w-3" /> View Resume
                          </a>
                          <button 
                            onClick={() => handleSendFollowUp(candidateEntry.candidate_id, candidateEntry.candidate?.email || candidateEntry.candidate_email || '', candidateEntry.candidate_name || candidateEntry.candidate?.name || 'Candidate')}
                            disabled={actionLoading === `email-${candidateEntry.candidate_id}`}
                            className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-brand-400/10 border border-brand-400/20 text-brand-400 hover:bg-brand-400 hover:text-slate-950 transition-all font-bold text-xs disabled:opacity-50"
                          >
                            {actionLoading === `email-${candidateEntry.candidate_id}` ? (
                               <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                               <Send className="h-3 w-3" />
                            )}
                            Follow-Up
                          </button>
                          <button 
                             onClick={() => handleFlagFraud(candidateEntry.candidate_id, candidateEntry.resume_text || '')}
                             disabled={actionLoading === `fraud-${candidateEntry.candidate_id}`}
                             className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-red-500/5 border border-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all font-bold text-xs disabled:opacity-50"
                          >
                             <ShieldAlert className="h-3.5 w-3.5" /> Fraud Flag
                          </button>
                          <button className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 hover:border-brand-400/30 text-white/40 hover:text-white transition-all font-bold text-xs">
                             <MessageSquare className="h-3.5 w-3.5" /> Add Note
                          </button>
                       </div>
                    </div>

                    {/* RIGHT COLUMN: AI Intelligence & Skills */}
                    <div className="lg:w-2/3 flex flex-col gap-10">
                       
                       {/* Top Section: Summary & Recommendation */}
                       <div className="space-y-4">
                          <label className="text-[10px] font-bold text-brand-400 uppercase tracking-widest flex items-center gap-2">
                             <Zap className="h-3 w-3" /> AI Comprehensive Analysis
                          </label>
                          <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 lg:p-8 space-y-4 relative overflow-hidden backdrop-blur-sm">
                             <div className="absolute top-0 left-0 w-1 h-full bg-brand-400/40" />
                             <p className="text-lg text-white font-medium italic leading-relaxed">
                               "{candidateEntry.reason || "The AI evaluates this candidate as a high-potential fit based on depth of experience and technical alignment."}"
                             </p>
                             
                             <div className="flex flex-wrap items-center gap-4 pt-4 mt-2 border-t border-white/5">
                               <div className="px-4 py-2 rounded-2xl bg-brand-400/5 border border-brand-400/20 flex flex-col">
                                 <span className="text-[10px] font-bold text-brand-400 uppercase tracking-tighter">Experience</span>
                                 <span className="text-sm font-black text-white">{candidateEntry.candidate?.years_experience || '3+ Years'}</span>
                               </div>
                               <div className="px-4 py-2 rounded-2xl bg-blue-400/5 border border-blue-400/20 flex flex-col">
                                 <span className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">Education</span>
                                 <span className="text-sm font-black text-white">{candidateEntry.candidate?.education || 'Degree Holder'}</span>
                               </div>
                             </div>

                             {candidateEntry.candidate?.summary && (
                               <p className="text-sm text-white/60 leading-relaxed max-w-3xl pt-2">
                                 {candidateEntry.candidate.summary}
                               </p>
                             )}
                          </div>
                       </div>

                       {/* Middle Section: Skills & Tools Chips */}
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-4">
                             <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                               Core Expertise
                             </label>
                             <div className="flex flex-wrap gap-2">
                                {candidateEntry.candidate?.skills && candidateEntry.candidate.skills.length > 0 ? (
                                  candidateEntry.candidate.skills.map((skill: string, i: number) => (
                                    <span key={i} className="px-3 py-1.5 rounded-xl bg-brand-400/10 text-brand-300 text-[11px] font-bold border border-brand-400/10">
                                      {skill}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-white/20 italic">No skills extracted</span>
                                )}
                             </div>
                          </div>
                          <div className="space-y-4">
                             <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                               Tooling & Ecosystem
                             </label>
                             <div className="flex flex-wrap gap-2">
                                {candidateEntry.candidate?.tech_stack && candidateEntry.candidate.tech_stack.length > 0 ? (
                                  candidateEntry.candidate.tech_stack.map((tool: string, i: number) => (
                                    <span key={i} className="px-3 py-1.5 rounded-xl bg-emerald-400/10 text-emerald-300 text-[11px] font-bold border border-emerald-400/10">
                                      {tool}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-white/20 italic">No tools extracted</span>
                                )}
                             </div>
                          </div>
                       </div>

                       {/* Bottom Section: Strengths & Weaknesses */}
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/[0.01] border border-white/5 rounded-3xl p-6">
                         <div className="space-y-4">
                           <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase tracking-widest text-[10px]">
                             <CheckCircle2 className="h-3.5 w-3.5" /> High-Confidence Strengths
                           </div>
                           <div className="space-y-3">
                             {(candidateEntry.strengths || []).length > 0 ? (
                                candidateEntry.strengths.slice(0, 3).map((s, i) => (
                                   <div key={i} className="flex items-start gap-3 text-sm text-white/60">
                                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0 shadow-[0_0_8px_#10b981]" />
                                      {s}
                                   </div>
                                ))
                             ) : (
                                <p className="text-xs text-white/20">Automatic strength discovery in progress...</p>
                             )}
                           </div>
                         </div>

                         <div className="space-y-4 border-l border-white/5 pl-6 md:pl-0 md:border-l-0 md:border-t md:pt-6 lg:border-t-0 lg:pt-0 lg:border-l lg:pl-6">
                           <div className="flex items-center gap-2 text-amber-400 font-bold uppercase tracking-widest text-[10px]">
                             <AlertCircle className="h-3.5 w-3.5" /> Notable Concerns
                           </div>
                           <div className="space-y-3">
                             {(candidateEntry.weaknesses || []).length > 0 ? (
                                candidateEntry.weaknesses.slice(0, 3).map((w, i) => (
                                   <div key={i} className="flex items-start gap-3 text-sm text-white/40">
                                      <div className="h-1.5 w-1.5 rounded-full bg-amber-500/40 mt-1.5 shrink-0" />
                                      {w}
                                   </div>
                                ))
                             ) : (
                                <p className="text-xs text-white/20 italic">No major risks identified by AI.</p>
                             )}
                           </div>
                         </div>
                       </div>

                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
