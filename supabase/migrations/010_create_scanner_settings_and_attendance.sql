-- ============================================================
-- Migration 010: Biometric Scanner Integration
-- Creates scanner_settings and attendance_logs tables
-- ============================================================

-- ─────────────────────────────────────────
-- 1. SCANNER SETTINGS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scanner_settings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand                  text NOT NULL DEFAULT 'zkteco',
  ip_address             text NOT NULL,
  port                   integer NOT NULL DEFAULT 4370,
  enabled                boolean NOT NULL DEFAULT true,
  sync_interval_minutes  integer NOT NULL DEFAULT 15,
  last_synced_at         timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scanner_settings_brand_check CHECK (brand IN ('zkteco')),
  CONSTRAINT scanner_settings_port_check CHECK (port > 0 AND port <= 65535),
  CONSTRAINT scanner_settings_interval_check CHECK (sync_interval_minutes >= 1)
);

-- One scanner config per user (can be relaxed later for multi-device)
CREATE UNIQUE INDEX IF NOT EXISTS scanner_settings_user_id_idx ON public.scanner_settings(user_id);

-- ─────────────────────────────────────────
-- 2. ATTENDANCE LOGS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scanner_uid      text NOT NULL,          -- raw UID from the scanner device
  customer_id      uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  punch_time       timestamptz NOT NULL,
  punch_type       text NOT NULL DEFAULT 'check_in',   -- 'check_in' | 'check_out' | 'unknown'
  matched          boolean NOT NULL DEFAULT false,
  raw_payload      jsonb,                  -- full raw record from scanner for debugging
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attendance_logs_punch_type_check CHECK (punch_type IN ('check_in', 'check_out', 'unknown'))
);

CREATE INDEX IF NOT EXISTS attendance_logs_user_id_idx       ON public.attendance_logs(user_id);
CREATE INDEX IF NOT EXISTS attendance_logs_customer_id_idx   ON public.attendance_logs(customer_id);
CREATE INDEX IF NOT EXISTS attendance_logs_punch_time_idx    ON public.attendance_logs(punch_time DESC);

-- Prevent duplicate raw records from the same scanner
CREATE UNIQUE INDEX IF NOT EXISTS attendance_logs_dedup_idx
  ON public.attendance_logs(user_id, scanner_uid, punch_time);

-- ─────────────────────────────────────────
-- 3. auto-update updated_at on scanner_settings
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scanner_settings_updated_at ON public.scanner_settings;
CREATE TRIGGER scanner_settings_updated_at
  BEFORE UPDATE ON public.scanner_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
-- ─────────────────────────────────────────
ALTER TABLE public.scanner_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs  ENABLE ROW LEVEL SECURITY;

-- scanner_settings policies
CREATE POLICY "scanner_settings: owner select"
  ON public.scanner_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "scanner_settings: owner insert"
  ON public.scanner_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "scanner_settings: owner update"
  ON public.scanner_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "scanner_settings: owner delete"
  ON public.scanner_settings FOR DELETE
  USING (auth.uid() = user_id);

-- attendance_logs policies
CREATE POLICY "attendance_logs: owner select"
  ON public.attendance_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "attendance_logs: owner insert"
  ON public.attendance_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "attendance_logs: owner delete"
  ON public.attendance_logs FOR DELETE
  USING (auth.uid() = user_id);
