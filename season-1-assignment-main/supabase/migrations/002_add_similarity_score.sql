-- Add similarity_score to duplicate_flags
alter table duplicate_flags add column if not exists similarity_score numeric default 0;
