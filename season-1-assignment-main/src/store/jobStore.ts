import { create } from 'zustand';
import type { JobRole } from '../types';

interface JobStore {
  jobs: JobRole[];
  selectedJob: JobRole | null;
  setJobs: (jobs: JobRole[]) => void;
  addJob: (job: JobRole) => void;
  setSelectedJob: (job: JobRole | null) => void;
  updateJob: (id: string, updates: Partial<JobRole>) => void;
}

export const useJobStore = create<JobStore>((set) => ({
  jobs: [],
  selectedJob: null,
  setJobs: (jobs) => set({ jobs }),
  addJob: (job) => set((s) => ({ jobs: [job, ...s.jobs] })),
  setSelectedJob: (selectedJob) => set({ selectedJob }),
  updateJob: (id, updates) =>
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...updates } : j)),
      selectedJob: s.selectedJob?.id === id ? { ...s.selectedJob, ...updates } : s.selectedJob,
    })),
}));
