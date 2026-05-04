-- Migration 053: Add missing RLS policies for query_performance_logs
-- The table has RLS enabled but the policies were omitted.
-- This ensures admins can safely read the logs, and the service role can insert.

DROP POLICY IF EXISTS "Admins can view query performance logs" ON public.query_performance_logs;
CREATE POLICY "Admins can view query performance logs"
  ON public.query_performance_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role can insert query performance logs" ON public.query_performance_logs;
CREATE POLICY "Service role can insert query performance logs"
  ON public.query_performance_logs FOR INSERT
  TO service_role
  WITH CHECK (true);
