-- Performance: avoid per-row re-evaluation of auth.uid() in RLS policies
-- Use (select auth.uid()) so Postgres can evaluate it once per query (initplan).

-- ============================================================
-- Public schema tables
-- ============================================================

-- Members
ALTER POLICY "Users can view own member record"
  ON public.members
  USING (user_id = (select auth.uid()) OR is_admin());

ALTER POLICY "Users can insert own member record"
  ON public.members
  WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "Users can update own member record"
  ON public.members
  USING (user_id = (select auth.uid()) OR is_admin());

-- Firms
ALTER POLICY "Users can view own firms"
  ON public.firms
  USING (
    member_id IN (SELECT id FROM public.members WHERE user_id = (select auth.uid()))
    OR is_admin()
  );

ALTER POLICY "Users can insert own firms"
  ON public.firms
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE user_id = (select auth.uid())));

ALTER POLICY "Users can update own firms"
  ON public.firms
  USING (
    member_id IN (SELECT id FROM public.members WHERE user_id = (select auth.uid()))
    OR is_admin()
  );

ALTER POLICY "Users can delete own firms"
  ON public.firms
  USING (
    member_id IN (SELECT id FROM public.members WHERE user_id = (select auth.uid()))
    OR is_admin()
  );

-- Payments
ALTER POLICY "Users can view own payments"
  ON public.payments
  USING (
    member_id IN (SELECT id FROM public.members WHERE user_id = (select auth.uid()))
    OR is_admin()
  );

ALTER POLICY "Users can insert own payments"
  ON public.payments
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE user_id = (select auth.uid())));

-- Admin users
ALTER POLICY "Admins can view admin users"
  ON public.admin_users
  USING (user_id = (select auth.uid()) OR is_admin());

-- Fraud flags
ALTER POLICY "Admins can view fraud flags"
  ON public.fraud_flags
  USING (is_admin());

ALTER POLICY "Admins can manage fraud flags"
  ON public.fraud_flags
  USING (is_admin());

-- Audit logs
ALTER POLICY "Admins can view audit logs"
  ON public.audit_logs
  USING (is_admin());

ALTER POLICY "Admins can insert audit logs"
  ON public.audit_logs
  WITH CHECK (is_admin());

-- Certificate downloads
ALTER POLICY "Users can view own downloads"
  ON public.certificate_downloads
  USING (
    member_id IN (SELECT id FROM public.members WHERE user_id = (select auth.uid()))
    OR is_admin()
  );

ALTER POLICY "Users can insert own downloads"
  ON public.certificate_downloads
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE user_id = (select auth.uid())));

-- Certificates
ALTER POLICY "Users can view own certificate"
  ON public.certificates
  USING (
    member_id IN (SELECT id FROM public.members WHERE user_id = (select auth.uid()))
    OR is_admin()
  );

ALTER POLICY "Public can verify certificates"
  ON public.certificates
  USING (true);

-- ============================================================
-- Storage schema policies
-- ============================================================

ALTER POLICY "Members upload own documents"
  ON storage.objects
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.members WHERE user_id = (select auth.uid())
    )
  );

ALTER POLICY "Members read own documents"
  ON storage.objects
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.members WHERE user_id = (select auth.uid())
    )
  );

ALTER POLICY "Admins read all documents"
  ON storage.objects
  USING (
    bucket_id = 'documents'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

ALTER POLICY "Members read own certificate"
  ON storage.objects
  USING (
    bucket_id = 'certificates'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.members WHERE user_id = (select auth.uid())
    )
  );

ALTER POLICY "Admins read all certificates"
  ON storage.objects
  USING (
    bucket_id = 'certificates'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

ALTER POLICY "Members upload own id proof"
  ON storage.objects
  WITH CHECK (
    bucket_id = 'id-proofs'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.members WHERE user_id = (select auth.uid())
    )
  );

ALTER POLICY "Admins read all id proofs"
  ON storage.objects
  USING (
    bucket_id = 'id-proofs'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
  );
