-- =========================================================================
-- MIGRATION: Fix mutable search_path on custom functions
-- Resolves all "Function Search Path Mutable" warnings in Security Advisor.
-- Uses individual exception handling blocks to safely complete even if
-- some legacy functions do not exist in your database schema, avoiding
-- any "IF EXISTS" syntax parser issues.
-- =========================================================================

DO $$
BEGIN

    -- 1. Certificate Queue Functions
    BEGIN
        ALTER FUNCTION public.get_next_certificate_job() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.get_next_certificate_job() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.reset_stale_certificate_jobs() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.reset_stale_certificate_jobs() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.mark_certificate_processing(uuid) SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.mark_certificate_processing(uuid) does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.mark_certificate_completed(uuid) SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.mark_certificate_completed(uuid) does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.mark_certificate_failed(uuid, text) SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.mark_certificate_failed(uuid, text) does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.queue_certificate_on_approval() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.queue_certificate_on_approval() does not exist, skipping.';
    END;


    -- 2. Error Logging & Diagnostics
    BEGIN
        ALTER FUNCTION public.get_error_stats(integer) SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.get_error_stats(integer) does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.get_unresolved_critical_errors() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.get_unresolved_critical_errors() does not exist, skipping.';
    END;


    -- 3. Timeline & Lifecycle Triggers
    BEGIN
        ALTER FUNCTION public.initialize_account_timeline() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.initialize_account_timeline() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.update_timeline_on_payment() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.update_timeline_on_payment() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.update_timeline_on_approval() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.update_timeline_on_approval() does not exist, skipping.';
    END;


    -- 4. Notification Hooks
    BEGIN
        ALTER FUNCTION public.notify_payment_success() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.notify_payment_success() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.notify_payment_failed() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.notify_payment_failed() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.notify_approval_change() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.notify_approval_change() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.notify_certificate_issued() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.notify_certificate_issued() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.notification_count_on_insert() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.notification_count_on_insert() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.notification_count_on_update() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.notification_count_on_update() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.notification_count_on_delete() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.notification_count_on_delete() does not exist, skipping.';
    END;


    -- 5. Business Logic, Checks & Utilities
    BEGIN
        ALTER FUNCTION public.update_updated_at() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.update_updated_at() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.check_duplicate_phone() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.check_duplicate_phone() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.check_duplicate_license() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.check_duplicate_license() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.check_failed_payments() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.check_failed_payments() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.is_admin() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.is_admin() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.has_admin_role() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.has_admin_role() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.trigger_refresh_dashboard() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.trigger_refresh_dashboard() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.generate_certificate_id() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.generate_certificate_id() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.generate_membership_id() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.generate_membership_id() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.verify_cash_payment(uuid, text, text) SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.verify_cash_payment(uuid, text, text) does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.is_super_admin() SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.is_super_admin() does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.get_dashboard_data(uuid) SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.get_dashboard_data(uuid) does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.get_user_profile(uuid) SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.get_user_profile(uuid) does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.get_account_with_details(uuid) SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.get_account_with_details(uuid) does not exist, skipping.';
    END;

    BEGIN
        ALTER FUNCTION public.get_pending_applications(integer) SET search_path = pg_catalog, public;
    EXCEPTION WHEN undefined_function THEN
        RAISE NOTICE 'Function public.get_pending_applications(integer) does not exist, skipping.';
    END;

END;
$$;

-- =========================================================================
-- REVERT SCRIPT (To rollback changes if ever needed)
-- =========================================================================
/*
DO $$
BEGIN
    BEGIN ALTER FUNCTION public.get_next_certificate_job() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.reset_stale_certificate_jobs() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.mark_certificate_processing(uuid) RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.mark_certificate_completed(uuid) RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.mark_certificate_failed(uuid, text) RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.queue_certificate_on_approval() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.get_error_stats(integer) RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.get_unresolved_critical_errors() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.initialize_account_timeline() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.update_timeline_on_payment() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.update_timeline_on_approval() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.notify_payment_success() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.notify_payment_failed() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.notify_approval_change() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.notify_certificate_issued() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.notification_count_on_insert() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.notification_count_on_update() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.notification_count_on_delete() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.update_updated_at() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.check_duplicate_phone() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.check_duplicate_license() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.check_failed_payments() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.is_admin() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.has_admin_role() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.trigger_refresh_dashboard() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.generate_certificate_id() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.generate_membership_id() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.verify_cash_payment(uuid, text, text) RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.is_super_admin() RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.get_dashboard_data(uuid) RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.get_user_profile(uuid) RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.get_account_with_details(uuid) RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
    BEGIN ALTER FUNCTION public.get_pending_applications(integer) RESET search_path; EXCEPTION WHEN undefined_function THEN NULL; END;
END;
$$;
*/
