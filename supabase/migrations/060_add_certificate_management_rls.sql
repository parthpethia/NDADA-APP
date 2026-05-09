-- ============================================================
-- MIGRATION 060: Add Certificate Management RLS Policies
-- ============================================================
-- Adds DELETE and INSERT policies for admins on certificates table
-- Enables full CRUD from admin panel via service role or admin RLS
-- ============================================================

-- Allow admins to delete certificates
CREATE POLICY "admins_delete_certs"
  ON public.certificates
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  ));

-- Allow admins to insert certificates (for manual upload)
CREATE POLICY "admins_insert_certs"
  ON public.certificates
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  ));

-- Allow admins to update certificates (for revoke/regenerate)
CREATE POLICY "admins_update_certs"
  ON public.certificates
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  ));

-- Also allow admins to delete certificate downloads (cleanup)
CREATE POLICY "admins_delete_cert_downloads"
  ON public.certificate_downloads
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  ));
