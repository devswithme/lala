-- Beta queue columns for sessions (staged rollout).
-- Run this in Supabase SQL Editor if you haven’t already.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS queue_position integer,
  ADD COLUMN IF NOT EXISTS queue_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS queue_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS queue_bypassed boolean DEFAULT false;
