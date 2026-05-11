-- Migration 011: Add scanner_uid to customers for biometric matching
-- Allows a gym owner to enroll a device UID against a specific member.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS scanner_uid text;

-- Index for fast UID lookups during sync
CREATE INDEX IF NOT EXISTS customers_scanner_uid_idx
  ON public.customers(scanner_uid)
  WHERE scanner_uid IS NOT NULL;

COMMENT ON COLUMN public.customers.scanner_uid IS
  'Raw ZKTeco device user UID (enrollment number). Used to match attendance logs to members.';
