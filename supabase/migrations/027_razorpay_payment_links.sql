-- Migration 027: Add Razorpay payment link fields

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_link_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_link_url TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_event TEXT,
  ADD COLUMN IF NOT EXISTS provider_payload JSONB;

-- Helpful indexes for webhook reconciliation
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_payment_link_id
  ON public.payments (razorpay_payment_link_id);

CREATE INDEX IF NOT EXISTS idx_payments_provider
  ON public.payments (provider);
