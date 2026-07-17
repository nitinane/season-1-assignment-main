/**
 * Application Service — CRUD helpers for the `applications` table.
 *
 * Used by the UI (ApplicationsView page) and by Agents 3/4.
 * All queries are scoped by hr_user_id (RLS).
 */

import { supabase } from '../lib/supabase';
import { getCurrentUser } from './authService';
import type { Application } from '../agents/applicationIngestorAgent';

export const applicationService = {
  /** Fetch all applications for the current HR user, optionally filtered by job. */
  async getApplications(jobId?: string): Promise<Application[]> {
    const hr_user_id = await getCurrentUser();

    let query = supabase
      .from('applications')
      .select('*')
      .eq('hr_user_id', hr_user_id)
      .order('created_at', { ascending: false });

    if (jobId) {
      query = query.eq('job_id', jobId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as Application[];
  },

  /** Fetch a single application by ID. */
  async getApplicationById(id: string): Promise<Application> {
    const hr_user_id = await getCurrentUser();

    const { data, error } = await supabase
      .from('applications')
      .select('*')
      .eq('id', id)
      .eq('hr_user_id', hr_user_id)
      .single();

    if (error) throw error;
    return data as Application;
  },

  /** Update application status manually (e.g. shortlisted, hired, rejected). */
  async updateStatus(id: string, status: Application['status']): Promise<Application> {
    const hr_user_id = await getCurrentUser();

    const { data, error } = await supabase
      .from('applications')
      .update({ status })
      .eq('id', id)
      .eq('hr_user_id', hr_user_id)
      .select()
      .single();

    if (error) throw error;
    return data as Application;
  },

  /** Delete an application. */
  async deleteApplication(id: string): Promise<void> {
    const hr_user_id = await getCurrentUser();

    const { error } = await supabase
      .from('applications')
      .delete()
      .eq('id', id)
      .eq('hr_user_id', hr_user_id);

    if (error) throw error;
  },

  /** Count applications by status for a job (used in dashboard). */
  async getStatusCounts(jobId?: string): Promise<Record<string, number>> {
    const hr_user_id = await getCurrentUser();

    let query = supabase
      .from('applications')
      .select('status')
      .eq('hr_user_id', hr_user_id);

    if (jobId) query = query.eq('job_id', jobId);

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).reduce((acc: Record<string, number>, row: { status: string }) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});
  },
};
