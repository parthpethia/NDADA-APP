-- Performance: drop unused index flagged by scanner
-- Caution: keep this index if you look up payments by stripe_session_id (e.g. webhook reconciliation).

DROP INDEX IF EXISTS public.idx_payments_stripe_session_id;
