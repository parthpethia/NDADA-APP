-- Migration 054: Switch is_super_admin to SECURITY INVOKER
-- Since users can read their own row in admin_users via the basic SELECT policy,
-- this function doesn't actually need to bypass RLS. Making it SECURITY INVOKER 
-- resolves the Supabase security warning about exposed SECURITY DEFINER functions.

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public;
