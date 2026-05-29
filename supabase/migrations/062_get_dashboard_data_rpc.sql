-- Migration 062: Aggregate get_dashboard_data() RPC
--
-- Replaces the 3-4 separate queries that fire on every dashboard visit:
--   1. refreshMember()           → accounts SELECT (47 columns)
--   2. fetchAccountCertificate() → certificates SELECT
--   3. fetchUnreadNotificationCount() → notifications COUNT
--
-- Now a single round-trip returns all three in one JSON envelope:
--   { account: {...}, certificate: {...}|null, unread_notification_count: N }
--
-- SECURITY INVOKER: respects existing RLS policies on all tables.

CREATE OR REPLACE FUNCTION public.get_dashboard_data(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_account JSON;
  v_account_id UUID;
  v_certificate JSON;
  v_unread_count INT;
BEGIN
  -- 1. Fetch essential account fields (lightweight for dashboard rendering)
  --    Includes status_timeline which the dashboard needs for the timeline card.
  SELECT a.id, json_build_object(
    'id', a.id,
    'user_id', a.user_id,
    'full_name', a.full_name,
    'email', a.email,
    'phone', a.phone,
    'address', a.address,
    'district', a.district,
    'firm_name', a.firm_name,
    'license_number', a.license_number,
    'membership_id', a.membership_id,
    'payment_status', a.payment_status,
    'payment_method', a.payment_method,
    'cash_payment_verified', a.cash_payment_verified,
    'approval_status', a.approval_status,
    'account_status', a.account_status,
    'status_timeline', a.status_timeline,
    'created_at', a.created_at,
    'updated_at', a.updated_at
  ) INTO v_account_id, v_account
  FROM public.accounts a
  WHERE a.user_id = p_user_id;

  -- If no account, return early with zeros
  IF v_account IS NULL THEN
    RETURN json_build_object(
      'account', NULL,
      'certificate', NULL,
      'unread_notification_count', 0
    );
  END IF;

  -- 2. Fetch certificate (if exists and has valid URL + certificate_id)
  SELECT json_build_object(
    'id', c.id,
    'member_id', c.member_id,
    'certificate_id', c.certificate_id,
    'certificate_url', c.certificate_url,
    'status', c.status,
    'issued_at', c.issued_at
  ) INTO v_certificate
  FROM public.certificates c
  WHERE c.member_id = v_account_id
    AND c.certificate_url IS NOT NULL
    AND c.certificate_id IS NOT NULL;

  -- 3. Count unread notifications
  SELECT COUNT(*) INTO v_unread_count
  FROM public.notifications n
  WHERE n.user_id = p_user_id
    AND n.read = false;

  RETURN json_build_object(
    'account', v_account,
    'certificate', v_certificate,
    'unread_notification_count', COALESCE(v_unread_count, 0)
  );
END;
$$;

-- Restrict execution to authenticated users only
REVOKE EXECUTE ON FUNCTION public.get_dashboard_data(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_data(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_data(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_dashboard_data IS
  'Returns account profile, certificate, and unread notification count in a single '
  'RPC call. Used by the dashboard screen to avoid 3-4 separate REST queries on every visit.';
