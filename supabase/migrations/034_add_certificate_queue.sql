-- ============================================================
-- MIGRATION 034: Add Certificate Generation Queue
-- ============================================================
-- Creates a queue table for async certificate generation
-- and triggers to automatically queue certificates on approval
-- ============================================================

CREATE TYPE certificate_generation_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE public.certificate_generation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  status certificate_generation_status DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes for efficient queue processing
CREATE INDEX idx_certificate_queue_status ON public.certificate_generation_queue(status)
  WHERE status IN ('pending', 'processing');
CREATE INDEX idx_certificate_queue_created_at ON public.certificate_generation_queue(created_at);

-- ============================================================
-- RLS: Admins can view queue; system can update
-- ============================================================
ALTER TABLE public.certificate_generation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view queue" ON public.certificate_generation_queue
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "System can update queue" ON public.certificate_generation_queue
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- FUNCTION: Queue certificate on approval
-- ============================================================
-- When an application is approved, automatically add it to
-- the certificate generation queue
CREATE OR REPLACE FUNCTION queue_certificate_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue if approval_status changed to 'approved'
  IF (OLD.approval_status IS DISTINCT FROM NEW.approval_status)
     AND NEW.approval_status = 'approved'
     AND NEW.payment_status = 'paid'
  THEN
    -- Insert into queue if not already there
    INSERT INTO certificate_generation_queue (account_id, status)
    VALUES (NEW.id, 'pending')
    ON CONFLICT DO NOTHING;

    -- Log to console (for debugging)
    RAISE NOTICE 'Certificate queued for account %', NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_queue_certificate_on_approval ON public.accounts;
CREATE TRIGGER trg_queue_certificate_on_approval
  AFTER UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION queue_certificate_on_approval();

-- ============================================================
-- FUNCTION: Get next job from queue (for processing)
-- ============================================================
-- Used by edge function to fetch the next pending job
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
  ORDER BY q.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Mark certificate job as processing
-- ============================================================
CREATE OR REPLACE FUNCTION mark_certificate_processing(job_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE certificate_generation_queue
  SET status = 'processing', processing_started_at = now()
  WHERE id = job_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Mark certificate job as completed
-- ============================================================
CREATE OR REPLACE FUNCTION mark_certificate_completed(job_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE certificate_generation_queue
  SET status = 'completed', completed_at = now()
  WHERE id = job_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Mark certificate job as failed
-- ============================================================
CREATE OR REPLACE FUNCTION mark_certificate_failed(job_id UUID, error_msg TEXT)
RETURNS void AS $$
BEGIN
  UPDATE certificate_generation_queue
  SET
    status = 'failed',
    error_message = error_msg,
    completed_at = now()
  WHERE id = job_id;
END;
$$ LANGUAGE plpgsql;
