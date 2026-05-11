-- ============================================================
-- Migration 015: generate_gym_member_id() Postgres function
--
-- Atomically reads the gym's ID settings, generates the next
-- member ID, and increments id_counter — all inside one
-- transaction with a row-level lock (SELECT ... FOR UPDATE).
--
-- Two simultaneous calls will serialize:
--   Call A acquires the lock → generates MEM-007 → increments to 8
--   Call B waits → then generates MEM-008
-- This guarantees no two members ever receive the same ID.
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_gym_member_id(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER   -- runs with table owner privileges, bypassing RLS for the counter
AS $$
DECLARE
  v_format  text    := '';
  v_counter integer := 1;
  v_padding integer := 3;
  v_id      text;
BEGIN
  -- ── Step 1: Lock the settings row for this gym ──────────────────────────
  -- FOR UPDATE acquires a row-level exclusive lock.
  -- If no row exists yet we fall through to the IF NOT FOUND block.
  SELECT id_format, id_counter, id_padding
  INTO   v_format, v_counter, v_padding
  FROM   public.gym_settings
  WHERE  user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- First time this gym generates an ID: insert a defaults row.
    -- ON CONFLICT handles the rare race where two calls both find no row.
    INSERT INTO public.gym_settings(user_id, id_format, id_counter, id_padding)
    VALUES (p_user_id, '', 1, 3)
    ON CONFLICT (user_id) DO NOTHING;

    -- Re-acquire the lock now that the row exists.
    SELECT id_format, id_counter, id_padding
    INTO   v_format, v_counter, v_padding
    FROM   public.gym_settings
    WHERE  user_id = p_user_id
    FOR UPDATE;

    -- Extreme edge case: still not found — use bare defaults.
    IF NOT FOUND THEN
      v_format  := '';
      v_counter := 1;
      v_padding := 3;
    END IF;
  END IF;

  -- ── Step 2: Generate the ID ─────────────────────────────────────────────
  -- Combine prefix with zero-padded counter.
  -- lpad('7', 3, '0') → '007'  |  lpad('12', 4, '0') → '0012'
  -- If counter digits exceed padding width, lpad returns the full number
  -- unchanged (e.g. lpad('1000', 3, '0') → '1000') — no silent truncation.
  v_id := v_format || lpad(v_counter::text, v_padding, '0');

  -- ── Step 3: Increment the counter ──────────────────────────────────────
  UPDATE public.gym_settings
  SET    id_counter = v_counter + 1,
         updated_at = now()
  WHERE  user_id = p_user_id;

  -- ── Step 4: Return the generated ID ────────────────────────────────────
  RETURN v_id;
END;
$$;

-- Allow authenticated users to call this function (RLS on the table
-- is bypassed by SECURITY DEFINER; the WHERE user_id = p_user_id
-- clause ensures each caller can only generate IDs for themselves).
REVOKE ALL  ON FUNCTION public.generate_gym_member_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_gym_member_id(uuid) TO authenticated;

COMMENT ON FUNCTION public.generate_gym_member_id(uuid) IS
  'Atomically generates the next gym member ID for the given gym owner.
   Uses SELECT FOR UPDATE to serialize concurrent calls.
   Returns a string like ''MEM-007'' or ''0012'' depending on gym_settings.';
