import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { initializeAuthListener } from './services/authService';
import { useAuthStore } from './store/authStore';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Jobs from './pages/Jobs';
import Candidates from './pages/Candidates';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import ResumeUpload from './pages/ResumeUpload';
import RankingView from './pages/RankingView';
import ShortlistView from './pages/ShortlistView';
import FraudDashboard from './pages/FraudDashboard';
import FollowUpTracker from './pages/FollowUpTracker';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full border-2 border-brand-400/30 border-t-brand-400 animate-spin" />
          <p className="text-sm text-white/50">Loading HireFlow AI...</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  useEffect(() => {
    // Session listener & cleanup
    initializeAuthListener();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="upload" element={<ResumeUpload />} />
          <Route path="analysis" element={<RankingView />} />
          <Route path="shortlist" element={<ShortlistView />} />
          <Route path="fraud" element={<FraudDashboard />} />
          <Route path="follow-up" element={<FollowUpTracker />} />
          <Route path="candidates" element={<Candidates />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
