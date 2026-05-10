-- Create admin_credentials table for storing admin passwords
CREATE TABLE IF NOT EXISTS public.admin_credentials (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  password_salt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny direct admin credential reads"
  ON public.admin_credentials
  FOR SELECT
  USING (false);

CREATE POLICY "Deny direct admin credential inserts"
  ON public.admin_credentials
  FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Deny direct admin credential updates"
  ON public.admin_credentials
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Deny direct admin credential deletes"
  ON public.admin_credentials
  FOR DELETE
  USING (false);

-- Add comment
COMMENT ON TABLE public.admin_credentials IS 'Stores admin password hashes for gym owners/admins';
