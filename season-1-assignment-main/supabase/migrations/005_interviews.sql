-- ============================================================
-- Migration 005: interviews table (Agent 5 + Agent 6 support)
-- Per PROJECT_SPEC.md §3
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ─── interviews ──────────────────────────────────────────────
-- Created by Agent 6 (Question Generator) when a candidate is shortlisted.
-- questions[] stores the 8 categorized interview questions (HR-only).
-- Linked to an applications row (not the old candidates table).
create table if not exists interviews (
  id               uuid primary key default gen_random_uuid(),
  hr_user_id       uuid references auth.users(id) on delete cascade,
  application_id   uuid references applications(id) on delete cascade,
  job_id           uuid references job_roles(id) on delete cascade,
  questions        jsonb default '[]',    -- array of {category, question, difficulty}
  scheduled_at     timestamptz,           -- set later by Agent 7
  status           text not null default 'questions_ready'
                   check (status in ('questions_ready', 'scheduled', 'completed', 'cancelled')),
  created_at       timestamptz default now()
);

alter table interviews enable row level security;

create policy "Users manage own interviews"
  on interviews for all using (auth.uid() = hr_user_id);

-- Index for quick lookup by application
create index if not exists idx_interviews_application_id on interviews(application_id);
create index if not exists idx_interviews_hr_user_id on interviews(hr_user_id);
