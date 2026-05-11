-- Migration 013: Rename attendance_logs columns to match spec
-- scanner_uid  → device_user_id
-- punch_time   → scanned_at

ALTER TABLE public.attendance_logs RENAME COLUMN scanner_uid  TO device_user_id;
ALTER TABLE public.attendance_logs RENAME COLUMN punch_time   TO scanned_at;

-- Rebuild the dedup unique index with the new column names
DROP INDEX IF EXISTS attendance_logs_scanner_uid_punch_time_idx;
DROP INDEX IF EXISTS idx_attendance_logs_scanner_uid;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_logs_dedup_idx
  ON public.attendance_logs(user_id, device_user_id, scanned_at);

CREATE INDEX IF NOT EXISTS attendance_logs_customer_id_idx
  ON public.attendance_logs(customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS attendance_logs_scanned_at_idx
  ON public.attendance_logs(user_id, scanned_at DESC);

COMMENT ON COLUMN public.attendance_logs.device_user_id IS
  'Raw enrollment ID from the ZKTeco device (matches scanner_member_map.device_user_id).';
COMMENT ON COLUMN public.attendance_logs.scanned_at IS
  'Timestamp of the punch as recorded by the device clock.';
COMMENT ON COLUMN public.attendance_logs.synced_at IS
  'Timestamp when this record was pulled from the device by the polling service.';
COMMENT ON COLUMN public.attendance_logs.status IS
  'Membership status at time of scan: active | expired_member | unknown.';
