-- Performance: avoid multiple permissive RLS policies for the same role/action
-- Fix fraud_flags so SELECT has a single permissive policy and anon doesn't evaluate admin policies.

-- Ensure SELECT is handled by a single policy and only for authenticated users
ALTER POLICY "Admins can view fraud flags"
  ON public.fraud_flags
  TO authenticated;

-- Replace overly broad FOR ALL policy with write-only policies
DROP POLICY IF EXISTS "Admins can manage fraud flags" ON public.fraud_flags;

DROP POLICY IF EXISTS "Admins can insert fraud flags" ON public.fraud_flags;
CREATE POLICY "Admins can insert fraud flags"
  ON public.fraud_flags
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can update fraud flags" ON public.fraud_flags;
CREATE POLICY "Admins can update fraud flags"
  ON public.fraud_flags
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can delete fraud flags" ON public.fraud_flags;
CREATE POLICY "Admins can delete fraud flags"
  ON public.fraud_flags
  FOR DELETE
  TO authenticated
  USING (is_admin());
