import { supabase } from '../lib/supabase';
import { getCurrentUser } from './authService';
import { detectFraud } from '../lib/groq';
import type { Candidate, FraudFlag } from '../types';

export const fraudService = {
  /**
   * Check for duplicate candidates (same email/phone).
   */
  async checkDuplicates(_jobId: string, newCandidate: Partial<Candidate>) {
    const hr_user_id = await getCurrentUser();
    
    // 1. Fetch potential matches in the database
    const { data: matches, error } = await supabase
      .from('candidates')
      .select('id, name, email, phone')
      .eq('hr_user_id', hr_user_id)
      .eq('email', newCandidate.email);

    if (error) throw error;

    if (matches && matches.length > 0) {
      // 2. Insert duplicate flag
      const flags = matches.map(m => ({
        hr_user_id,
        candidate_id: newCandidate.id,
        duplicate_of_id: m.id,
        reason: 'Duplicate email/phone found in system.',
      }));

      const { error: flagError } = await supabase
        .from('duplicate_flags')
        .insert(flags);

      if (flagError) throw flagError;
      return true;
    }
    
    return false;
  },

  /**
   * Run AI-based fraud detection on raw resume text.
   */
  async runFraudAnalysis(candidateId: string, rawText: string) {
    const result = await detectFraud(rawText);
    
    const hr_user_id = await getCurrentUser();

    // 3. Store fraud flag
    const { data, error } = await supabase
      .from('fraud_flags')
      .insert([
        {
          hr_user_id,
          candidate_id: candidateId,
          risk_level: result.risk_level,
          reasons: result.reasons,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data as FraudFlag;
  },

  /**
   * Fetches all fraud flags for candidates.
   */
  async getFraudFlags(_jobId: string) {
    const hr_user_id = await getCurrentUser();
    const { data, error } = await supabase
      .from('fraud_flags')
      .select('*, candidates(*)')
      .eq('hr_user_id', hr_user_id);

    if (error) throw error;
    return data;
  }
};
