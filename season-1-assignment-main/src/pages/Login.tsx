import React from 'react';
import { handleGoogleLogin } from '../services/authService';
import { Zap, CheckCircle, Users, BarChart3, Mail } from 'lucide-react';
import toast from 'react-hot-toast';

const features = [
  { icon: Users, text: 'AI-powered resume scoring' },
  { icon: BarChart3, text: 'Bias-free candidate ranking' },
  { icon: Mail, text: 'Automated Gmail integration' },
  { icon: CheckCircle, text: 'Fraud & duplicate detection' },
];

export default function Login() {
  const [loading, setLoading] = React.useState(false);

  const onLoginClick = async () => {
    setLoading(true);
    try {
      await handleGoogleLogin();
    } catch (err: any) {
      toast.error(err.message || 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel – hero */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden">
        {/* Glow effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/80 via-surface to-purple-900/40" />
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand-600/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-purple-600/15 blur-3xl" />

        <div className="relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 shadow-glow">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <span className="font-display text-2xl font-bold text-white">
              HireFlow <span className="text-gradient">AI</span>
            </span>
          </div>

          <div className="mt-16">
            <h1 className="font-display text-5xl font-bold leading-tight text-white">
              Hire smarter,<br />
              <span className="text-gradient">faster, fairer.</span>
            </h1>
            <p className="mt-5 text-lg text-white/60 leading-relaxed max-w-md">
              AI-powered resume screening that shortlists your top 10 candidates from 100+ applications — in minutes, not hours.
            </p>
          </div>

          <div className="mt-12 space-y-4">
            {features.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/20 border border-brand-500/30">
                  <Icon className="h-4 w-4 text-brand-400" />
                </div>
                <span className="text-sm text-white/70 font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 text-sm text-white/30">
            <span>Trusted by 200+ HR teams</span>
            <span>•</span>
            <span>SOC 2 Compliant</span>
            <span>•</span>
            <span>GDPR Ready</span>
          </div>
        </div>
      </div>

      {/* Right panel – login form */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md animate-slide-up">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 shadow-glow-sm">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-xl font-bold text-white">
              HireFlow <span className="text-gradient">AI</span>
            </span>
          </div>

          <div className="glass-card-solid p-8">
            <div className="mb-8">
              <h2 className="font-display text-2xl font-bold text-white">Welcome back</h2>
              <p className="mt-2 text-sm text-white/50">
                Sign in with your Google Workspace account to continue
              </p>
            </div>

            {/* Gmail scopes notice */}
            <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/8 p-4">
              <p className="text-xs font-semibold text-amber-400 mb-1">Gmail Access Required</p>
              <p className="text-xs text-amber-400/70 leading-relaxed">
                HireFlow AI needs access to read your inbox (resumes) and send shortlist emails. We never store your Gmail credentials.
              </p>
            </div>

            <button
              onClick={onLoginClick}
              disabled={loading}
              className="relative w-full flex items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/8 px-6 py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:border-white/30 hover:bg-white/12 active:scale-98 disabled:opacity-60"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              {loading ? 'Connecting...' : 'Continue with Google'}
            </button>

            <p className="mt-6 text-center text-xs text-white/30 leading-relaxed">
              By signing in, you agree to our Terms of Service and Privacy Policy.
              Your data is encrypted and never shared with third parties.
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-white/20">
            HireFlow AI © 2025 · Built for modern recruitment teams
          </p>
        </div>
      </div>
    </div>
  );
}
