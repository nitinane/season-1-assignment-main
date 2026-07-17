-- ============================================================
-- HireFlow AI — Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ─── hr_users ────────────────────────────────────────────────
create table if not exists hr_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz default now()
);
alter table hr_users enable row level security;
create policy "HR users can read own profile"
  on hr_users for select using (auth.uid() = auth_user_id);
create policy "HR users can insert own profile"
  on hr_users for insert with check (auth.uid() = auth_user_id);

-- ─── job_roles ───────────────────────────────────────────────
create table if not exists job_roles (
  id uuid primary key default gen_random_uuid(),
  hr_user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  required_skills text[] default '{}',
  preferred_tools text[] default '{}',
  experience_level text default '0-2 years',
  description text default '',
  candidate_count int default 0,
  shortlisted_count int default 0,
  created_at timestamptz default now()
);
alter table job_roles enable row level security;
create policy "Users manage own job roles"
  on job_roles for all using (auth.uid() = hr_user_id);

-- ─── candidates ──────────────────────────────────────────────
create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  job_role_id uuid references job_roles(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  skills text[] default '{}',
  projects text[] default '{}',
  years_experience numeric default 0,
  education text,
  certifications text[] default '{}',
  companies text[] default '{}',
  tech_stack text[] default '{}',
  keywords text[] default '{}',
  raw_text text,
  resume_url text,
  received_at timestamptz default now(),
  created_at timestamptz default now()
);
alter table candidates enable row level security;
create policy "Users access candidates via job roles"
  on candidates for all using (
    exists (
      select 1 from job_roles
      where job_roles.id = candidates.job_role_id
      and job_roles.hr_user_id = auth.uid()
    )
  );

-- ─── shortlisted_candidates ──────────────────────────────────
create table if not exists shortlisted_candidates (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) on delete cascade,
  job_role_id uuid references job_roles(id) on delete cascade,
  score numeric not null default 0,
  match_percentage numeric default 0,
  summary text,
  reason text,
  strengths text[] default '{}',
  missing_skills text[] default '{}',
  rank int,
  interview_questions jsonb default '[]',
  email_status text default 'pending' check (email_status in ('pending','sent','failed')),
  created_at timestamptz default now()
);
alter table shortlisted_candidates enable row level security;
create policy "Users access shortlisted via job roles"
  on shortlisted_candidates for all using (
    exists (
      select 1 from job_roles
      where job_roles.id = shortlisted_candidates.job_role_id
      and job_roles.hr_user_id = auth.uid()
    )
  );

-- ─── duplicate_flags ─────────────────────────────────────────
create table if not exists duplicate_flags (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) on delete cascade,
  duplicate_of_id uuid references candidates(id),
  reason text,
  created_at timestamptz default now()
);
alter table duplicate_flags enable row level security;

-- ─── fraud_flags ─────────────────────────────────────────────
create table if not exists fraud_flags (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) on delete cascade,
  risk_level text default 'low' check (risk_level in ('low','medium','high')),
  reasons text[] default '{}',
  created_at timestamptz default now()
);
alter table fraud_flags enable row level security;

-- ─── interview_questions ─────────────────────────────────────
create table if not exists interview_questions (
  id uuid primary key default gen_random_uuid(),
  shortlisted_id uuid references shortlisted_candidates(id) on delete cascade,
  questions jsonb default '[]',
  generated_at timestamptz default now()
);
alter table interview_questions enable row level security;

-- ─── sent_emails ─────────────────────────────────────────────
create table if not exists sent_emails (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) on delete cascade,
  hr_user_id uuid references auth.users(id),
  status text default 'pending' check (status in ('pending','sent','failed')),
  sent_at timestamptz,
  email_body text,
  created_at timestamptz default now()
);
alter table sent_emails enable row level security;
create policy "Users manage own sent emails"
  on sent_emails for all using (auth.uid() = hr_user_id);

-- ─── analytics_logs ──────────────────────────────────────────
create table if not exists analytics_logs (
  id uuid primary key default gen_random_uuid(),
  job_role_id uuid references job_roles(id) on delete cascade,
  total_applications int default 0,
  shortlisted int default 0,
  rejected int default 0,
  duplicates int default 0,
  frauds int default 0,
  avg_score numeric default 0,
  skill_distribution jsonb default '{}',
  created_at timestamptz default now()
);
alter table analytics_logs enable row level security;
create policy "Users access own analytics"
  on analytics_logs for all using (
    exists (
      select 1 from job_roles
      where job_roles.id = analytics_logs.job_role_id
      and job_roles.hr_user_id = auth.uid()
    )
  );

-- ─── Storage bucket for resumes ───────────────────────────────
-- Run this in Supabase Dashboard → Storage → New bucket
-- Bucket name: resumes
-- Public: false (private)
-- After creating, add this policy:
-- insert into storage.buckets (id, name) values ('resumes', 'resumes') on conflict do nothing;
