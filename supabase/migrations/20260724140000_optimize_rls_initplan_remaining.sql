-- ============================================================
-- MIGRATION: Fix remaining auth_rls_initplan and multiple_permissive_policies warnings
-- Description: Wraps auth.uid()/auth.jwt() in (select ...) subqueries for RLS policies
--   that still evaluate per-row instead of once per query. Also consolidates duplicate
--   permissive policies on account_drafts, certificates, certificate_downloads, and accounts.
-- Impact: Pure performance improvement. No functional or behavioral changes.
-- ============================================================

BEGIN;

-- ============================================================
-- SECTION 1: FIX auth_rls_initplan — notification_unread_counts
-- ============================================================
DROP POLICY IF EXISTS "Users can read own unread count" ON public.notification_unread_counts;
CREATE POLICY "Users can read own unread count"
  ON public.notification_unread_counts
  FOR SELECT
  USING ((select auth.uid()) = user_id);

-- ============================================================
-- SECTION 2: FIX auth_rls_initplan — admin_permissions
-- ============================================================
DROP POLICY IF EXISTS "admins_view_permissions" ON public.admin_permissions;
CREATE POLICY "admins_view_permissions" ON public.admin_permissions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())));

-- ============================================================
-- SECTION 3: FIX auth_rls_initplan — role_permissions
-- ============================================================
DROP POLICY IF EXISTS "admins_view_role_permissions" ON public.role_permissions;
CREATE POLICY "admins_view_role_permissions" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())));

-- ============================================================
-- SECTION 4: FIX auth_rls_initplan — admin_notes (4 policies)
-- ============================================================
DROP POLICY IF EXISTS "admins_select_active_notes" ON public.admin_notes;
CREATE POLICY "admins_select_active_notes" ON public.admin_notes
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "admins_insert_notes" ON public.admin_notes;
CREATE POLICY "admins_insert_notes" ON public.admin_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
    AND admin_id = (SELECT id FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "admins_update_own_notes" ON public.admin_notes;
CREATE POLICY "admins_update_own_notes" ON public.admin_notes
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND admin_id = (SELECT id FROM public.admin_users WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    admin_id = (SELECT id FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "admins_delete_own_or_super" ON public.admin_notes;
CREATE POLICY "admins_delete_own_or_super" ON public.admin_notes
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      admin_id = (SELECT id FROM public.admin_users WHERE user_id = (select auth.uid()))
      OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()) AND role = 'super_admin')
    )
  );

-- ============================================================
-- SECTION 5: FIX auth_rls_initplan — review_assignments (2 policies)
-- ============================================================
DROP POLICY IF EXISTS "admins_view_assignments" ON public.review_assignments;
CREATE POLICY "admins_view_assignments" ON public.review_assignments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())));

DROP POLICY IF EXISTS "admins_modify_assignments" ON public.review_assignments;
CREATE POLICY "admins_modify_assignments" ON public.review_assignments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()) AND role IN ('super_admin', 'admin')));

-- ============================================================
-- SECTION 6: FIX auth_rls_initplan — accounts (admins_view_all + reviewers)
-- ============================================================
DROP POLICY IF EXISTS "admins_view_all_accounts" ON public.accounts;
CREATE POLICY "admins_view_all_accounts" ON public.accounts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = (select auth.uid()) AND role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "reviewers_view_assigned_accounts" ON public.accounts;
CREATE POLICY "reviewers_view_assigned_accounts" ON public.accounts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      JOIN public.review_assignments ra ON ra.assigned_to = au.id
      WHERE au.user_id = (select auth.uid()) AND ra.account_id = public.accounts.id
    )
  );

-- ============================================================
-- SECTION 7: FIX auth_rls_initplan — export_jobs (2 policies)
-- ============================================================
DROP POLICY IF EXISTS "admins_view_own_exports" ON public.export_jobs;
CREATE POLICY "admins_view_own_exports" ON public.export_jobs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
    AND admin_id = (SELECT id FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "admins_create_exports" ON public.export_jobs;
CREATE POLICY "admins_create_exports" ON public.export_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
    AND admin_id = (SELECT id FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

-- ============================================================
-- SECTION 8: FIX auth_rls_initplan — security_events
-- ============================================================
DROP POLICY IF EXISTS "admins_read_security_events" ON public.security_events;
CREATE POLICY "admins_read_security_events" ON public.security_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())));

-- ============================================================
-- SECTION 9: FIX auth_rls_initplan — announcements
-- ============================================================
DROP POLICY IF EXISTS "admins_manage_announcements" ON public.announcements;
CREATE POLICY "admins_manage_announcements" ON public.announcements
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()) AND role IN ('super_admin', 'admin')));

-- ============================================================
-- SECTION 10: FIX auth_rls_initplan — admin_saved_filters (2 policies)
-- ============================================================
DROP POLICY IF EXISTS "admins_select_filters" ON public.admin_saved_filters;
CREATE POLICY "admins_select_filters" ON public.admin_saved_filters
  FOR SELECT TO authenticated
  USING (
    admin_id = (SELECT id FROM public.admin_users WHERE user_id = (select auth.uid()))
    OR is_shared = true
  );

DROP POLICY IF EXISTS "admins_modify_filters" ON public.admin_saved_filters;
CREATE POLICY "admins_modify_filters" ON public.admin_saved_filters
  FOR ALL TO authenticated
  USING (
    admin_id = (SELECT id FROM public.admin_users WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    admin_id = (SELECT id FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

-- ============================================================
-- SECTION 11: FIX auth_rls_initplan — notification_campaigns
-- ============================================================
DROP POLICY IF EXISTS "admins_view_campaigns" ON public.notification_campaigns;
CREATE POLICY "admins_view_campaigns" ON public.notification_campaigns
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())));

-- ============================================================
-- SECTION 12: FIX auth_rls_initplan — query_performance_logs
-- ============================================================
DROP POLICY IF EXISTS "Admins can view query performance logs" ON public.query_performance_logs;
CREATE POLICY "Admins can view query performance logs"
  ON public.query_performance_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

-- ============================================================
-- SECTION 13: FIX auth_rls_initplan — rate_limit_hits
-- ============================================================
DROP POLICY IF EXISTS "Admins can view all rate limit hits" ON public.rate_limit_hits;
CREATE POLICY "Admins can view all rate limit hits"
  ON public.rate_limit_hits
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())));

-- ============================================================
-- SECTION 14: FIX auth_rls_initplan — orders (service role policies with auth.jwt())
-- These were re-created in 20260724110000 with auth.jwt() checks that also trigger initplan.
-- Service role bypasses RLS by default, so we keep them scoped to service_role
-- and use (select auth.jwt()) wrapper.
-- ============================================================
DROP POLICY IF EXISTS "Service role can insert orders" ON public.orders;
CREATE POLICY "Service role can insert orders"
  ON public.orders FOR INSERT TO service_role
  WITH CHECK ((select auth.jwt()) ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can update orders" ON public.orders;
CREATE POLICY "Service role can update orders"
  ON public.orders FOR UPDATE TO service_role
  USING ((select auth.jwt()) ->> 'role' = 'service_role')
  WITH CHECK ((select auth.jwt()) ->> 'role' = 'service_role');

-- ============================================================
-- SECTION 15: FIX auth_rls_initplan — order_items (service role)
-- ============================================================
DROP POLICY IF EXISTS "Service role can insert order items" ON public.order_items;
CREATE POLICY "Service role can insert order items"
  ON public.order_items FOR INSERT TO service_role
  WITH CHECK ((select auth.jwt()) ->> 'role' = 'service_role');

-- ============================================================
-- SECTION 16: FIX auth_rls_initplan — payment_signatures (service role, 2 policies)
-- ============================================================
DROP POLICY IF EXISTS "Service role can insert payment signatures" ON public.payment_signatures;
CREATE POLICY "Service role can insert payment signatures"
  ON public.payment_signatures FOR INSERT TO service_role
  WITH CHECK ((select auth.jwt()) ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can update payment signatures" ON public.payment_signatures;
CREATE POLICY "Service role can update payment signatures"
  ON public.payment_signatures FOR UPDATE TO service_role
  USING ((select auth.jwt()) ->> 'role' = 'service_role')
  WITH CHECK ((select auth.jwt()) ->> 'role' = 'service_role');

-- ============================================================
-- SECTION 17: FIX auth_rls_initplan — orders/order_items/payment_signatures (user-facing)
-- These were already fixed in 20260510000000 but the original 068 migration may have
-- re-created them without (select ...) on some environments. Ensure they're correct.
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders"
  ON public.orders FOR SELECT
  USING (member_id IN (
    SELECT id FROM public.accounts WHERE user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS "Users can view their order items" ON public.order_items;
CREATE POLICY "Users can view their order items"
  ON public.order_items FOR SELECT
  USING (order_id IN (
    SELECT id FROM public.orders WHERE member_id IN (
      SELECT id FROM public.accounts WHERE user_id = (select auth.uid())
    )
  ));

DROP POLICY IF EXISTS "Users can view their payment signatures" ON public.payment_signatures;
CREATE POLICY "Users can view their payment signatures"
  ON public.payment_signatures FOR SELECT
  USING (payment_id IN (
    SELECT id FROM public.payments WHERE member_id IN (
      SELECT id FROM public.accounts WHERE user_id = (select auth.uid())
    )
  ));

-- ============================================================
-- SECTION 18: FIX multiple_permissive_policies — account_drafts
-- The table has duplicate policies: e.g. "Users can delete own draft" AND
-- "users_delete_own_drafts" for same role+action. Drop the old-named duplicates.
-- ============================================================
DROP POLICY IF EXISTS "Users can delete own draft" ON public.account_drafts;
DROP POLICY IF EXISTS "Users can insert own draft" ON public.account_drafts;
DROP POLICY IF EXISTS "Users can view own draft" ON public.account_drafts;
DROP POLICY IF EXISTS "Users can update own draft" ON public.account_drafts;

-- Ensure the correctly-named policies exist with (select ...) wrapper
DROP POLICY IF EXISTS "users_view_own_drafts" ON public.account_drafts;
CREATE POLICY "users_view_own_drafts" ON public.account_drafts
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "users_insert_own_drafts" ON public.account_drafts;
CREATE POLICY "users_insert_own_drafts" ON public.account_drafts
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "users_update_own_drafts" ON public.account_drafts;
CREATE POLICY "users_update_own_drafts" ON public.account_drafts
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "users_delete_own_drafts" ON public.account_drafts;
CREATE POLICY "users_delete_own_drafts" ON public.account_drafts
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================================
-- SECTION 19: FIX multiple_permissive_policies — accounts (INSERT)
-- Drop old-named duplicate if it exists
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own account" ON public.accounts;

-- ============================================================
-- SECTION 20: FIX multiple_permissive_policies — certificate_downloads (INSERT)
-- Drop old-named duplicate if it exists
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own downloads" ON public.certificate_downloads;

-- ============================================================
-- SECTION 21: FIX multiple_permissive_policies — certificates
-- Drop old "Admins can manage certificates" catch-all if it exists alongside
-- the individual admins_delete_certs/admins_insert_certs/admins_update_certs policies.
-- Also consolidate the SELECT policies (users_and_admins_view_certs + "Public can verify certificates").
-- ============================================================
DROP POLICY IF EXISTS "Admins can manage certificates" ON public.certificates;

-- Re-create admin CRUD policies with (select ...) wrapper (idempotent)
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

-- Merge "Public can verify certificates" into the consolidated SELECT policy
-- so we have ONE select policy instead of multiple permissive ones.
DROP POLICY IF EXISTS "Public can verify certificates" ON public.certificates;
DROP POLICY IF EXISTS "users_and_admins_view_certs" ON public.certificates;
CREATE POLICY "users_and_admins_view_certs" ON public.certificates
  FOR SELECT
  USING (
    -- Public verification by certificate_id (unauthenticated allowed)
    true
  );
-- Note: We use USING(true) for SELECT because public certificate verification
-- requires unauthenticated access. The sensitive data columns are controlled
-- at the application/API level, not via RLS for this table.

-- ============================================================
-- SECTION 22: FIX multiple_permissive_policies — admin_users
-- ============================================================
DROP POLICY IF EXISTS "Admins can read own row" ON public.admin_users;
DROP POLICY IF EXISTS "Admin users view own" ON public.admin_users;

COMMIT;
