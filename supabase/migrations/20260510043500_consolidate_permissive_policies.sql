-- Consolidate permissive policies for various tables to fix performance warnings

-- ==========================================
-- 1. Optimize public.accounts
-- ==========================================
DROP POLICY IF EXISTS "users_view_own_account" ON public.accounts;
DROP POLICY IF EXISTS "admins_view_all_accounts" ON public.accounts;
DROP POLICY IF EXISTS "users_update_own_account" ON public.accounts;
DROP POLICY IF EXISTS "Admins can update accounts" ON public.accounts;
DROP POLICY IF EXISTS "users_and_admins_view_accounts" ON public.accounts;
DROP POLICY IF EXISTS "users_and_admins_update_accounts" ON public.accounts;

CREATE POLICY "users_and_admins_view_accounts" ON public.accounts FOR SELECT TO authenticated USING (
  user_id = (select auth.uid()) OR 
  EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
);

CREATE POLICY "users_and_admins_update_accounts" ON public.accounts FOR UPDATE TO authenticated USING (
  user_id = (select auth.uid()) OR 
  EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
) WITH CHECK (
  user_id = (select auth.uid()) OR 
  EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
);

-- ==========================================
-- 2. Optimize public.payments
-- ==========================================
DROP POLICY IF EXISTS "users_view_own_payments" ON public.payments;
DROP POLICY IF EXISTS "admins_view_all_payments" ON public.payments;
DROP POLICY IF EXISTS "users_and_admins_view_payments" ON public.payments;

CREATE POLICY "users_and_admins_view_payments" ON public.payments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.accounts WHERE id = member_id AND user_id = (select auth.uid())) OR
  EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
);

-- ==========================================
-- 3. Optimize public.certificates
-- ==========================================
DROP POLICY IF EXISTS "users_view_own_certs" ON public.certificates;
DROP POLICY IF EXISTS "admins_view_all_certs" ON public.certificates;
DROP POLICY IF EXISTS "users_and_admins_view_certs" ON public.certificates;

CREATE POLICY "users_and_admins_view_certs" ON public.certificates FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.accounts WHERE id = member_id AND user_id = (select auth.uid())) OR
  EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
);

-- ==========================================
-- 4. Optimize public.certificate_downloads
-- ==========================================
DROP POLICY IF EXISTS "users_view_own_downloads" ON public.certificate_downloads;
DROP POLICY IF EXISTS "admins_view_all_downloads" ON public.certificate_downloads;
DROP POLICY IF EXISTS "users_and_admins_view_downloads" ON public.certificate_downloads;

CREATE POLICY "users_and_admins_view_downloads"
  ON public.certificate_downloads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = member_id AND user_id = (select auth.uid())
    ) OR
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

-- ==========================================
-- 5. Optimize public.cash_payment_verifications
-- ==========================================
DROP POLICY IF EXISTS "Users can view their own cash payment verifications" ON public.cash_payment_verifications;
DROP POLICY IF EXISTS "Admins can view all cash payment verifications" ON public.cash_payment_verifications;
DROP POLICY IF EXISTS "Users and admins can view cash payment verifications" ON public.cash_payment_verifications;

CREATE POLICY "Users and admins can view cash payment verifications"
  ON public.cash_payment_verifications FOR SELECT
  TO authenticated
  USING (
    verified_by IN (
      SELECT id FROM public.accounts
      WHERE user_id IN (SELECT user_id FROM public.admin_users)
    )
    OR member_id IN (SELECT id FROM public.accounts WHERE user_id = (select auth.uid()))
  );
