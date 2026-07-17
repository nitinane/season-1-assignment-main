/**
 * JD Service — Agent 1 backend route / save layer
 *
 * Saves the JDOutput produced by Agent 1 (JD Generator) to the `jobs` table,
 * always scoped by hr_user_id per the RLS convention in PROJECT_SPEC.md.
 *
 * The `jobs` table columns expected (from spec §3):
 *   id, hr_user_id, title, description, required_skills[], experience_level,
 *   status, created_at
 *
 * Extra spec fields stored in description / preferred_tools:
 *   - responsibilities  → serialised into the description field
 *   - tools             → stored as preferred_tools (existing column on job_roles)
 *
 * NOTE: the existing Supabase table is named `job_roles` (matching the existing
 * codebase).  Agent 1 writes to the same table so the results are visible in the
 * Jobs page immediately, without schema changes.
 */

import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../services/authService';
import { runJDGeneratorAgent } from '../agents/jdGeneratorAgent';
import type { JDOutput, AgentResult } from '../agents/jdGeneratorAgent';
import type { JobRole } from '../types';
import { notify_hr } from './notificationService';
import { generateAndSaveSocialDraft } from '../agents/socialPosterAgent';


// ─── Types ────────────────────────────────────────────────────────────────────

export interface SavedJD {
  agentResult: AgentResult;
  savedJob?: JobRole;
}

// ─── Save helper ──────────────────────────────────────────────────────────────

/**
 * Saves an already-validated JDOutput to the jobs / job_roles table.
 * Scoped by hr_user_id (RLS).
 */
export async function saveJDToDatabase(jd: JDOutput): Promise<JobRole> {
  const hr_user_id = await getCurrentUser();

  const { data, error } = await supabase
    .from('job_roles')
    .insert([
      {
        hr_user_id,
        title: jd.title,
        // Store responsibilities inline in description so they're not lost
        description: jd.responsibilities.join('\n• '),
        required_skills: jd.required_skills,
        preferred_tools: jd.tools,
        experience_level: jd.experience_level,
        status: 'active',
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data as JobRole;
}

// ─── Main route function ──────────────────────────────────────────────────────

/**
 * End-to-end: HR notes → Agent 1 → save to DB
 *
 * @param hrNotes   Raw free-text HR notes
 * @returns         { agentResult, savedJob? }
 *                  savedJob is only set when agentResult.success === true
 *                  and the DB write succeeds.
 */
export async function generateAndSaveJD(hrNotes: string): Promise<SavedJD> {
  // 1. Run the agent
  const agentResult = await runJDGeneratorAgent(hrNotes);

  if (!agentResult.success) {
    // Return the error without attempting a DB write
    return { agentResult };
  }

  // 2. Save to database
  try {
    const savedJob = await saveJDToDatabase(agentResult.data);
    
    // Trigger Agent 9 notification
    notify_hr(
      savedJob.hr_user_id,
      'jd_created',
      `Job description created: "${savedJob.title}" (Experience Level: ${savedJob.experience_level || 'N/A'})`
    ).catch(console.error);

    // Automatically generate the social media post draft (Agent 2)
    generateAndSaveSocialDraft(savedJob.id).catch(console.error);

    return { agentResult, savedJob };
  } catch (dbError) {
    // Agent succeeded but DB failed — wrap and surface the error
    return {
      agentResult: {
        success: false,
        error: `DB save failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`,
      },
    };
  }
}
