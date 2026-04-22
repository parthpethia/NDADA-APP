-- ============================================================
-- MIGRATION 033: Add Notifications System
-- ============================================================
-- Creates notifications table to track user-facing messages
-- about payment, approval, certificate, and system events
-- ============================================================

CREATE TYPE notification_type AS ENUM ('payment', 'approval', 'certificate', 'system');

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(read) WHERE NOT read;
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);

-- ============================================================
-- RLS: Users can only read their own notifications
-- ============================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications" ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- FUNCTION: Create notification on payment successful
-- ============================================================
CREATE OR REPLACE FUNCTION notify_payment_success()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create if payment_status changed to 'paid'
  IF (OLD.payment_status IS DISTINCT FROM NEW.payment_status)
     AND NEW.payment_status = 'paid'
  THEN
    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (
      NEW.user_id,
      'payment'::notification_type,
      'Payment Received',
      'Your registration fee payment has been verified. Your application is now under review.',
      '/dashboard'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_payment_success ON public.accounts;
CREATE TRIGGER trg_notify_payment_success
  AFTER UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION notify_payment_success();

-- ============================================================
-- FUNCTION: Create notification on payment failed
-- ============================================================
CREATE OR REPLACE FUNCTION notify_payment_failed()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create if payment_status changed to 'failed', 'expired', or 'abandoned'
  IF (OLD.payment_status IS DISTINCT FROM NEW.payment_status)
     AND NEW.payment_status IN ('failed', 'expired', 'abandoned')
  THEN
    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (
      NEW.user_id,
      'payment'::notification_type,
      'Payment ' || INITCAP(NEW.payment_status),
      CASE
        WHEN NEW.payment_status = 'failed' THEN 'Your payment failed. Please try again.'
        WHEN NEW.payment_status = 'expired' THEN 'Your payment link has expired. Please create a new payment link.'
        WHEN NEW.payment_status = 'abandoned' THEN 'Your payment was not completed. Please try again to continue.'
        ELSE 'Your payment encountered an issue.'
      END,
      '/dashboard/payment'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_payment_failed ON public.accounts;
CREATE TRIGGER trg_notify_payment_failed
  AFTER UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION notify_payment_failed();

-- ============================================================
-- FUNCTION: Create notification on approval status change
-- ============================================================
CREATE OR REPLACE FUNCTION notify_approval_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify when under review
  IF (OLD.approval_status IS DISTINCT FROM NEW.approval_status)
     AND NEW.approval_status = 'pending'
     AND NEW.payment_status = 'paid'
  THEN
    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (
      NEW.user_id,
      'approval'::notification_type,
      'Application Under Review',
      'Your application is now under review by our team. You will be notified once a decision is made.',
      '/dashboard'
    );
  END IF;

  -- Notify when approved
  IF (OLD.approval_status IS DISTINCT FROM NEW.approval_status)
     AND NEW.approval_status = 'approved'
  THEN
    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (
      NEW.user_id,
      'approval'::notification_type,
      'Application Approved!',
      'Congratulations! Your application has been approved. Your membership certificate is ready.',
      '/dashboard/certificate'
    );
  END IF;

  -- Notify when rejected
  IF (OLD.approval_status IS DISTINCT FROM NEW.approval_status)
     AND NEW.approval_status = 'rejected'
  THEN
    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (
      NEW.user_id,
      'approval'::notification_type,
      'Application Rejected',
      'Your application was rejected. Reason: ' || COALESCE(NEW.rejection_reason, 'No reason provided'),
      '/dashboard'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_approval_change ON public.accounts;
CREATE TRIGGER trg_notify_approval_change
  AFTER UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION notify_approval_change();

-- ============================================================
-- FUNCTION: Create notification when certificate is issued
-- ============================================================
CREATE OR REPLACE FUNCTION notify_certificate_issued()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, message, action_url)
  SELECT
    a.user_id,
    'certificate'::notification_type,
    'Certificate Ready',
    'Your membership certificate is ready to download.',
    '/dashboard/certificate'
  FROM accounts a
  WHERE a.id = NEW.member_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_certificate_issued ON public.certificates;
CREATE TRIGGER trg_notify_certificate_issued
  AFTER INSERT ON public.certificates
  FOR EACH ROW
  EXECUTE FUNCTION notify_certificate_issued();
