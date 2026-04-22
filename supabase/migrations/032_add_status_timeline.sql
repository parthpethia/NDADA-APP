-- ============================================================
-- MIGRATION 032: Add Status Timeline Tracking
-- ============================================================
-- Adds status_timeline JSONB column to track all status changes
-- with timestamps and metadata for user transparency
-- ============================================================

ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS status_timeline JSONB DEFAULT '{}'::jsonb;

-- Add index for timeline queries
CREATE INDEX IF NOT EXISTS idx_accounts_status_timeline ON public.accounts USING GIN (status_timeline);

-- ============================================================
-- FUNCTION: Initialize timeline on account creation
-- ============================================================
CREATE OR REPLACE FUNCTION initialize_account_timeline()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status_timeline IS NULL OR NEW.status_timeline = '{}'::jsonb THEN
    NEW.status_timeline := jsonb_build_object(
      'submitted', jsonb_build_object(
        'timestamp', now()::text,
        'by_user', true
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_init_timeline ON public.accounts;
CREATE TRIGGER trg_init_timeline
  BEFORE INSERT ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION initialize_account_timeline();

-- ============================================================
-- FUNCTION: Update timeline on payment confirmation
-- ============================================================
CREATE OR REPLACE FUNCTION update_timeline_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if payment_status changed to 'paid'
  IF (OLD.payment_status IS DISTINCT FROM NEW.payment_status)
     AND NEW.payment_status = 'paid'
     AND NOT (NEW.status_timeline ? 'payment_verified')
  THEN
    NEW.status_timeline := jsonb_set(
      COALESCE(NEW.status_timeline, '{}'::jsonb),
      '{payment_verified}',
      jsonb_build_object(
        'timestamp', now()::text,
        'by_system', true
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_timeline_payment ON public.accounts;
CREATE TRIGGER trg_update_timeline_payment
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_timeline_on_payment();

-- ============================================================
-- FUNCTION: Update timeline on approval status change
-- ============================================================
CREATE OR REPLACE FUNCTION update_timeline_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- Track when application goes under review (after payment)
  IF (OLD.approval_status IS DISTINCT FROM NEW.approval_status)
     AND NEW.approval_status = 'pending'
     AND NEW.payment_status = 'paid'
     AND NOT (NEW.status_timeline ? 'under_review')
  THEN
    NEW.status_timeline := jsonb_set(
      COALESCE(NEW.status_timeline, '{}'::jsonb),
      '{under_review}',
      jsonb_build_object(
        'timestamp', now()::text,
        'assigned_to_admin', COALESCE(NEW.reviewed_by::text, 'unassigned')
      )
    );
  END IF;

  -- Track approval
  IF (OLD.approval_status IS DISTINCT FROM NEW.approval_status)
     AND NEW.approval_status = 'approved'
     AND NOT (NEW.status_timeline ? 'approved')
  THEN
    NEW.status_timeline := jsonb_set(
      COALESCE(NEW.status_timeline, '{}'::jsonb),
      '{approved}',
      jsonb_build_object(
        'timestamp', now()::text,
        'approved_by', COALESCE(NEW.reviewed_by::text, 'system')
      )
    );
  END IF;

  -- Track rejection
  IF (OLD.approval_status IS DISTINCT FROM NEW.approval_status)
     AND NEW.approval_status = 'rejected'
     AND NOT (NEW.status_timeline ? 'rejected')
  THEN
    NEW.status_timeline := jsonb_set(
      COALESCE(NEW.status_timeline, '{}'::jsonb),
      '{rejected}',
      jsonb_build_object(
        'timestamp', now()::text,
        'rejected_by', COALESCE(NEW.reviewed_by::text, 'system'),
        'reason', COALESCE(NEW.rejection_reason, 'No reason provided')
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_timeline_approval ON public.accounts;
CREATE TRIGGER trg_update_timeline_approval
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_timeline_on_approval();

-- ============================================================
-- RLS: Timeline is accessible to users and admins
-- ============================================================
-- No additional RLS needed since status_timeline is part of accounts table
-- which already has proper RLS policies
