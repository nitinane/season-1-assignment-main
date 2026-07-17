import React, { useState, useEffect } from 'react';
import { Loader2, Award, Zap, AlertCircle, CheckCircle2, User } from 'lucide-react';
import { jobRoleService } from '../services/jobRoleService';
import { candidateService } from '../services/candidateService';
import { bulkScoreCandidates } from '../lib/groq';
import { shortlistService } from '../services/shortlistService';
import type { JobRole, Candidate, AIScoreResult } from '../types';
import toast from 'react-hot-toast';

export default function RankingView() {
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [ranking, setRanking] = useState(false);
  const [results, setResults] = useState<AIScoreResult[]>([]);

  useEffect(() => {
    jobRoleService.getRoles().then(setRoles).catch(console.error);
  }, []);

  const fetchCandidates = async (_roleId: string) => {
    setLoading(true);
    try {
      const data = await candidateService.getCandidates();
      setCandidates(data);
    } catch (error) {
      toast.error('Failed to fetch candidates');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedRole(id);
    if (id) fetchCandidates(id);
    else setCandidates([]);
  };

  const runRanking = async () => {
    if (!selectedRole || candidates.length === 0) return;
    
    setRanking(true);
    try {
      const role = roles.find(r => r.id === selectedRole);
      const scores = await bulkScoreCandidates(candidates.map(c => ({
        name: c.name,
        email: c.email,
        phone: c.phone,
        rawText: c.raw_text,
        candidate_id: c.id
      })), role);
      
      setResults(scores);
      
      // Persist Top 10 to shortlist
      await shortlistService.persistShortlist(selectedRole, scores.map(s => ({
        ...s,
        candidate_id: (scores.find(res => res.email === s.email) as any)?.candidate_id
      })));
      
      toast.success('AI Analysis & Ranking Complete!');
    } catch (error) {
      console.error('Ranking failed:', error);
      toast.error('AI Analysis failed. Please try again.');
    } finally {
      setRanking(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-white tracking-tight">AI Candidate Analysis</h1>
          <p className="text-white/60">Compare and rank all candidates for a specific job role using LLM intelligence.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select
            value={selectedRole}
            onChange={handleRoleChange}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-400 outline-none transition-all text-sm min-w-[200px]"
          >
            <option value="">Select Job Role...</option>
            {roles.map(role => (
              <option key={role.id} value={role.id}>{role.title}</option>
            ))}
          </select>
          
          <button
            onClick={runRanking}
            disabled={ranking || candidates.length === 0}
            className={`flex items-center gap-2 rounded-xl px-6 py-2.5 font-semibold text-sm transition-all duration-300 ${
              ranking || candidates.length === 0
                ? 'bg-white/5 text-white/20 cursor-not-allowed'
                : 'bg-brand-400 text-slate-950 hover:bg-brand-300 shadow-lg shadow-brand-400/20 active:scale-[0.98]'
            }`}
          >
            {ranking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {ranking ? 'Analyzing...' : 'Run AI Ranking'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 text-brand-400 animate-spin" />
        </div>
      ) : candidates.length === 0 ? (
        <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-20 flex flex-col items-center justify-center text-center space-y-4">
          <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center">
            <User className="h-10 w-10 text-white/20" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-white">No candidates found</h3>
            <p className="text-white/40 max-w-sm">Please select a role that has candidates or upload new resumes to begin analysis.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-lg font-semibold text-white/80">Candidates ({candidates.length})</h2>
              <div className="flex items-center gap-2 text-xs text-white/40 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                <CheckCircle2 className="h-3 w-3 text-brand-400" />
                Raw Data Extraction Active
              </div>
            </div>
            
            <div className="space-y-3">
              {candidates.map((candidate) => (
                <div key={candidate.id} className="group bg-white/[0.02] hover:bg-white/[0.04] border border-white/10 hover:border-brand-400/30 rounded-2xl p-5 transition-all duration-300">
                  <div className="flex items-start justify-between">
                    <div className="flex gap-4">
                      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-brand-400/20 to-brand-400/5 flex items-center justify-center text-brand-400 font-bold border border-brand-400/10">
                        {candidate.name.charAt(0)}
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-white font-medium group-hover:text-brand-300 transition-colors">{candidate.name}</h4>
                        <p className="text-xs text-white/40">{candidate.email}</p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {candidate.skills.slice(0, 5).map((skill, j) => (
                            <span key={j} className="text-[10px] uppercase tracking-wider font-bold bg-white/5 text-white/60 px-2 py-0.5 rounded border border-white/5">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {results.find(r => r.email === candidate.email) && (
                      <div className="flex flex-col items-end gap-2">
                        <div className="text-2xl font-bold text-brand-400">
                          {results.find(r => r.email === candidate.email)?.score}%
                        </div>
                        <span className="text-[10px] text-brand-400/60 font-bold uppercase tracking-widest">AI Rank #{results.findIndex(r => r.email === candidate.email) + 1}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 rounded-3xl p-8 space-y-8 sticky top-8">
              <div className="space-y-4">
                <div className="h-12 w-12 rounded-2xl bg-brand-400/10 flex items-center justify-center">
                  <Award className="h-6 w-6 text-brand-400" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-white">Ranking Engine</h3>
                  <p className="text-sm text-white/50 leading-relaxed">
                    Our AI compares every candidate against the job role requirements, preferred tools, and experience levels to find the perfect fit.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-brand-400" />
                  </div>
                  <span className="text-sm text-white/70">Skill Match Evaluation</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-brand-400" />
                  </div>
                  <span className="text-sm text-white/70">Experience Alignment</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-brand-400" />
                  </div>
                  <span className="text-sm text-white/70">Project Quality Analysis</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-brand-400" />
                  </div>
                  <span className="text-sm text-white/70">Automated Shortlisting</span>
                </div>
              </div>

              {!results.length ? (
                <div className="p-4 rounded-2xl bg-brand-400/5 border border-brand-400/10 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-brand-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-brand-400/80 leading-relaxed">
                    Click "Run AI Ranking" to start the analysis process. This will evaluate all {candidates.length} candidates.
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-500/80 leading-relaxed">
                    AI Ranking complete. Top 10 candidates have been automatically moved to the Shortlist dashboard.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
