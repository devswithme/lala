-- Mood Energy: add columns to sessions for per-user mood (0-100) and last update time.
-- Run in Supabase SQL editor.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS mood smallint DEFAULT 100,
  ADD COLUMN IF NOT EXISTS mood_updated_at timestamptz;
