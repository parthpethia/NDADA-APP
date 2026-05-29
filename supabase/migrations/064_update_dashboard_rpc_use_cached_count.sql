-- ============================================================
-- MIGRATION 064: Update Dashboard RPC — Use Cached Unread Count
-- ============================================================
-- Replaces the COUNT(*) scan on notifications with an O(1) lookup
-- from the notification_unread_counts table (maintained by triggers
-- in migration 063).
-- ============================================================

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

  -- 3. Read cached unread count (O(1) PK lookup vs COUNT scan)
  SELECT COALESCE(uc.count, 0) INTO v_unread_count
  FROM public.notification_unread_counts uc
  WHERE uc.user_id = p_user_id;

  -- If no row exists yet (user has never received a notification), default to 0
  IF v_unread_count IS NULL THEN
    v_unread_count := 0;
  END IF;

  RETURN json_build_object(
    'account', v_account,
    'certificate', v_certificate,
    'unread_notification_count', COALESCE(v_unread_count, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.get_dashboard_data IS
  'Returns account profile, certificate, and unread notification count in a single '
  'RPC call. Uses the cached notification_unread_counts table for O(1) count lookup.';
