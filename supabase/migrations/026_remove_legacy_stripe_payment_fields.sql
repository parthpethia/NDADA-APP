-- ============================================================
-- Migration 026: Remove legacy Stripe payment fields (safety)
-- ============================================================
--
-- Use case:
-- - If you already ran an older version of 001_initial_schema.sql in Supabase
--   (which created Stripe columns/indexes), run this to remove them.
--
-- This migration is intentionally idempotent (IF EXISTS) so it is safe to run
-- even if Stripe fields were already removed.

ALTER TABLE public.payments
  DROP COLUMN IF EXISTS stripe_session_id,
  DROP COLUMN IF EXISTS stripe_payment_intent;

DROP INDEX IF EXISTS public.idx_payments_stripe_session_id;
