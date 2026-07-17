-- ============================================================
-- Migration 004: Agent 3 + Agent 4 support
-- Creates `applications` table (spec §3) and `drive_poll_state`
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ─── applications ────────────────────────────────────────────
-- Stores every ingested resume as an "application" record.
-- Lifecycle: ingested → scored → shortlisted → interview_scheduled → hired/rejected
create table if not exists applications (
  id               uuid primary key default gen_random_uuid(),
  hr_user_id       uuid references auth.users(id) on delete cascade,
  job_id           uuid references job_roles(id) on delete cascade,
  drive_file_id    text,                       -- Google Drive file ID (null for manual uploads)
  candidate_name   text not null default '',
  candidate_email  text not null default '',
  resume_text      text not null default '',   -- raw extracted text
  score            int,                        -- 0-100, null until Agent 4 runs
  score_reasoning  text,                       -- Agent 4 JSON stringified output
  status           text not null default 'ingested'
                   check (status in (
                     'ingested',
                     'scored',
                     'shortlisted',
                     'interview_scheduled',
                     'hired',
                     'rejected'
                   )),
  created_at       timestamptz default now()
);

alter table applications enable row level security;

create policy "Users manage own applications"
  on applications for all using (auth.uid() = hr_user_id);

-- ─── drive_poll_state ────────────────────────────────────────
-- Tracks the last-seen Drive page token per HR user per folder,
-- so Agent 3 only ingests new files on each poll cycle.
create table if not exists drive_poll_state (
  id           uuid primary key default gen_random_uuid(),
  hr_user_id   uuid references auth.users(id) on delete cascade,
  folder_id    text not null,
  page_token   text,                           -- Drive Changes API page token
  last_polled  timestamptz default now(),
  unique (hr_user_id, folder_id)
);

alter table drive_poll_state enable row level security;

create policy "Users manage own drive poll state"
  on drive_poll_state for all using (auth.uid() = hr_user_id);

-- ─── Index for fast lookups ───────────────────────────────────
create index if not exists idx_applications_hr_user_id on applications(hr_user_id);
create index if not exists idx_applications_job_id on applications(job_id);
create index if not exists idx_applications_status on applications(status);
create index if not exists idx_applications_drive_file_id on applications(drive_file_id);
