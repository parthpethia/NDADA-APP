-- Migration 058: Secure RPC function for cash payment verification
-- Explicitly revokes execute from anon to fix security scanner warnings.

REVOKE EXECUTE ON FUNCTION public.verify_cash_payment(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_cash_payment(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_cash_payment(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cash_payment(uuid, text, text) TO service_role;
