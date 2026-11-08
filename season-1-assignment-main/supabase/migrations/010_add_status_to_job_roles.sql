-- ============================================================
-- Migration 010: Add status column to job_roles
-- The application code inserts and manages `status` on job_roles,
-- but the column was missing from the database schema.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE job_roles ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
