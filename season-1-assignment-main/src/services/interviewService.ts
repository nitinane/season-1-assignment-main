/**
 * Interview Service — CRUD helpers for the `interviews` table.
 *
 * All queries are scoped by hr_user_id (RLS).
 */

import { supabase } from '../lib/supabase';
import { getCurrentUser } from './authService';

export interface Interview {
  id: string;
  hr_user_id: string;
  application_id: string;
  job_id: string;
  questions: string; // stringified json
  scheduled_at: string | null;
  status: 'questions_ready' | 'scheduled' | 'completed' | 'cancelled';
  created_at: string;
}

export const interviewService = {
  /** Fetch interview questions/status by application ID. */
  async getInterviewByApplicationId(applicationId: string): Promise<Interview | null> {
    const hr_user_id = await getCurrentUser();

    const { data, error } = await supabase
      .from('interviews')
      .select('*')
      .eq('application_id', applicationId)
      .eq('hr_user_id', hr_user_id)
      .maybeSingle();

    if (error) throw error;
    return data as Interview | null;
  },

  /** Update interview status manually. */
  async updateStatus(id: string, status: Interview['status']): Promise<Interview> {
    const hr_user_id = await getCurrentUser();

    const { data, error } = await supabase
      .from('interviews')
      .update({ status })
      .eq('id', id)
      .eq('hr_user_id', hr_user_id)
      .select()
      .single();

    if (error) throw error;
    return data as Interview;
  },

  /** Delete interview record. */
  async deleteInterview(id: string): Promise<void> {
    const hr_user_id = await getCurrentUser();

    const { error } = await supabase
      .from('interviews')
      .delete()
      .eq('id', id)
      .eq('hr_user_id', hr_user_id);

    if (error) throw error;
  }
};
