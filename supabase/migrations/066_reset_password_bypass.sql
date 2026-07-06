-- Migration: Add temporary password reset bypass function for development
-- Created at: 2026-07-06

CREATE OR REPLACE FUNCTION public.reset_password_bypass(
  p_email TEXT,
  p_new_password TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Find the user by email (case-insensitive and trimmed)
  SELECT id INTO v_user_id FROM auth.users WHERE email = LOWER(TRIM(p_email));
  
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Update the password directly in auth.users using bcrypt
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = v_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions;

-- Grant execute permissions to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION public.reset_password_bypass TO anon;
GRANT EXECUTE ON FUNCTION public.reset_password_bypass TO authenticated;
