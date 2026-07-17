import React, { useState, useEffect } from 'react';
import { Mail, Clock, Loader2, ArrowUpRight, Search, CheckCircle2 } from 'lucide-react';
import { followUpService } from '../services/followUpService';
import { jobRoleService } from '../services/jobRoleService';
import { candidateService } from '../services/candidateService';
import type { JobRole, Candidate, SentEmail } from '../types';
import toast from 'react-hot-toast';

export default function FollowUpTracker() {
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<string>('');
  const [history, setHistory] = useState<SentEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingHistory, setFetchingHistory] = useState(false);

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

  const fetchHistory = async (candidateId: string) => {
    setFetchingHistory(true);
    try {
      const data = await followUpService.getFollowUpHistory(candidateId);
      setHistory(data);
    } catch (error) {
      toast.error('Failed to fetch history');
    } finally {
      setFetchingHistory(false);
    }
  };

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedRole(id);
    setSelectedCandidate('');
    setHistory([]);
    if (id) fetchCandidates(id);
    else setCandidates([]);
  };

  const handleCandidateChange = (id: string) => {
    setSelectedCandidate(id);
    if (id) fetchHistory(id);
    else setHistory([]);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-white tracking-tight">Follow-Up Tracker</h1>
          <p className="text-white/60">Monitor and manage all candidate communications for your job roles.</p>
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
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Candidate Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between px-2">
             <h3 className="text-sm font-semibold text-white/50 uppercase tracking-widest">Candidates</h3>
             <div className="text-[10px] text-brand-400 font-bold bg-brand-400/10 px-2 py-0.5 rounded border border-brand-400/20">
               {candidates.length} Found
             </div>
          </div>
          
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {loading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-6 w-6 text-brand-400 animate-spin" />
              </div>
            ) : candidates.length === 0 ? (
               <div className="p-8 text-center bg-white/[0.02] border border-white/10 rounded-2xl">
                 <p className="text-xs text-white/20">No candidates available</p>
               </div>
            ) : (
              candidates.map(candidate => (
                <button
                  key={candidate.id}
                  onClick={() => handleCandidateChange(candidate.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all duration-300 ${
                    selectedCandidate === candidate.id
                      ? 'bg-brand-400/10 border-brand-400/50 shadow-lg shadow-brand-400/5'
                      : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold border ${
                      selectedCandidate === candidate.id 
                        ? 'bg-brand-400 text-slate-950 border-brand-400' 
                        : 'bg-white/5 text-white/40 border-white/10'
                    }`}>
                      {candidate.name?.charAt(0) || 'U'}
                    </div>
                    <div className="space-y-0.5 overflow-hidden">
                      <p className={`text-sm font-medium truncate ${selectedCandidate === candidate.id ? 'text-white' : 'text-white/80'}`}>
                        {candidate.name}
                      </p>
                      <p className="text-[10px] text-white/30 truncate uppercase tracking-widest tracking-tighter">
                        {candidate.email}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* History Timeline */}
        <div className="lg:col-span-3">
          <div className="bg-white/[0.02] border border-white/10 rounded-3xl h-full flex flex-col">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-3">
                <Clock className="h-5 w-5 text-brand-400" />
                Communication Logs
              </h3>
              {selectedCandidate && (
                <button className="flex items-center gap-2 text-xs font-bold text-brand-400 hover:text-brand-300 transition-colors uppercase tracking-widest">
                  Compose Email
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="flex-1 p-8">
              {!selectedCandidate ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                  <div className="h-16 w-16 rounded-3xl bg-white/5 flex items-center justify-center">
                    <Search className="h-8 w-8 text-white/10" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-white/40 font-medium">No candidate selected</p>
                    <p className="text-xs text-white/20">Select a candidate from the sidebar to view their history.</p>
                  </div>
                </div>
              ) : fetchingHistory ? (
                <div className="h-full flex items-center justify-center">
                   <Loader2 className="h-8 w-8 text-brand-400 animate-spin" />
                </div>
              ) : history.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                  <div className="h-16 w-16 rounded-3xl bg-white/5 flex items-center justify-center">
                    <Mail className="h-8 w-8 text-white/10" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-white/40 font-medium">No interaction history</p>
                    <p className="text-xs text-white/20">All outbound emails sent to this candidate will appear here.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-8 relative">
                  <div className="absolute left-6 top-0 bottom-0 w-px bg-white/5" />
                  
                  {history.map((log) => (
                    <div key={log.id} className="relative pl-12 group">
                      <div className="absolute left-4 top-1 h-4 w-4 rounded-full border-4 border-slate-950 bg-brand-400 shadow-lg shadow-brand-400/40 group-hover:scale-125 transition-transform duration-300" />
                      
                      <div className="bg-white/[0.03] border border-white/5 hover:border-white/10 rounded-2xl p-6 transition-all duration-300 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest bg-white/10 px-2 py-0.5 rounded">
                              {log.status}
                            </span>
                            <span className="text-xs text-white/20 font-medium">
                              {new Date(log.sent_at || '').toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                             <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          </div>
                        </div>

                        <div className="space-y-2">
                           <h4 className="text-white font-semibold">Follow-Up Email</h4>
                           <div className="text-sm text-white/50 leading-relaxed max-height-[200px] overflow-y-auto whitespace-pre-wrap pr-4">
                             {log.email_body}
                           </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="flex justify-center pt-8">
                     <button className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-white/80 hover:bg-white/10 transition-all uppercase tracking-widest">
                       Load more history
                     </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
