-- ============================================================
-- Migration 012: Scanner Polling Support Tables
-- ============================================================

-- ─────────────────────────────────────────
-- 1. scanner_settings — failure tracking
-- ─────────────────────────────────────────
ALTER TABLE public.scanner_settings
  ADD COLUMN IF NOT EXISTS failed_attempts  integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_failed_at   timestamptz;

-- ─────────────────────────────────────────
-- 2. attendance_logs — status + synced_at
-- ─────────────────────────────────────────
ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS status    text        NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

ALTER TABLE public.attendance_logs
  DROP CONSTRAINT IF EXISTS attendance_logs_status_check;

ALTER TABLE public.attendance_logs
  ADD CONSTRAINT attendance_logs_status_check
    CHECK (status IN ('active', 'expired_member', 'unknown'));

-- ─────────────────────────────────────────
-- 3. scanner_member_map
--    Maps device enrollment UID → customer
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scanner_member_map (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_user_id text NOT NULL,
  customer_id    uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  enrolled_at    timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE(user_id, device_user_id)
);

CREATE INDEX IF NOT EXISTS scanner_member_map_user_id_idx    ON public.scanner_member_map(user_id);
CREATE INDEX IF NOT EXISTS scanner_member_map_customer_id_idx ON public.scanner_member_map(customer_id);

ALTER TABLE public.scanner_member_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scanner_member_map: owner select" ON public.scanner_member_map FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "scanner_member_map: owner insert" ON public.scanner_member_map FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "scanner_member_map: owner update" ON public.scanner_member_map FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "scanner_member_map: owner delete" ON public.scanner_member_map FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- 4. unmatched_scans
--    Holds scans with no member_map entry
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.unmatched_scans (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_user_id text NOT NULL,
  scanned_at     timestamptz NOT NULL,
  punch_type     text NOT NULL DEFAULT 'unknown',
  reviewed       boolean NOT NULL DEFAULT false,
  raw_payload    jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE(user_id, device_user_id, scanned_at)
);

CREATE INDEX IF NOT EXISTS unmatched_scans_user_id_idx   ON public.unmatched_scans(user_id);
CREATE INDEX IF NOT EXISTS unmatched_scans_reviewed_idx  ON public.unmatched_scans(reviewed) WHERE reviewed = false;

ALTER TABLE public.unmatched_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unmatched_scans: owner select" ON public.unmatched_scans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "unmatched_scans: owner update" ON public.unmatched_scans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "unmatched_scans: owner delete" ON public.unmatched_scans FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- 5. scanner_notifications
--    In-app alerts (failure streaks, etc.)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scanner_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text NOT NULL,   -- 'connection_failure' | 'sync_complete' | 'unmatched_batch'
  title      text NOT NULL,
  message    text NOT NULL,
  is_read    boolean NOT NULL DEFAULT false,
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scanner_notifications_user_id_idx ON public.scanner_notifications(user_id);
CREATE INDEX IF NOT EXISTS scanner_notifications_unread_idx  ON public.scanner_notifications(user_id, is_read) WHERE is_read = false;

ALTER TABLE public.scanner_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scanner_notifications: owner select" ON public.scanner_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "scanner_notifications: owner update" ON public.scanner_notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "scanner_notifications: owner delete" ON public.scanner_notifications FOR DELETE USING (auth.uid() = user_id);
