-- ============================================================
-- Migration 009: Add hr_user_id to tables that were missing it
-- The frontend code filters candidates, shortlisted_candidates,
-- duplicate_flags and fraud_flags directly by hr_user_id, but
-- those columns didn't exist — causing 400 errors.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ─── candidates ──────────────────────────────────────────────
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS hr_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update existing RLS policy (drop old, recreate with hr_user_id check too)
DROP POLICY IF EXISTS "Users access candidates via job roles" ON candidates;
CREATE POLICY "Users access candidates via job roles"
  ON candidates FOR ALL USING (
    hr_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM job_roles
      WHERE job_roles.id = candidates.job_role_id
        AND job_roles.hr_user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_candidates_hr_user_id ON candidates(hr_user_id);

-- ─── shortlisted_candidates ──────────────────────────────────
-- The code also stores hr_user_id, job_id, candidate_name,
-- candidate_email, resume_text, and weaknesses in this table.
ALTER TABLE shortlisted_candidates ADD COLUMN IF NOT EXISTS hr_user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE shortlisted_candidates ADD COLUMN IF NOT EXISTS job_id       uuid REFERENCES job_roles(id)  ON DELETE CASCADE;
ALTER TABLE shortlisted_candidates ADD COLUMN IF NOT EXISTS candidate_name  text;
ALTER TABLE shortlisted_candidates ADD COLUMN IF NOT EXISTS candidate_email text;
ALTER TABLE shortlisted_candidates ADD COLUMN IF NOT EXISTS resume_text     text;
ALTER TABLE shortlisted_candidates ADD COLUMN IF NOT EXISTS weaknesses      text[] DEFAULT '{}';

-- Drop old RLS and recreate with direct hr_user_id check
DROP POLICY IF EXISTS "Users access shortlisted via job roles" ON shortlisted_candidates;
CREATE POLICY "Users access shortlisted via job roles"
  ON shortlisted_candidates FOR ALL USING (
    hr_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM job_roles
      WHERE job_roles.id = shortlisted_candidates.job_role_id
        AND job_roles.hr_user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_shortlisted_hr_user_id ON shortlisted_candidates(hr_user_id);
CREATE INDEX IF NOT EXISTS idx_shortlisted_job_id     ON shortlisted_candidates(job_id);

-- ─── duplicate_flags ─────────────────────────────────────────
ALTER TABLE duplicate_flags ADD COLUMN IF NOT EXISTS hr_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Users access own duplicate flags" ON duplicate_flags;
CREATE POLICY "Users access own duplicate flags"
  ON duplicate_flags FOR ALL USING (
    hr_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM candidates
      WHERE candidates.id = duplicate_flags.candidate_id
        AND candidates.hr_user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_duplicate_flags_hr_user_id ON duplicate_flags(hr_user_id);

-- ─── fraud_flags ─────────────────────────────────────────────
ALTER TABLE fraud_flags ADD COLUMN IF NOT EXISTS hr_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Users access own fraud flags" ON fraud_flags;
CREATE POLICY "Users access own fraud flags"
  ON fraud_flags FOR ALL USING (
    hr_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM candidates
      WHERE candidates.id = fraud_flags.candidate_id
        AND candidates.hr_user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_fraud_flags_hr_user_id ON fraud_flags(hr_user_id);
