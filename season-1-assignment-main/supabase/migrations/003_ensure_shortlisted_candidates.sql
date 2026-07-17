-- Standalone SQL to create the shortlisted_candidates table if it doesn't exist
-- Run this in the Supabase SQL Editor

-- Enable UUID extension if not enabled
create extension if not exists "pgcrypto";

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

-- Enable RLS
alter table shortlisted_candidates enable row level security;

-- Policies for shortlisted_candidates
do $$ 
begin
  if not exists (
    select 1 from pg_policies 
    where tablename = 'shortlisted_candidates' 
    and policyname = 'Users access shortlisted via job roles'
  ) then
    create policy "Users access shortlisted via job roles"
      on shortlisted_candidates for all using (
        exists (
          select 1 from job_roles
          where job_roles.id = shortlisted_candidates.job_role_id
          and job_roles.hr_user_id = auth.uid()
        )
      );
  end if;
end $$;

-- Also ensure sent_emails table exists as it's used for tracking
create table if not exists sent_emails (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) on delete cascade,
  hr_user_id uuid references auth.users(id),
  status text default 'pending' check (status in ('pending','sent','failed')),
  sent_at timestamptz,
  email_body text,
  created_at timestamptz default now()
);

-- Enable RLS
alter table sent_emails enable row level security;

-- Policies for sent_emails
do $$ 
begin
  if not exists (
    select 1 from pg_policies 
    where tablename = 'sent_emails' 
    and policyname = 'Users manage own sent emails'
  ) then
    create policy "Users manage own sent emails"
      on sent_emails for all using (auth.uid() = hr_user_id);
  end if;
end $$;
