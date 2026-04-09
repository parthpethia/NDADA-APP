-- Performance: avoid multiple permissive RLS policies for the same role/action
-- Fix admin_users so SELECT has a single permissive policy and anon doesn't evaluate admin policies.

-- Limit admin_users policies to authenticated users only
ALTER POLICY "Admins can view admin users"
  ON public.admin_users
  TO authenticated;

-- Replace overly broad FOR ALL policy with write-only policies
-- If this script was run before and failed mid-way, an INSERT-only policy with the old name
-- may already exist. Drop it so the migration can be re-run safely.
DROP POLICY IF EXISTS "Super admins can manage admin users" ON public.admin_users;

DROP POLICY IF EXISTS "Super admins can insert admin users" ON public.admin_users;
CREATE POLICY "Super admins can insert admin users"
  ON public.admin_users
  FOR INSERT
  TO authenticated
  WITH CHECK (has_admin_role('super_admin'));

DROP POLICY IF EXISTS "Super admins can update admin users" ON public.admin_users;
CREATE POLICY "Super admins can update admin users"
  ON public.admin_users
  FOR UPDATE
  TO authenticated
  USING (has_admin_role('super_admin'))
  WITH CHECK (has_admin_role('super_admin'));

DROP POLICY IF EXISTS "Super admins can delete admin users" ON public.admin_users;
CREATE POLICY "Super admins can delete admin users"
  ON public.admin_users
  FOR DELETE
  TO authenticated
  USING (has_admin_role('super_admin'));
