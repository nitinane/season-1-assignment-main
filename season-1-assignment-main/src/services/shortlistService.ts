import { supabase } from '../lib/supabase';
import { getCurrentUser } from './authService';
import type { ShortlistedCandidate, AIScoreResult } from '../types';

export const shortlistService = {
  /**
   * Clears the current shortlist for a job role and persists a fresh Top 10.
   */
  async persistShortlist(jobId: string, rankedCandidates: AIScoreResult[]) {
    const hr_user_id = await getCurrentUser();

    // 1. Clear old shortlist for this role
    const { error: deleteError } = await supabase
      .from('shortlisted_candidates')
      .delete()
      .eq('hr_user_id', hr_user_id)
      .eq('job_id', jobId);

    if (deleteError) throw deleteError;

    // 2. Prepare new shortlist data (Top 10)
    const shortlistData = rankedCandidates.slice(0, 10).map((c) => ({
      hr_user_id,
      job_id: jobId,
      candidate_id: (c as any).candidate_id, 
      score: Math.round(c.score),
      rank: c.rank,
      candidate_name: c.name,
      candidate_email: c.email || '',
      reason: c.reason,
      strengths: c.strengths,
      weaknesses: c.weaknesses || [],
      resume_text: c.summary || '',
      created_at: new Date().toISOString(),
    }));

    // 3. Insert fresh shortlist
    if (shortlistData.length > 0) {
      const { data, error: insertError } = await supabase
        .from('shortlisted_candidates')
        .insert(shortlistData)
        .select();

      if (insertError) throw insertError;
      return data;
    }

    return [];
  },

  /**
   * Fetches the shortlist for a role.
   */
  async getShortlist(jobId: string) {
    const { data, error } = await supabase
      .from('shortlisted_candidates')
      .select('*, candidate:candidates(*)')
      .eq('job_id', jobId)
      .order('rank', { ascending: true });

    if (error) throw error;
    return data as ShortlistedCandidate[];
  }
};
