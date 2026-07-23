-- Migration: Consolidate admin dashboard stats into single RPC
-- Replaces 5 separate COUNT(*) queries with a single function call

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_total_members bigint;
  v_total_firms bigint;
  v_payments_completed bigint;
  v_certificates_issued bigint;
  v_pending_reviews bigint;
BEGIN
  -- Authenticate: only admin users may call this function
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = v_user_id
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  -- Collect all five counts in a single scan pass where possible
  SELECT COUNT(*) INTO v_total_members FROM public.accounts;

  SELECT COUNT(*) INTO v_total_firms
    FROM public.accounts
   WHERE firm_name IS NOT NULL AND firm_name <> '';

  SELECT COUNT(*) INTO v_payments_completed
    FROM public.payments
   WHERE status = 'paid';

  SELECT COUNT(*) INTO v_certificates_issued FROM public.certificates;

  SELECT COUNT(*) INTO v_pending_reviews
    FROM public.accounts
   WHERE approval_status = 'pending';

  RETURN jsonb_build_object(
    'total_members', v_total_members,
    'total_firms', v_total_firms,
    'payments_completed', v_payments_completed,
    'certificates_issued', v_certificates_issued,
    'pending_reviews', v_pending_reviews
  );
END;
$$;

-- Revoke public execute, grant only to authenticated users
-- (the function itself checks admin_users membership)
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats() TO authenticated;

COMMENT ON FUNCTION public.get_admin_dashboard_stats() IS
  'Returns all admin dashboard KPI counts in a single DB round-trip. Admin-only.';
