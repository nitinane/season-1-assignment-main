import { supabase } from '../lib/supabase';
import { getCurrentUser } from './authService';
import type { JobRole } from '../types';

export const jobRoleService = {
  /**
   * Creates a new job role.
   * Ensures the hr_user_id is set to the current authenticated user.
   */
  async createRole(role: Omit<JobRole, 'id' | 'hr_user_id' | 'created_at' | 'candidate_count' | 'shortlisted_count'>) {
    const hr_user_id = await getCurrentUser();
    
    const { data, error } = await supabase
      .from('job_roles')
      .insert([
        {
          ...role,
          hr_user_id,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data as JobRole;
  },

  /**
   * Fetches all job roles for the current HR user.
   */
  async getRoles() {
    const hr_user_id = await getCurrentUser();
    
    const { data, error } = await supabase
      .from('job_roles')
      .select('*')
      .eq('hr_user_id', hr_user_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as JobRole[];
  },

  /**
   * Fetches a specific job role by ID.
   */
  async getRoleById(id: string) {
    const hr_user_id = await getCurrentUser();
    
    const { data, error } = await supabase
      .from('job_roles')
      .select('*')
      .eq('id', id)
      .eq('hr_user_id', hr_user_id)
      .single();

    if (error) throw error;
    return data as JobRole;
  },

  /**
   * Updates an existing job role.
   */
  async updateRole(id: string, updates: Partial<JobRole>) {
    const hr_user_id = await getCurrentUser();
    
    const { data, error } = await supabase
      .from('job_roles')
      .update(updates)
      .eq('id', id)
      .eq('hr_user_id', hr_user_id)
      .select()
      .single();

    if (error) throw error;
    return data as JobRole;
  },

  /**
   * Deletes a job role.
   */
  async deleteRole(id: string) {
    const hr_user_id = await getCurrentUser();
    
    const { error } = await supabase
      .from('job_roles')
      .delete()
      .eq('id', id)
      .eq('hr_user_id', hr_user_id);

    if (error) throw error;
    return true;
  }
};
