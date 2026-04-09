-- Performance: drop unused index flagged by scanner
-- Caution: this index is typically important (member payment history) and also covers the payments.member_id foreign key.
-- Dropping it may hurt query performance and can cause an "Unindexed foreign key" finding.

DROP INDEX IF EXISTS public.idx_payments_member_id;
