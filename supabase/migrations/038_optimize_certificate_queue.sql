-- ============================================================
-- MIGRATION 038: Optimize Certificate Generation Queue
-- ============================================================
-- Adds retry support, unique constraint for upsert, and
-- stale job cleanup to handle Edge Function crashes.
-- ============================================================

-- 1. Add retry columns for automatic retry on failure
ALTER TABLE public.certificate_generation_queue
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;

-- 2. Add unique constraint on account_id so upserts work correctly
-- and prevent duplicate queue entries for the same member.
-- First, clean up any existing duplicates (keep the most recent).
DELETE FROM public.certificate_generation_queue a
USING public.certificate_generation_queue b
WHERE a.account_id = b.account_id
  AND a.created_at < b.created_at;

ALTER TABLE public.certificate_generation_queue
  DROP CONSTRAINT IF EXISTS uq_certificate_queue_account_id;

ALTER TABLE public.certificate_generation_queue
  ADD CONSTRAINT uq_certificate_queue_account_id UNIQUE (account_id);

-- 3. Function: Reset stale processing jobs back to pending.
-- Jobs stuck in 'processing' for >2 minutes are assumed crashed.
CREATE OR REPLACE FUNCTION reset_stale_certificate_jobs()
RETURNS INTEGER AS $$
DECLARE
  reset_count INTEGER;
BEGIN
  UPDATE certificate_generation_queue
  SET
    status = 'pending',
    processing_started_at = NULL,
    retry_count = retry_count + 1
  WHERE status = 'processing'
    AND processing_started_at < now() - INTERVAL '2 minutes'
    AND retry_count < max_retries;

  GET DIAGNOSTICS reset_count = ROW_COUNT;

  -- Mark jobs that exceeded max retries as failed
  UPDATE certificate_generation_queue
  SET
    status = 'failed',
    error_message = 'Exceeded max retries after stale processing',
    completed_at = now()
  WHERE status = 'processing'
    AND processing_started_at < now() - INTERVAL '2 minutes'
    AND retry_count >= max_retries;

  RETURN reset_count;
END;
$$ LANGUAGE plpgsql;

-- 4. Update get_next_certificate_job to respect max_retries
CREATE OR REPLACE FUNCTION get_next_certificate_job()
RETURNS TABLE (
  id UUID,
  account_id UUID,
  firm_name TEXT,
  full_name TEXT,
  email TEXT,
  membership_id TEXT
) AS $$
BEGIN
  -- First, reset any stale processing jobs
  PERFORM reset_stale_certificate_jobs();

  RETURN QUERY
  SELECT
    q.id,
    q.account_id,
    a.firm_name,
    a.full_name,
    a.email,
    a.membership_id
  FROM certificate_generation_queue q
  JOIN accounts a ON a.id = q.account_id
  WHERE q.status = 'pending'
    AND q.retry_count < q.max_retries
  ORDER BY q.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
END;
$$ LANGUAGE plpgsql;
