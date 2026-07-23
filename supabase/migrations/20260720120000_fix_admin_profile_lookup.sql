-- Migration: Fix Admin Profile Lookup in get_user_profile() RPC
-- Created at: 2026-07-20 12:00:00
-- Version: 20260720120000

CREATE OR REPLACE FUNCTION public.get_user_profile(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_account JSON;
  v_admin JSON;
BEGIN
  -- Fetch essential account fields
  SELECT json_build_object(
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
    'created_at', a.created_at,
    'updated_at', a.updated_at
  ) INTO v_account
  FROM public.accounts a
  WHERE a.user_id = p_user_id;

  -- Always check admin_users table regardless of whether v_account exists
  SELECT json_build_object(
    'id', au.id,
    'user_id', au.user_id,
    'email', au.email,
    'role', au.role,
    'created_at', au.created_at
  ) INTO v_admin
  FROM public.admin_users au
  WHERE au.user_id = p_user_id;

  RETURN json_build_object(
    'account', v_account,
    'admin', v_admin
  );
END;
$$;

-- Restrict execution permissions
REVOKE EXECUTE ON FUNCTION public.get_user_profile(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_profile(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_profile(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_user_profile IS
  'Returns lightweight account profile + admin status in a single RPC call. Always checks admin_users table independently of account presence.';
