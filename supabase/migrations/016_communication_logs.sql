-- Migration 016: Communication Logs
-- Tracks automated and manual emails sent to customers.

CREATE TABLE IF NOT EXISTS public.communication_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id       uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  customer_id  uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  template_name text, -- e.g., 'EXPIRY_REMINDER'
  recipient_email text NOT NULL,
  subject      text NOT NULL,
  status       text NOT NULL DEFAULT 'sent', -- 'sent', 'failed'
  error_message text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS communication_logs_gym_id_idx ON public.communication_logs(gym_id);
CREATE INDEX IF NOT EXISTS communication_logs_customer_id_idx ON public.communication_logs(customer_id);
CREATE INDEX IF NOT EXISTS communication_logs_created_at_idx ON public.communication_logs(created_at);

-- Add policy for gym owners to see their logs
ALTER TABLE public.communication_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "communication_logs: owner select" 
  ON public.communication_logs 
  FOR SELECT 
  USING (auth.uid() = gym_id);
