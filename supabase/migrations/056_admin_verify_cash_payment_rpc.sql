-- Migration 056: Create RPC function for cash payment verification
-- This replaces the need for the verify-cash-payment edge function
-- and allows admins to verify payments directly through the database.

CREATE OR REPLACE FUNCTION verify_cash_payment(p_member_id UUID, p_status TEXT, p_notes TEXT)
RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID;
  v_account_id UUID;
  v_payment_method TEXT;
BEGIN
  -- 1. Verify caller is an admin
  SELECT id INTO v_admin_id
  FROM public.admin_users
  WHERE user_id = auth.uid();

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Only admins can verify cash payments';
  END IF;

  -- Get the admin's account ID for the verification record
  SELECT id INTO v_account_id
  FROM public.accounts
  WHERE user_id = auth.uid();

  -- 2. Verify member exists and uses cash
  SELECT payment_method INTO v_payment_method
  FROM public.accounts
  WHERE id = p_member_id;

  IF v_payment_method IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF v_payment_method != 'cash' THEN
    RAISE EXCEPTION 'Member has not selected cash payment method';
  END IF;

  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status. Must be approved or rejected.';
  END IF;

  -- 3. Update account and create verification record
  IF p_status = 'approved' THEN
    UPDATE public.accounts
    SET 
      cash_payment_verified = true,
      cash_payment_verified_by = v_account_id,
      cash_payment_verified_at = now(),
      cash_payment_notes = COALESCE(p_notes, cash_payment_notes),
      payment_status = 'paid'
    WHERE id = p_member_id;
  ELSE
    UPDATE public.accounts
    SET 
      payment_method = 'online', -- Reset to online
      cash_payment_notes = COALESCE(p_notes, cash_payment_notes)
    WHERE id = p_member_id;
  END IF;

  -- 4. Record verification
  INSERT INTO public.cash_payment_verifications (
    member_id, verified_by, status, notes
  ) VALUES (
    p_member_id, v_account_id, p_status, p_notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Cash payment ' || p_status,
    'member_id', p_member_id,
    'status', p_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Restrict execution to authenticated users only (the function itself verifies admin status)
REVOKE EXECUTE ON FUNCTION verify_cash_payment(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_cash_payment(UUID, TEXT, TEXT) TO authenticated;
