import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Session } from '@supabase/supabase-js';

interface AuthStore {
  user: User | null;
  session: Session | null;
  accessToken: string | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setAccessToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
  getHrUserId: () => string | null;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      accessToken: null,
      isLoading: true,
      setUser: (user) => set({ user }),
      setSession: (session) => set({ session }),
      setAccessToken: (token) => set({ accessToken: token }),
      setLoading: (isLoading) => set({ isLoading }),
      clear: () => set({ user: null, session: null, accessToken: null }),
      getHrUserId: () => get().user?.id ?? null,
    }),
    { name: 'hireflow-auth', partialize: (s) => ({ accessToken: s.accessToken }) }
  )
);
