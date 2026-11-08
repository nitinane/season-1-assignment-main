import {
  User, Mail, Key, Shield, CheckCircle, XCircle,
  ExternalLink, Info, RefreshCw, Trash2, Send, MessageCircle
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { signInWithGoogle, supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { checkGmailConnection } from '../lib/gmail';
import { useEffect, useState } from 'react';
import { pollAndLinkTelegramChatId } from '../services/notificationService';

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <span className="badge badge-green" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <CheckCircle size={10} /> {label}
    </span>
  ) : (
    <span className="badge badge-red" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <XCircle size={10} /> {label}
    </span>
  );
}

function SectionCard({ title, icon: Icon, badge, children }: {
  title: string;
  icon: React.ElementType;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card-solid" style={{ padding: '22px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: 'rgba(91,94,244,0.12)', border: '1px solid rgba(91,94,244,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={15} color="var(--primary)" />
          </div>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>{title}</p>
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

function EnvRow({ name, value, desc }: { name: string; value: string; desc: string }) {
  const isSet  = Boolean(value);
  const masked = isSet ? value.slice(0, 8) + '••••••••••••••' : 'Not configured';
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      padding: '12px 14px', borderRadius: 10,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <code style={{ fontSize: 11.5, fontFamily: "'Geist Mono', monospace", color: 'var(--primary)' }}>{name}</code>
        <p style={{ fontSize: 11.5, color: 'var(--outline)', marginTop: 3 }}>{desc}</p>
        <p style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", color: isSet ? 'var(--on-surface-muted)' : 'var(--error)', marginTop: 4 }}>{masked}</p>
      </div>
      <StatusBadge ok={isSet} label={isSet ? 'Set' : 'Missing'} />
    </div>
  );
}

export default function Settings() {
  const { user, accessToken, setAccessToken } = useAuthStore();
  const [isVerifying,  setIsVerifying]  = useState(false);
  const [gmailStatus,  setGmailStatus]  = useState<'connected' | 'expired' | 'missing'>(accessToken ? 'connected' : 'missing');

  // Telegram
  const [checkingTelegram, setCheckingTelegram] = useState(false);
  const [telegramLinked,   setTelegramLinked]   = useState<boolean | null>(null);
  const [linkedChatId,     setLinkedChatId]     = useState<string | null>(null);

  // Scope checks
  const [scopesChecked,  setScopesChecked]  = useState({ gmailRead: false, gmailSend: false, driveRead: false, tokenValid: false });
  const [checkingScopes, setCheckingScopes] = useState(false);

  useEffect(() => {
    async function checkExistingTelegram() {
      if (!user) return;
      try {
        const { data } = await supabase.from('hr_users').select('telegram_chat_id').eq('auth_user_id', user.id).maybeSingle();
        if (data?.telegram_chat_id) { setTelegramLinked(true); setLinkedChatId(data.telegram_chat_id); }
        else { setTelegramLinked(false); }
      } catch (e) { console.error(e); }
    }
    checkExistingTelegram();
  }, [user]);

  const handleCheckTelegram = async () => {
    if (!user) return;
    setCheckingTelegram(true);
    try {
      const res = await pollAndLinkTelegramChatId(user.id, user.email || '');
      if (res.success && res.chat_id) {
        setTelegramLinked(true);
        setLinkedChatId(res.chat_id);
        toast.success(`Telegram linked! Chat ID: ${res.chat_id}`);
      } else {
        toast.error(res.error || 'Verification failed.');
      }
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setCheckingTelegram(false);
    }
  };

  useEffect(() => {
    async function verify() {
      if (!accessToken) { setGmailStatus('missing'); return; }
      setIsVerifying(true);
      const ok = await checkGmailConnection(accessToken);
      setGmailStatus(ok ? 'connected' : 'expired');
      setIsVerifying(false);
    }
    verify();
  }, [accessToken]);

  useEffect(() => {
    async function checkScopes() {
      if (!accessToken) return;
      setCheckingScopes(true);
      try {
        const res = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`);
        if (res.ok) {
          const data = await res.json();
          const scopes = (data.scope || '').split(' ');
          setScopesChecked({
            gmailRead:  scopes.includes('https://www.googleapis.com/auth/gmail.readonly'),
            gmailSend:  scopes.includes('https://www.googleapis.com/auth/gmail.send'),
            driveRead:  scopes.includes('https://www.googleapis.com/auth/drive.readonly'),
            tokenValid: true,
          });
        } else {
          setScopesChecked(prev => ({ ...prev, tokenValid: false }));
        }
      } catch (e) {
        setScopesChecked(prev => ({ ...prev, tokenValid: false }));
      } finally {
        setCheckingScopes(false);
      }
    }
    checkScopes();
  }, [accessToken]);

  const handleReconnect    = async () => { try { await signInWithGoogle(); } catch { toast.error('Failed to reconnect Gmail'); } };
  const handleClearGmail   = () => { setAccessToken(null); setGmailStatus('missing'); toast.success('Gmail connection cleared'); };

  const envVars = [
    { name: 'VITE_SUPABASE_URL',                value: import.meta.env.VITE_SUPABASE_URL || '',             desc: 'Supabase project URL' },
    { name: 'VITE_SUPABASE_ANON_KEY',           value: import.meta.env.VITE_SUPABASE_ANON_KEY || '',        desc: 'Supabase public anon key' },
    { name: 'VITE_GROQ_API_KEY / VITE_GROQ_API_KEYS', value: import.meta.env.VITE_GROQ_API_KEY || import.meta.env.VITE_GROQ_API_KEYS || '', desc: 'Groq API key(s) for all AI agents' },
  ];
  const allEnvSet = envVars.every(e => Boolean(e.value));

  const displayName = user?.user_metadata?.full_name || 'HR User';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 700 }} className="animate-fade-in">

      {/* ── Header ─────────────────────────────────────────── */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--on-surface)', letterSpacing: '-0.02em', margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 13, color: 'var(--on-surface-muted)', marginTop: 3 }}>
          Account, integrations, and AI agent configuration
        </p>
      </div>

      {/* ── Profile ────────────────────────────────────────── */}
      <SectionCard title="Account Profile" icon={User}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {user?.user_metadata?.avatar_url ? (
            <img
              src={user.user_metadata.avatar_url} alt="avatar"
              style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover', border: '2px solid rgba(91,94,244,0.35)' }}
            />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #5b5ef4 0%, #9f77f7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#fff' }}>
              {displayName.charAt(0)}
            </div>
          )}
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--on-surface)', margin: '0 0 4px' }}>{displayName}</p>
            <p style={{ fontSize: 12, color: 'var(--outline)', margin: '0 0 8px' }}>{user?.email}</p>
            <StatusBadge ok={true} label="Google Account Connected" />
          </div>
        </div>
      </SectionCard>

      {/* ── Gmail Integration ──────────────────────────────── */}
      <SectionCard
        title="Gmail Integration"
        icon={Mail}
        badge={
          <div style={{ display: 'flex', gap: 8 }}>
            {accessToken && (
              <button onClick={handleClearGmail} className="btn-danger" style={{ padding: '6px 12px', fontSize: 11 }}>
                <Trash2 size={11} /> Clear
              </button>
            )}
            <button onClick={handleReconnect} disabled={isVerifying} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 11 }}>
              <RefreshCw size={11} style={{ animation: isVerifying ? 'spin 1s linear infinite' : 'none' }} />
              {gmailStatus === 'connected' ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        }
      >
        {/* Status row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 14 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-surface)', margin: '0 0 3px' }}>Gmail Access Token</p>
            <p style={{ fontSize: 11.5, color: 'var(--outline)', margin: 0 }}>Used to read inbox and send shortlist / decision emails</p>
          </div>
          <StatusBadge
            ok={gmailStatus === 'connected'}
            label={isVerifying ? 'Verifying…' : gmailStatus === 'connected' ? 'Connected' : gmailStatus === 'expired' ? 'Expired' : 'Not Connected'}
          />
        </div>

        {/* Warning messages */}
        {gmailStatus !== 'connected' && (
          <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(247,192,64,0.07)', border: '1px solid rgba(247,192,64,0.18)', display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14 }}>
            <Info size={14} color="var(--amber)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--amber)', margin: '0 0 3px' }}>
                {gmailStatus === 'expired' ? 'Session expired' : 'Gmail not connected'}
              </p>
              <p style={{ fontSize: 11.5, color: 'rgba(247,192,64,0.7)', margin: 0, lineHeight: 1.6 }}>
                {gmailStatus === 'expired'
                  ? 'Click "Reconnect" to refresh your session and continue using Gmail features.'
                  : 'Sign out and log in again — grant Gmail and Drive permissions when prompted.'}
              </p>
            </div>
          </div>
        )}

        {/* Scopes */}
        <div>
          <p style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--outline)', margin: '0 0 10px' }}>
            Permission Scopes
          </p>

          {accessToken && !checkingScopes && !scopesChecked.tokenValid && (
            <div style={{ fontSize: 12, color: 'var(--error)', marginBottom: 8 }}>
              ⚠️ Access token is invalid or expired — click Reconnect.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { id: 'gmailRead',  name: 'gmail.readonly', desc: 'Read inbox and retrieve resume attachments', ok: scopesChecked.gmailRead },
              { id: 'gmailSend',  name: 'gmail.send',     desc: 'Send shortlist & decision notification emails',  ok: scopesChecked.gmailSend },
              { id: 'driveRead',  name: 'drive.readonly', desc: 'Read resume files from Google Drive folder',     ok: scopesChecked.driveRead },
            ].map((scope) => (
              <div key={scope.name} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <code style={{ fontSize: 11.5, fontFamily: "'Geist Mono', monospace", color: 'var(--primary)' }}>{scope.name}</code>
                  <p style={{ fontSize: 11.5, color: 'var(--outline)', marginTop: 3 }}>{scope.desc}</p>
                </div>
                {checkingScopes
                  ? <span style={{ fontSize: 10, color: 'var(--outline)' }}>Checking…</span>
                  : <StatusBadge ok={scope.ok} label={scope.ok ? 'Granted' : 'Missing'} />
                }
              </div>
            ))}
          </div>

          {!checkingScopes && scopesChecked.tokenValid && (!scopesChecked.gmailRead || !scopesChecked.gmailSend || !scopesChecked.driveRead) && (
            <div style={{ padding: '12px 14px', borderRadius: 9, background: 'rgba(255,122,147,0.08)', border: '1px solid rgba(255,122,147,0.2)', marginTop: 10, fontSize: 12, color: 'var(--error)', lineHeight: 1.6 }}>
              ⚠️ Missing required permissions — click <strong>Reconnect</strong> and check all boxes on the Google consent screen.
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Telegram (Agent 9) ─────────────────────────────── */}
      <SectionCard
        title="Telegram Notifications — Agent 9"
        icon={MessageCircle}
        badge={<StatusBadge ok={!!telegramLinked} label={telegramLinked ? 'Linked' : 'Not Linked'} />}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--on-surface-muted)', lineHeight: 1.7, margin: 0 }}>
            Get instant push notifications on every pipeline event — new applications, score ready, shortlisted, interview scheduled, and decision sent.
          </p>

          {/* Steps */}
          <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--on-surface-muted)', margin: '0 0 10px' }}>How to connect:</p>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--on-surface-muted)', lineHeight: 1.8 }}>
              <li>Open Telegram and search for{' '}
                <a href="https://t.me/m_resume_bot" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                  @m_resume_bot
                </a>
              </li>
              <li>Send a message containing your email: <code style={{ fontFamily: "'Geist Mono', monospace", color: 'var(--primary)', fontSize: 11 }}>{user?.email}</code></li>
              <li>Click the "Check Connection" button below.</li>
            </ol>
          </div>

          {telegramLinked && (
            <div style={{ padding: '12px 14px', borderRadius: 9, background: 'rgba(61,232,168,0.07)', border: '1px solid rgba(61,232,168,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={14} color="var(--tertiary)" />
              <span style={{ fontSize: 12.5, color: 'var(--tertiary)' }}>
                Connected to chat ID: <code style={{ fontFamily: "'Geist Mono', monospace", fontWeight: 700 }}>{linkedChatId}</code>
              </span>
            </div>
          )}

          <button
            onClick={handleCheckTelegram}
            disabled={checkingTelegram}
            className="btn-primary"
            style={{ justifyContent: 'center', fontSize: 12 }}
          >
            {checkingTelegram ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />}
            {checkingTelegram ? 'Checking Telegram…' : 'Check Connection'}
          </button>
        </div>
      </SectionCard>

      {/* ── Environment Variables ──────────────────────────── */}
      <SectionCard
        title="Environment Variables"
        icon={Key}
        badge={<StatusBadge ok={allEnvSet} label={allEnvSet ? 'All configured' : 'Action required'} />}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {envVars.map((e) => <EnvRow key={e.name} {...e} />)}
        </div>

        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(91,94,244,0.07)', border: '1px solid rgba(91,94,244,0.15)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', margin: '0 0 8px' }}>How to configure</p>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'rgba(196,197,255,0.7)', lineHeight: 1.8 }}>
            <li>Copy <code style={{ fontFamily: "'Geist Mono', monospace" }}>.env.example</code> to <code style={{ fontFamily: "'Geist Mono', monospace" }}>.env</code></li>
            <li>Fill in Supabase URL and anon key from the Supabase dashboard</li>
            <li>Add Groq API key from <code style={{ fontFamily: "'Geist Mono', monospace" }}>console.groq.com</code></li>
            <li>Restart the dev server: <code style={{ fontFamily: "'Geist Mono', monospace" }}>npm run dev</code></li>
          </ol>
        </div>
      </SectionCard>

      {/* ── Privacy & Compliance ───────────────────────────── */}
      <SectionCard title="Privacy & Compliance" icon={Shield}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Bias-Free Screening',       desc: 'Names, gender, location stripped before AI ranking' },
            { label: 'Data Encryption',            desc: 'All data encrypted via Supabase (AES-256)' },
            { label: 'No Third-Party Sharing',     desc: 'Resume data never shared with external parties' },
            { label: 'OAuth Token Storage',        desc: 'Google tokens stored only in memory — never persisted to disk' },
            { label: 'HR Always Decides',          desc: 'AI drafts; no external email auto-sent without explicit HR action' },
          ].map(({ label, desc }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--on-surface)', margin: '0 0 2px' }}>{label}</p>
                <p style={{ fontSize: 12, color: 'var(--outline)', margin: 0 }}>{desc}</p>
              </div>
              <StatusBadge ok={true} label="Active" />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Quick Links ────────────────────────────────────── */}
      <div className="glass-card-solid" style={{ padding: '20px 22px' }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--on-surface)', margin: '0 0 14px' }}>Quick Links</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'Supabase Dashboard', url: 'https://app.supabase.com' },
            { label: 'Groq API Console',   url: 'https://console.groq.com' },
            { label: 'Google Cloud Console (OAuth)', url: 'https://console.cloud.google.com' },
          ].map(({ label, url }) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '11px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                textDecoration: 'none', transition: 'all 0.2s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(91,94,244,0.07)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(91,94,244,0.2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'; }}
            >
              <span style={{ fontSize: 13, color: 'var(--on-surface-muted)' }}>{label}</span>
              <ExternalLink size={13} color="var(--outline)" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
