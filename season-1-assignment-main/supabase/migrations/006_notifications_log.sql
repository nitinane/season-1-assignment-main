-- ============================================================
-- Migration 006: notifications_log table (Agent 9 support)
-- Per PROJECT_SPEC.md §3
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ─── notifications_log ───────────────────────────────────────
create table if not exists notifications_log (
  id           uuid primary key default gen_random_uuid(),
  hr_user_id   uuid references auth.users(id) on delete cascade,
  event_type   text not null,
  message      text not null,
  delivered    boolean not null default false,
  created_at   timestamptz default now()
);

alter table notifications_log enable row level security;

create policy "Users manage own notifications logs"
  on notifications_log for all using (auth.uid() = hr_user_id);

-- Index for quick lookup by hr_user_id
create index if not exists idx_notifications_log_hr_user_id on notifications_log(hr_user_id);
create index if not exists idx_notifications_log_created_at on notifications_log(created_at);
