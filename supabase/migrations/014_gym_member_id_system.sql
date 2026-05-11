-- ============================================================
-- Migration 014: Gym Member ID System
-- Adds gym_member_id + scanner_id to customers.
-- Creates gym_settings table for ID format configuration.
-- No other existing tables or columns are touched.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. customers — add member ID fields
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS gym_member_id text,
  ADD COLUMN IF NOT EXISTS scanner_id    integer;

-- gym_member_id must be unique within a gym owner's account (not globally)
CREATE UNIQUE INDEX IF NOT EXISTS customers_gym_member_id_idx
  ON public.customers(gym_id, gym_member_id)
  WHERE gym_member_id IS NOT NULL;

-- scanner_id lookup (used during attendance sync matching)
CREATE INDEX IF NOT EXISTS customers_scanner_id_idx
  ON public.customers(gym_id, scanner_id)
  WHERE scanner_id IS NOT NULL;

COMMENT ON COLUMN public.customers.gym_member_id IS
  'Human-readable member ID assigned by the gym (e.g. MEM-001). Unique per gym owner account.';
COMMENT ON COLUMN public.customers.scanner_id IS
  'Numeric enrollment ID on the ZKTeco device. Used to pre-populate scanner_member_map.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. gym_settings — ID format configuration per gym
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gym_settings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Member ID generation
  id_format   text        NOT NULL DEFAULT '',        -- prefix e.g. 'MEM-', 'GYM-', ''
  id_counter  integer     NOT NULL DEFAULT 1          -- next number to assign
                          CHECK (id_counter >= 1),
  id_padding  integer     NOT NULL DEFAULT 3          -- digit width: 3 → 001, 4 → 0001
                          CHECK (id_padding BETWEEN 1 AND 8),

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE(user_id)   -- one settings row per gym owner
);

CREATE INDEX IF NOT EXISTS gym_settings_user_id_idx ON public.gym_settings(user_id);

COMMENT ON TABLE public.gym_settings IS
  'Per-gym configuration. Currently stores member ID format settings.';
COMMENT ON COLUMN public.gym_settings.id_format IS
  'Prefix for generated member IDs (e.g. ''MEM-'', ''GYM-'', or empty string).';
COMMENT ON COLUMN public.gym_settings.id_counter IS
  'The next sequential number to assign when auto-generating a member ID.';
COMMENT ON COLUMN public.gym_settings.id_padding IS
  'Zero-pad width for the numeric portion (3 → 001, 4 → 0001).';

-- Auto-update updated_at on every write
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gym_settings_updated_at ON public.gym_settings;
CREATE TRIGGER gym_settings_updated_at
  BEFORE UPDATE ON public.gym_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.gym_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gym_settings: owner select"
  ON public.gym_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "gym_settings: owner insert"
  ON public.gym_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "gym_settings: owner update"
  ON public.gym_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "gym_settings: owner delete"
  ON public.gym_settings FOR DELETE
  USING (auth.uid() = user_id);
