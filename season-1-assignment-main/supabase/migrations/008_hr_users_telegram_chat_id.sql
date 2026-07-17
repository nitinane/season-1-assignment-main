-- ============================================================
-- Migration 008: Add telegram_chat_id to hr_users
-- ============================================================

ALTER TABLE hr_users ADD COLUMN IF NOT EXISTS telegram_chat_id text;
