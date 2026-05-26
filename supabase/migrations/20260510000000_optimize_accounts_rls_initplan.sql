-- Optimize RLS policies across all tables by wrapping auth.uid() in a subquery
-- This avoids re-evaluating the function for each row, significantly improving query performance.

-- ==========================================
-- 1. Optimize public.accounts
-- ==========================================
DROP POLICY IF EXISTS "users_view_own_account" ON public.accounts;
DROP POLICY IF EXISTS "admins_view_all_accounts" ON public.accounts;
DROP POLICY IF EXISTS "users_insert_own_account" ON public.accounts;
DROP POLICY IF EXISTS "users_update_own_account" ON public.accounts;
DROP POLICY IF EXISTS "Users can view own account" ON public.accounts;
DROP POLICY IF EXISTS "Admins can view all accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can insert own account" ON public.accounts;
DROP POLICY IF EXISTS "Users can update own account" ON public.accounts;
DROP POLICY IF EXISTS "Admins can update accounts" ON public.accounts;

CREATE POLICY "users_view_own_account" ON public.accounts FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "admins_view_all_accounts" ON public.accounts FOR SELECT USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())));
CREATE POLICY "users_insert_own_account" ON public.accounts FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "users_update_own_account" ON public.accounts FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Admins can update accounts" ON public.accounts FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())));

-- ==========================================
-- 2. Optimize public.payments
-- ==========================================
DROP POLICY IF EXISTS "users_view_own_payments" ON public.payments;
DROP POLICY IF EXISTS "admins_view_all_payments" ON public.payments;

CREATE POLICY "users_view_own_payments" ON public.payments FOR SELECT USING (EXISTS (SELECT 1 FROM public.accounts WHERE id = member_id AND user_id = (select auth.uid())));
CREATE POLICY "admins_view_all_payments" ON public.payments FOR SELECT USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())));

-- ==========================================
-- 3. Optimize public.certificates
-- ==========================================
DROP POLICY IF EXISTS "users_view_own_certs" ON public.certificates;
DROP POLICY IF EXISTS "admins_view_all_certs" ON public.certificates;

CREATE POLICY "users_view_own_certs" ON public.certificates FOR SELECT USING (EXISTS (SELECT 1 FROM public.accounts WHERE id = member_id AND user_id = (select auth.uid())));
CREATE POLICY "admins_view_all_certs" ON public.certificates FOR SELECT USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())));

-- ==========================================
-- 4. Optimize public.account_drafts
-- ==========================================
DROP POLICY IF EXISTS "users_view_own_drafts" ON public.account_drafts;
DROP POLICY IF EXISTS "users_insert_own_drafts" ON public.account_drafts;
DROP POLICY IF EXISTS "users_update_own_drafts" ON public.account_drafts;
DROP POLICY IF EXISTS "users_delete_own_drafts" ON public.account_drafts;

CREATE POLICY "users_view_own_drafts" ON public.account_drafts FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "users_insert_own_drafts" ON public.account_drafts FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "users_update_own_drafts" ON public.account_drafts FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "users_delete_own_drafts" ON public.account_drafts FOR DELETE USING ((select auth.uid()) = user_id);

-- ==========================================
-- 5. Optimize public.notifications
-- ==========================================
DROP POLICY IF EXISTS "users_read_own_notif" ON public.notifications;
DROP POLICY IF EXISTS "users_update_own_notif" ON public.notifications;

CREATE POLICY "users_read_own_notif" ON public.notifications FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "users_update_own_notif" ON public.notifications FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ==========================================
-- 6. Optimize public.certificate_generation_queue
-- ==========================================
DROP POLICY IF EXISTS "admins_view_queue" ON public.certificate_generation_queue;

CREATE POLICY "admins_view_queue" ON public.certificate_generation_queue FOR SELECT USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())));

-- ==========================================
-- 7. Optimize public.error_logs
-- ==========================================
DROP POLICY IF EXISTS "users_view_own_errors" ON public.error_logs;
DROP POLICY IF EXISTS "admins_update_errors" ON public.error_logs;

CREATE POLICY "users_view_own_errors" ON public.error_logs FOR SELECT USING ((select auth.uid()) = user_id OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())));
CREATE POLICY "admins_update_errors" ON public.error_logs FOR UPDATE USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())));

-- ==========================================
-- 8. Optimize public.admin_users
-- ==========================================
DROP POLICY IF EXISTS "Admins can view admin users" ON public.admin_users;

CREATE POLICY "Admins can view admin users"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()) OR is_super_admin());

-- Also optimize the is_super_admin function if it uses auth.uid() directly
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = (select auth.uid()) AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ==========================================
-- 9. Optimize public.certificate_downloads
-- ==========================================
DROP POLICY IF EXISTS "users_insert_own_downloads" ON public.certificate_downloads;
DROP POLICY IF EXISTS "users_view_own_downloads" ON public.certificate_downloads;
DROP POLICY IF EXISTS "admins_view_all_downloads" ON public.certificate_downloads;

CREATE POLICY "users_insert_own_downloads"
  ON public.certificate_downloads FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = member_id AND user_id = (select auth.uid())
    )
  );

CREATE POLICY "users_view_own_downloads"
  ON public.certificate_downloads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = member_id AND user_id = (select auth.uid())
    )
  );

CREATE POLICY "admins_view_all_downloads"
  ON public.certificate_downloads FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

-- ==========================================
-- 10. Optimize public.orders
-- ==========================================
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders"
  ON public.orders FOR SELECT
  USING (member_id IN (
    SELECT id FROM public.accounts WHERE user_id = (select auth.uid())
  ));

-- ==========================================
-- 11. Optimize public.order_items
-- ==========================================
DROP POLICY IF EXISTS "Users can view their order items" ON public.order_items;
CREATE POLICY "Users can view their order items"
  ON public.order_items FOR SELECT
  USING (order_id IN (
    SELECT id FROM public.orders WHERE member_id IN (
      SELECT id FROM public.accounts WHERE user_id = (select auth.uid())
    )
  ));

-- ==========================================
-- 12. Optimize public.payment_signatures
-- ==========================================
DROP POLICY IF EXISTS "Users can view their payment signatures" ON public.payment_signatures;
CREATE POLICY "Users can view their payment signatures"
  ON public.payment_signatures FOR SELECT
  USING (payment_id IN (
    SELECT id FROM public.payments WHERE member_id IN (
      SELECT id FROM public.accounts WHERE user_id = (select auth.uid())
    )
  ));

-- ==========================================
-- 13. Optimize public.cash_payment_verifications
-- ==========================================
DROP POLICY IF EXISTS "Users can view their own cash payment verifications" ON public.cash_payment_verifications;
DROP POLICY IF EXISTS "Admins can view all cash payment verifications" ON public.cash_payment_verifications;
CREATE POLICY "Users can view their own cash payment verifications"
  ON public.cash_payment_verifications FOR SELECT
  USING (member_id IN (
    SELECT id FROM public.accounts WHERE user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "Admins can view all cash payment verifications" ON public.cash_payment_verifications;
CREATE POLICY "Admins can view all cash payment verifications"
  ON public.cash_payment_verifications FOR SELECT
  USING (
    verified_by IN (
      SELECT id FROM public.accounts
      WHERE user_id IN (SELECT user_id FROM public.admin_users)
    )
    OR member_id IN (SELECT id FROM public.accounts WHERE user_id = (select auth.uid()))
  );

-- ==========================================
-- 14. Optimize public.audit_logs
-- ==========================================
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.audit_logs;
CREATE POLICY "Admins can insert audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

-- ==========================================
-- 15. Optimize public.fraud_flags
-- ==========================================
DROP POLICY IF EXISTS "Admins can view fraud flags" ON public.fraud_flags;
CREATE POLICY "Admins can view fraud flags"
  ON public.fraud_flags FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Admins can insert fraud flags" ON public.fraud_flags;
CREATE POLICY "Admins can insert fraud flags"
  ON public.fraud_flags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Admins can update fraud flags" ON public.fraud_flags;
CREATE POLICY "Admins can update fraud flags"
  ON public.fraud_flags FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Admins can delete fraud flags" ON public.fraud_flags;
CREATE POLICY "Admins can delete fraud flags"
  ON public.fraud_flags FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

-- ==========================================
-- 16. Optimize public.query_performance_logs
-- ==========================================
DROP POLICY IF EXISTS "Admins can view query performance logs" ON public.query_performance_logs;
CREATE POLICY "Admins can view query performance logs"
  ON public.query_performance_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

-- ==========================================
-- 17. Additional optimizations for public.certificates
-- ==========================================
DROP POLICY IF EXISTS "admins_delete_certs" ON public.certificates;
CREATE POLICY "admins_delete_certs"
  ON public.certificates FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "admins_insert_certs" ON public.certificates;
CREATE POLICY "admins_insert_certs"
  ON public.certificates FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "admins_update_certs" ON public.certificates;
CREATE POLICY "admins_update_certs"
  ON public.certificates FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())
  ));

-- ==========================================
-- 18. Additional optimizations for public.certificate_downloads
-- ==========================================
DROP POLICY IF EXISTS "admins_delete_cert_downloads" ON public.certificate_downloads;
CREATE POLICY "admins_delete_cert_downloads"
  ON public.certificate_downloads FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())
  ));

-- ==========================================
-- 19. Additional optimizations for public.cash_payment_verifications
-- ==========================================
DROP POLICY IF EXISTS "Admins can insert cash payment verifications" ON public.cash_payment_verifications;
CREATE POLICY "Admins can insert cash payment verifications" 
  ON public.cash_payment_verifications FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())));
