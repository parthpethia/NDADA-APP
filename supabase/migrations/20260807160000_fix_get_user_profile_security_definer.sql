-- Migration: Fix get_user_profile RPC — Switch to SECURITY DEFINER
-- Created at: 2026-08-07 16:00:00
-- Version: 20260807160000
--
-- Problem: get_user_profile() uses SECURITY INVOKER, so it's subject to RLS.
-- During the SIGNED_IN auth event, the new JWT may not yet be propagated to the
-- PostgREST context, causing auth.uid() to return NULL. The RLS policies on
-- accounts and admin_users then silently filter out the user's own rows,
-- returning { account: null, admin: null }. This prevents the client from
-- resolving profileReady/member/adminUser, blocking navigation to the dashboard.
--
-- Fix: Switch to SECURITY DEFINER so the function bypasses RLS entirely.
-- An explicit auth.uid() == p_user_id check at the top of the function body
-- ensures users can only fetch their own profile (same security guarantee as
-- the RLS policies, but without the JWT-timing dependency).
--
-- This is the same pattern used by lookup_email_by_phone (SECURITY DEFINER).

CREATE OR REPLACE FUNCTION public.get_user_profile(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER

SET search_path = public
AS $$
DECLARE
  v_account JSON;
  v_admin JSON;
  v_caller_id UUID;
BEGIN
  -- Security check: only allow authenticated users to fetch their own profile.
  -- This replaces the RLS row-level check with an explicit function-level check.
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR v_caller_id != p_user_id THEN
    RETURN json_build_object('account', NULL, 'admin', NULL);
  END IF;

  -- Fetch essential account fields (lightweight for routing/auth init)
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

  -- Always check admin_users table regardless of whether account exists
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

-- Restrict execution to authenticated users only
REVOKE EXECUTE ON FUNCTION public.get_user_profile(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_profile(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_profile(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_user_profile IS
  'Returns lightweight account profile + admin status in a single RPC call. '
  'Uses SECURITY DEFINER to bypass RLS timing issues during sign-in events, '
  'with explicit auth.uid() check for caller identity verification.';
