import React, { useState, useEffect } from 'react';
import { ShieldAlert, AlertCircle, AlertTriangle, CheckCircle2, User, Loader2, Info } from 'lucide-react';
import { fraudService } from '../services/fraudService';
import { jobRoleService } from '../services/jobRoleService';
import type { JobRole } from '../types';
import toast from 'react-hot-toast';

export default function FraudDashboard() {
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    jobRoleService.getRoles().then(setRoles).catch(console.error);
  }, []);

  const fetchFlags = async (roleId: string) => {
    setLoading(true);
    try {
      const data = await fraudService.getFraudFlags(roleId);
      setFlags(data || []);
    } catch (error) {
      toast.error('Failed to fetch fraud flags');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedRole(id);
    if (id) fetchFlags(id);
    else setFlags([]);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-white tracking-tight">Fraud & Duplicate Flags</h1>
          <p className="text-white/60">Identify suspicious submissions and duplicate applications for your job roles.</p>
        </div>
        
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

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 text-brand-400 animate-spin" />
        </div>
      ) : flags.length === 0 ? (
        <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-20 flex flex-col items-center justify-center text-center space-y-4">
          <div className="h-20 w-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-white">No security risks found</h3>
            <p className="text-white/40 max-w-sm">All candidates for this role seem legitimate and unique so far.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {flags.map((flag) => (
            <div key={flag.id} className="bg-white/[0.02] hover:bg-white/[0.04] border border-white/10 hover:border-red-500/30 rounded-3xl p-6 transition-all duration-300 space-y-6">
              <div className="flex items-center justify-between">
                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/10 ${
                  flag.risk_level === 'high' ? 'bg-red-500/20 text-red-400' :
                  flag.risk_level === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-white/5 text-white/40'
                }`}>
                  {flag.risk_level} Risk
                </div>
                <ShieldAlert className={`h-5 w-5 ${
                  flag.risk_level === 'high' ? 'text-red-400' :
                  flag.risk_level === 'medium' ? 'text-amber-400' :
                  'text-white/20'
                }`} />
              </div>

              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-white/5 flex items-center justify-center text-white/20">
                  <User className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-white font-medium truncate max-w-[150px]">
                    {flag.candidates?.name || 'Unknown Candidate'}
                  </h4>
                  <p className="text-xs text-white/40 truncate max-w-[150px]">{flag.candidates?.email}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-white/80 font-bold uppercase tracking-widest text-[10px]">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  Risk Factors
                </div>
                <div className="space-y-2">
                  {(flag.reasons || []).map((reason: string) => (
                    <div key={reason} className="text-xs text-white/60 bg-white/5 border border-white/5 p-3 rounded-xl flex items-start gap-3">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                      {reason}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] text-white/20 font-medium tracking-widest uppercase">Detection Active</span>
                <span className="text-[10px] text-white/20">{new Date(flag.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}

          {/* Tips Card */}
          <div className="bg-gradient-to-br from-brand-400/20 to-brand-400/5 border border-brand-400/20 rounded-3xl p-8 flex flex-col justify-between">
            <div className="space-y-4 text-white/80">
              <div className="h-12 w-12 rounded-2xl bg-brand-400/20 flex items-center justify-center">
                <Info className="h-6 w-6 text-brand-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold">Why flags matter?</h3>
                <p className="text-sm leading-relaxed text-white/60 font-medium">
                  Flagged candidates may use AI-generated resumes, provide inconsistent timelines, or apply multiple times with different profiles. Review these manually before proceeding.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
