-- Performance note: this index covers the fraud_flags.member_id foreign key.
-- Dropping it can trigger an "Unindexed foreign key" finding and degrade join/delete performance.
-- This migration has been intentionally turned into a no-op.

-- DROP INDEX IF EXISTS public.idx_fraud_flags_member_id;
