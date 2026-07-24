-- Migration: Fix Database Linter Warnings (search_path, RLS policies, anon/authenticated execution)
-- Description: Sets search_path on trigger/queue functions, fixes permissive service role RLS policies, and revokes unnecessary anon/authenticated EXECUTE on internal/trigger security definer functions.

BEGIN;

-- ============================================================
-- SECTION 1: FIX FUNCTION SEARCH PATHS (function_search_path_mutable)
-- ============================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'initialize_account_timeline') THEN
        ALTER FUNCTION public.initialize_account_timeline() SET search_path = pg_catalog, public;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'reset_stale_certificate_jobs') THEN
        ALTER FUNCTION public.reset_stale_certificate_jobs() SET search_path = pg_catalog, public;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'update_timeline_on_payment') THEN
        ALTER FUNCTION public.update_timeline_on_payment() SET search_path = pg_catalog, public;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'update_timeline_on_approval') THEN
        ALTER FUNCTION public.update_timeline_on_approval() SET search_path = pg_catalog, public;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'get_next_certificate_job') THEN
        ALTER FUNCTION public.get_next_certificate_job() SET search_path = pg_catalog, public;
    END IF;
END $$;


-- ============================================================
-- SECTION 2: FIX OVERLY PERMISSIVE RLS POLICIES (rls_policy_always_true)
-- ============================================================

-- 1. public.orders
DROP POLICY IF EXISTS "Service role can insert orders" ON public.orders;
CREATE POLICY "Service role can insert orders"
ON public.orders FOR INSERT TO service_role
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role can update orders" ON public.orders;
CREATE POLICY "Service role can update orders"
ON public.orders FOR UPDATE TO service_role
USING ((auth.jwt() ->> 'role') = 'service_role')
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- 2. public.order_items
DROP POLICY IF EXISTS "Service role can insert order items" ON public.order_items;
CREATE POLICY "Service role can insert order items"
ON public.order_items FOR INSERT TO service_role
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- 3. public.payment_signatures
DROP POLICY IF EXISTS "Service role can insert payment signatures" ON public.payment_signatures;
CREATE POLICY "Service role can insert payment signatures"
ON public.payment_signatures FOR INSERT TO service_role
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

DROP POLICY IF EXISTS "Service role can update payment signatures" ON public.payment_signatures;
CREATE POLICY "Service role can update payment signatures"
ON public.payment_signatures FOR UPDATE TO service_role
USING ((auth.jwt() ->> 'role') = 'service_role')
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');


-- ============================================================
-- SECTION 3: REVOKE UNNECESSARY EXECUTE ON SECURITY DEFINER FUNCTIONS (anon & authenticated)
-- ============================================================

-- Trigger / Internal System Functions (Revoke from PUBLIC, anon, authenticated; Grant to service_role)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'check_duplicate_license') THEN
        REVOKE EXECUTE ON FUNCTION public.check_duplicate_license() FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.check_duplicate_license() TO service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'check_duplicate_license_accounts') THEN
        REVOKE EXECUTE ON FUNCTION public.check_duplicate_license_accounts() FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.check_duplicate_license_accounts() TO service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'check_duplicate_phone') THEN
        REVOKE EXECUTE ON FUNCTION public.check_duplicate_phone() FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.check_duplicate_phone() TO service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'check_failed_payments') THEN
        REVOKE EXECUTE ON FUNCTION public.check_failed_payments() FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.check_failed_payments() TO service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'generate_certificate_id') THEN
        REVOKE EXECUTE ON FUNCTION public.generate_certificate_id() FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.generate_certificate_id() TO service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'generate_membership_id') THEN
        REVOKE EXECUTE ON FUNCTION public.generate_membership_id() FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.generate_membership_id() TO service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'handle_new_user_consolidated') THEN
        REVOKE EXECUTE ON FUNCTION public.handle_new_user_consolidated() FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.handle_new_user_consolidated() TO service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'mask_aadhaar_always') THEN
        REVOKE EXECUTE ON FUNCTION public.mask_aadhaar_always() FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.mask_aadhaar_always() TO service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'notification_count_on_delete') THEN
        REVOKE EXECUTE ON FUNCTION public.notification_count_on_delete() FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.notification_count_on_delete() TO service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'notification_count_on_insert') THEN
        REVOKE EXECUTE ON FUNCTION public.notification_count_on_insert() FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.notification_count_on_insert() TO service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'notification_count_on_update') THEN
        REVOKE EXECUTE ON FUNCTION public.notification_count_on_update() FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.notification_count_on_update() TO service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'update_updated_at') THEN
        REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.update_updated_at() TO service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'cleanup_expired_exports') THEN
        REVOKE EXECUTE ON FUNCTION public.cleanup_expired_exports() FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.cleanup_expired_exports() TO service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'reset_password_bypass') THEN
        REVOKE EXECUTE ON FUNCTION public.reset_password_bypass(text, text) FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.reset_password_bypass(text, text) TO service_role;
    END IF;
END $$;

-- User & Admin RPC Endpoints (Revoke from anon, keep for authenticated and service_role)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'check_rate_limit') THEN
        REVOKE EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) FROM anon;
        GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) TO authenticated, service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'get_admin_dashboard_stats') THEN
        REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_stats() FROM anon;
        GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats() TO authenticated, service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'get_district_analytics') THEN
        REVOKE EXECUTE ON FUNCTION public.get_district_analytics() FROM anon;
        GRANT EXECUTE ON FUNCTION public.get_district_analytics() TO authenticated, service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'get_executive_kpis') THEN
        REVOKE EXECUTE ON FUNCTION public.get_executive_kpis() FROM anon;
        GRANT EXECUTE ON FUNCTION public.get_executive_kpis() TO authenticated, service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'get_financial_metrics') THEN
        REVOKE EXECUTE ON FUNCTION public.get_financial_metrics() FROM anon;
        GRANT EXECUTE ON FUNCTION public.get_financial_metrics() TO authenticated, service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'get_membership_renewal_status') THEN
        REVOKE EXECUTE ON FUNCTION public.get_membership_renewal_status() FROM anon;
        GRANT EXECUTE ON FUNCTION public.get_membership_renewal_status() TO authenticated, service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'get_security_metrics') THEN
        REVOKE EXECUTE ON FUNCTION public.get_security_metrics(integer) FROM anon;
        GRANT EXECUTE ON FUNCTION public.get_security_metrics(integer) TO authenticated, service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'get_system_health') THEN
        REVOKE EXECUTE ON FUNCTION public.get_system_health() FROM anon;
        GRANT EXECUTE ON FUNCTION public.get_system_health() TO authenticated, service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'global_admin_search') THEN
        REVOKE EXECUTE ON FUNCTION public.global_admin_search(text) FROM anon;
        GRANT EXECUTE ON FUNCTION public.global_admin_search(text) TO authenticated, service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'has_admin_role') THEN
        REVOKE EXECUTE ON FUNCTION public.has_admin_role(public.admin_role) FROM anon;
        GRANT EXECUTE ON FUNCTION public.has_admin_role(public.admin_role) TO authenticated, service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'has_permission') THEN
        REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM anon;
        GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public' AND proname = 'is_admin') THEN
        REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
        GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
    END IF;
END $$;

COMMIT;
