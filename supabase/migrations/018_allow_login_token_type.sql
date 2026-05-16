-- Modify password_reset_tokens type check to allow both 'admin' and 'login'
ALTER TABLE public.password_reset_tokens
  DROP CONSTRAINT IF EXISTS password_reset_tokens_type_check;

ALTER TABLE public.password_reset_tokens
  ADD CONSTRAINT password_reset_tokens_type_check CHECK (type IN ('admin', 'login'));
