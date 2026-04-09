-- ============================================================
-- Remove Stripe payment fields (manual payment proof flow)
-- ============================================================

-- Drop old Stripe columns if they exist
ALTER TABLE payments
  DROP COLUMN IF EXISTS stripe_session_id,
  DROP COLUMN IF EXISTS stripe_payment_intent;

-- Drop legacy Stripe index if it exists
DROP INDEX IF EXISTS public.idx_payments_stripe_session_id;
