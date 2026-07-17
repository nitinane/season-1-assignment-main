import { create } from 'zustand';
import type { Candidate, ShortlistedCandidate, ProcessingState } from '../types';

interface CandidateStore {
  candidates: Candidate[];
  shortlisted: ShortlistedCandidate[];
  processing: ProcessingState;
  biasFreeEnabled: boolean;
  setCandidates: (c: Candidate[]) => void;
  setShortlisted: (s: ShortlistedCandidate[]) => void;
  updateShortlisted: (id: string, updates: Partial<ShortlistedCandidate>) => void;
  setProcessing: (p: Partial<ProcessingState>) => void;
  resetProcessing: () => void;
  setBiasFree: (v: boolean) => void;
  clear: () => void;
}

const initProcessing: ProcessingState = {
  step: 'idle',
  progress: 0,
  total: 0,
  current: 0,
  message: '',
};

export const useCandidateStore = create<CandidateStore>((set) => ({
  candidates: [],
  shortlisted: [],
  processing: initProcessing,
  biasFreeEnabled: true,
  setCandidates: (candidates) => set({ candidates }),
  setShortlisted: (shortlisted) => set({ shortlisted }),
  updateShortlisted: (id, updates) =>
    set((s) => ({
      shortlisted: s.shortlisted.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),
  setProcessing: (p) => set((s) => ({ processing: { ...s.processing, ...p } })),
  resetProcessing: () => set({ processing: initProcessing }),
  setBiasFree: (biasFreeEnabled) => set({ biasFreeEnabled }),
  clear: () => set({ candidates: [], shortlisted: [], processing: initProcessing }),
}));
