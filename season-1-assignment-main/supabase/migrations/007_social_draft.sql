-- ============================================================
-- Migration 007: Add social_draft column to job_roles
-- Per PROJECT_SPEC.md Agent 2 specifications
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Add social_draft text column to store generated post copy & image prompts as JSON
alter table job_roles 
add column if not exists social_draft jsonb default null;
