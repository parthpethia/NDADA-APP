-- Migration 052: Restore missing RLS policies for fraud_flags
-- The table has RLS enabled but the policies were omitted
-- during the schema consolidation.
-- This ensures admins can safely read and write to the fraud flags.

DROP POLICY IF EXISTS "Admins can view fraud flags" ON public.fraud_flags;
CREATE POLICY "Admins can view fraud flags"
  ON public.fraud_flags FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins can insert fraud flags" ON public.fraud_flags;
CREATE POLICY "Admins can insert fraud flags"
  ON public.fraud_flags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins can update fraud flags" ON public.fraud_flags;
CREATE POLICY "Admins can update fraud flags"
  ON public.fraud_flags FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins can delete fraud flags" ON public.fraud_flags;
CREATE POLICY "Admins can delete fraud flags"
  ON public.fraud_flags FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );
