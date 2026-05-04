-- ============================================================
-- MIGRATION 057: Fix Certificate Queue Trigger Logic
-- ============================================================
-- Updates the queue_certificate_on_approval trigger to also
-- fire when payment_status changes to 'paid' for an already
-- 'approved' account.
-- ============================================================

CREATE OR REPLACE FUNCTION public.queue_certificate_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  -- Queue certificate if both are now 'approved' and 'paid'
  -- AND at least one of them just transitioned to that state
  IF (NEW.approval_status = 'approved' AND NEW.payment_status = 'paid') AND
     (
       (OLD.approval_status IS DISTINCT FROM NEW.approval_status AND NEW.approval_status = 'approved') OR
       (OLD.payment_status IS DISTINCT FROM NEW.payment_status AND NEW.payment_status = 'paid')
     )
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
$$;
