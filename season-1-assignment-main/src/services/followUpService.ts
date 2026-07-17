import { supabase } from '../lib/supabase';
import { getCurrentUser } from './authService';
import type { SentEmail } from '../types';

export const followUpService = {
  /**
   * Tracks a sent email.
   */
  async createFollowUp(email: Omit<SentEmail, 'id' | 'hr_user_id' | 'created_at'>) {
    const hr_user_id = await getCurrentUser();
    
    const { data, error } = await supabase
      .from('sent_emails')
      .insert([
        {
          ...email,
          hr_user_id,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data as SentEmail;
  },

  /**
   * Fetches the interaction history for a specific candidate.
   */
  async getFollowUpHistory(candidateId: string) {
    const { data, error } = await supabase
      .from('sent_emails')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('sent_at', { ascending: false });

    if (error) throw error;
    return data as SentEmail[];
  },

  /**
   * Updates the status of a sent email.
   */
  async updateStatus(id: string, status: 'pending' | 'sent' | 'failed') {
    const { data, error } = await supabase
      .from('sent_emails')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as SentEmail;
  }
};
