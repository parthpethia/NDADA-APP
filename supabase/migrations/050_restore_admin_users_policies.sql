-- Migration 050: Restore missing RLS policies for admin_users
-- The table has RLS enabled but the policies were omitted
-- during the schema consolidation in migration 038.
-- Without these, admins cannot even verify their own roles!

-- Helper function to avoid infinite recursion in RLS policies
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Restrict function execution
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- Policies for admin_users

DROP POLICY IF EXISTS "Admins can view admin users" ON public.admin_users;
CREATE POLICY "Admins can view admin users"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_super_admin());

DROP POLICY IF EXISTS "Super admins can insert admin users" ON public.admin_users;
CREATE POLICY "Super admins can insert admin users"
  ON public.admin_users FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Super admins can update admin users" ON public.admin_users;
CREATE POLICY "Super admins can update admin users"
  ON public.admin_users FOR UPDATE
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "Super admins can delete admin users" ON public.admin_users;
CREATE POLICY "Super admins can delete admin users"
  ON public.admin_users FOR DELETE
  TO authenticated
  USING (is_super_admin());
