import {
  User, Mail, Key, Shield, CheckCircle, XCircle,
  ExternalLink, Info, RefreshCw, Trash2
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { signInWithGoogle } from '../lib/supabase';
import toast from 'react-hot-toast';
import { checkGmailConnection } from '../lib/gmail';
import { useEffect, useState } from 'react';

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <span className="badge-green flex items-center gap-1">
      <CheckCircle className="h-3 w-3" /> {label}
    </span>
  ) : (
    <span className="badge-red flex items-center gap-1">
      <XCircle className="h-3 w-3" /> {label}
    </span>
  );
}

function EnvRow({ name, value, desc }: { name: string; value: string; desc: string }) {
  const isSet = Boolean(value && value !== '');
  const masked = isSet ? value.slice(0, 6) + '••••••••••••••••' : 'Not configured';
  return (
    <div className="flex items-start justify-between rounded-xl border border-white/8 bg-white/3 p-4">
      <div className="min-w-0 flex-1">
        <code className="text-xs font-mono text-brand-300">{name}</code>
        <p className="text-xs text-white/40 mt-0.5">{desc}</p>
        <p className={`text-xs mt-1 font-mono ${isSet ? 'text-white/50' : 'text-red-400/70'}`}>{masked}</p>
      </div>
      <StatusBadge ok={isSet} label={isSet ? 'Set' : 'Missing'} />
    </div>
  );
}

export default function Settings() {
  const { user, accessToken, setAccessToken } = useAuthStore();
  const [isVerifying, setIsVerifying] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<'connected' | 'expired' | 'missing'>(
    accessToken ? 'connected' : 'missing'
  );

  useEffect(() => {
    async function verify() {
      if (!accessToken) {
        setGmailStatus('missing');
        return;
      }
      setIsVerifying(true);
      const ok = await checkGmailConnection(accessToken);
      setGmailStatus(ok ? 'connected' : 'expired');
      setIsVerifying(false);
    }
    verify();
  }, [accessToken]);

  const handleReconnect = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      toast.error('Failed to reconnect Gmail');
      console.error(err);
    }
  };

  const handleClearConnection = () => {
    setAccessToken(null);
    setGmailStatus('missing');
    toast.success('Gmail connection cleared');
  };

  const envVars = [
    {
      name: 'VITE_SUPABASE_URL',
      value: import.meta.env.VITE_SUPABASE_URL || '',
      desc: 'Your Supabase project URL',
    },
    {
      name: 'VITE_SUPABASE_ANON_KEY',
      value: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
      desc: 'Supabase public anon key for client-side access',
    },
    {
      name: 'VITE_GROQ_API_KEY',
      value: import.meta.env.VITE_GROQ_API_KEY || '',
      desc: 'Groq API key for AI scoring and interview questions',
    },
  ];

  const allEnvSet = envVars.every((e) => Boolean(e.value));

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-white/50">Manage your account, integrations, and API keys.</p>
      </div>

      {/* Profile */}
      <div className="glass-card-solid p-5 space-y-4">
        <h2 className="section-title flex items-center gap-2">
          <User className="h-4 w-4 text-brand-400" /> Account Profile
        </h2>
        <div className="flex items-center gap-4">
          {user?.user_metadata?.avatar_url ? (
            <img
              src={user.user_metadata.avatar_url}
              alt="avatar"
              className="h-14 w-14 rounded-2xl object-cover ring-2 ring-brand-500/30"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
          )}
          <div>
            <p className="font-semibold text-white text-sm">
              {user?.user_metadata?.full_name || 'HR User'}
            </p>
            <p className="text-xs text-white/40">{user?.email}</p>
            <div className="mt-1.5">
              <StatusBadge ok={true} label="Google Account Connected" />
            </div>
          </div>
        </div>
      </div>

      {/* Gmail Integration */}
      <div className="glass-card-solid p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title flex items-center gap-2">
            <Mail className="h-4 w-4 text-brand-400" /> Gmail Integration
          </h2>
          <div className="flex items-center gap-2">
            {accessToken && (
              <button
                onClick={handleClearConnection}
                className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            )}
            <button
              onClick={handleReconnect}
              disabled={isVerifying}
              className="flex items-center gap-1.5 rounded-lg bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-400 border border-brand-500/20 hover:bg-brand-500/20 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${isVerifying ? 'animate-spin' : ''}`} />
              {gmailStatus === 'connected' ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/3 p-4">
          <div>
            <p className="text-sm font-semibold text-white">Gmail Access Token</p>
            <p className="text-xs text-white/40 mt-0.5">Used to fetch resume emails and send shortlist notifications</p>
          </div>
          <StatusBadge 
            ok={gmailStatus === 'connected'} 
            label={
              isVerifying ? 'Verifying...' :
              gmailStatus === 'connected' ? 'Connected' : 
              gmailStatus === 'expired' ? 'Expired' : 'Not Connected'
            } 
          />
        </div>

        {gmailStatus === 'expired' && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-4">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-400">Session expired</p>
                <p className="text-xs text-amber-400/70 mt-1 leading-relaxed">
                  Your Gmail access token has expired. Click "Reconnect" above to refresh your session and continue using Gmail features.
                </p>
              </div>
            </div>
          </div>
        )}

        {gmailStatus === 'missing' && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-4">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-400">Gmail not connected</p>
                <p className="text-xs text-amber-400/70 mt-1 leading-relaxed">
                  The Gmail token is provided by Google OAuth at login time. If it's missing, sign out and log in again — make sure to grant Gmail permissions when prompted.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="text-xs text-white/30 space-y-1.5">
          <p className="font-semibold text-white/50 mb-2">Requested Gmail Scopes:</p>
          {[
            'gmail.readonly — Read inbox and attached resumes',
            'gmail.send — Send shortlist notification emails',
          ].map((scope) => (
            <div key={scope} className="flex items-center gap-2">
              <CheckCircle className="h-3 w-3 text-emerald-400/60" />
              <span>{scope}</span>
            </div>
          ))}
        </div>
      </div>

      {/* API Keys */}
      <div className="glass-card-solid p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title flex items-center gap-2">
            <Key className="h-4 w-4 text-brand-400" /> Environment Variables
          </h2>
          <StatusBadge ok={allEnvSet} label={allEnvSet ? 'All configured' : 'Action required'} />
        </div>

        <div className="space-y-2">
          {envVars.map((e) => <EnvRow key={e.name} {...e} />)}
        </div>

        <div className="rounded-xl border border-brand-500/20 bg-brand-500/8 p-4">
          <p className="text-xs font-semibold text-brand-300 mb-1.5">How to configure</p>
          <ol className="text-xs text-brand-300/60 space-y-1 leading-relaxed list-decimal list-inside">
            <li>Copy <code className="font-mono">.env.example</code> to <code className="font-mono">.env</code></li>
            <li>Fill in your Supabase URL and anon key from the Supabase dashboard</li>
            <li>Add your Groq API key from <code className="font-mono">console.groq.com</code></li>
            <li>Restart the dev server with <code className="font-mono">npm run dev</code></li>
          </ol>
        </div>
      </div>

      {/* Bias-Free & Security */}
      <div className="glass-card-solid p-5 space-y-4">
        <h2 className="section-title flex items-center gap-2">
          <Shield className="h-4 w-4 text-brand-400" /> Privacy & Compliance
        </h2>
        <div className="space-y-3">
          {[
            { label: 'Bias-Free Screening', desc: 'Names, gender, and location removed before AI ranking', ok: true },
            { label: 'Data Encryption', desc: 'All data encrypted via Supabase (AES-256)', ok: true },
            { label: 'No Third-Party Sharing', desc: 'Resume data never shared with external parties', ok: true },
            { label: 'Gmail Credential Storage', desc: 'OAuth tokens stored only in memory — never persisted', ok: true },
          ].map(({ label, desc, ok }) => (
            <div key={label} className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-xs text-white/40">{desc}</p>
              </div>
              <StatusBadge ok={ok} label={ok ? 'Active' : 'Inactive'} />
            </div>
          ))}
        </div>
      </div>

      {/* Quick Links */}
      <div className="glass-card-solid p-5 space-y-3">
        <h2 className="section-title">Quick Links</h2>
        {[
          { label: 'Supabase Dashboard', url: 'https://app.supabase.com' },
          { label: 'Groq API Console', url: 'https://console.groq.com' },
          { label: 'Google Cloud Console (OAuth)', url: 'https://console.cloud.google.com' },
        ].map(({ label, url }) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-xl border border-white/8 bg-white/3 p-3 hover:border-brand-400/30 hover:bg-white/5 transition-all duration-200"
          >
            <span className="text-sm text-white/70">{label}</span>
            <ExternalLink className="h-3.5 w-3.5 text-white/30" />
          </a>
        ))}
      </div>
    </div>
  );
}
