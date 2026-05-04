-- Fix missing search_path on all custom functions in the public schema
-- This prevents "role mutable search_path" security warnings
-- We use a dynamic DO block to avoid having to specify every exact argument signature.

DO $$
DECLARE
    func_name TEXT;
    func_record RECORD;
    func_list TEXT[] := ARRAY[
        'update_updated_at',
        'check_duplicate_phone',
        'check_duplicate_license',
        'check_failed_payments',
        'is_admin',
        'has_admin_role',
        'generate_membership_id',
        'generate_certificate_id',
        'handle_new_user',
        'initialize_account_timeline',
        'update_timeline_on_payment',
        'update_timeline_on_approval',
        'notify_payment_success',
        'notify_payment_failed',
        'notify_approval_change',
        'notify_certificate_issued',
        'queue_certificate_on_approval',
        'get_next_certificate_job',
        'mark_certificate_processing',
        'mark_certificate_completed',
        'mark_certificate_failed',
        'get_account_with_details',
        'get_pending_applications',
        'refresh_admin_dashboard_summary',
        'get_error_stats',
        'get_unresolved_critical_errors',
        'trigger_refresh_dashboard'
    ];
BEGIN
    FOREACH func_name IN ARRAY func_list
    LOOP
        FOR func_record IN
            SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public' AND p.proname = func_name
        LOOP
            EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = pg_catalog, public;', func_record.proname, func_record.args);
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
