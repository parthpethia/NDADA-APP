-- Performance: drop unused index flagged by scanner
-- Caution: keep this index if you frequently filter firms by approval_status (e.g. review/admin queues).

DROP INDEX IF EXISTS public.idx_firms_approval_status;
