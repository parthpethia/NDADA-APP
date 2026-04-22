-- ============================================================
-- MIGRATION 037: Consolidated Schema - Complete Setup
-- ============================================================
-- This migration consolidates all changes from migrations 029-036
-- Includes: member/firm consolidation, drafts, timelines, notifications,
-- certificate queue, error logging, and query optimization
-- ============================================================

-- ============================================================
-- PART 1: Type Definitions
-- ============================================================

CREATE TYPE IF NOT EXISTS firm_type AS ENUM ('proprietorship', 'partnership', 'private_limited', 'llp', 'other');
CREATE TYPE IF NOT EXISTS payment_status AS ENUM ('pending', 'processing', 'paid', 'failed', 'abandoned', 'expired');
CREATE TYPE IF NOT EXISTS approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE IF NOT EXISTS account_status AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE IF NOT EXISTS certificate_status AS ENUM ('valid', 'revoked', 'suspended');
CREATE TYPE IF NOT EXISTS admin_role AS ENUM ('super_admin', 'admin', 'reviewer');
CREATE TYPE IF NOT EXISTS notification_type AS ENUM ('payment', 'approval', 'certificate', 'system');
CREATE TYPE IF NOT EXISTS certificate_generation_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- ============================================================
-- PART 2: Helper Functions
-- ============================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PART 3: Main Tables
-- ============================================================

-- Consolidated accounts table (members + firms merged)
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Personal/Member Info
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  id_proof_url TEXT,

  -- Firm Info
  firm_name TEXT NOT NULL,
  firm_type firm_type DEFAULT 'proprietorship',
  license_number TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  gst_number TEXT,
  firm_address TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  firm_pin_code TEXT,
  partner_proprietor_name TEXT,
  whatsapp_number TEXT,
  aadhaar_card_number TEXT,
  ifms_number TEXT,
  seed_cotton_license_number TEXT,
  seed_cotton_license_expiry TIMESTAMPTZ,
  sarthi_id_cotton TEXT,
  seed_general_license_number TEXT,
  seed_general_license_expiry TIMESTAMPTZ,
  sarthi_id_general TEXT,
  pesticide_license_number TEXT,
  pesticide_license_expiry TIMESTAMPTZ,
  fertilizer_license_number TEXT,
  fertilizer_license_expiry TIMESTAMPTZ,
  residence_address TEXT,
  residence_pin_code TEXT,
  applicant_photo_url TEXT,
  documents_urls TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Status Fields
  membership_id TEXT UNIQUE NOT NULL,
  payment_status payment_status DEFAULT 'pending',
  approval_status approval_status DEFAULT 'pending',
  account_status account_status DEFAULT 'active',
  rejection_reason TEXT,
  status_timeline JSONB DEFAULT '{}'::jsonb,

  -- Approval Tracking
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  proof_url TEXT,
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  status payment_status DEFAULT 'pending',
  provider TEXT,
  razorpay_payment_link_id TEXT,
  razorpay_payment_link_url TEXT,
  razorpay_payment_id TEXT,
  provider_event TEXT,
  provider_payload JSONB,
  failure_reason TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Certificates table
CREATE TABLE IF NOT EXISTS public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id TEXT NOT NULL UNIQUE,
  member_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  certificate_url TEXT NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT now(),
  status certificate_status DEFAULT 'valid'
);

-- Account drafts table (for auto-save)
CREATE TABLE IF NOT EXISTS public.account_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 0,
  form_data JSONB NOT NULL,
  saved_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Certificate generation queue
CREATE TABLE IF NOT EXISTS public.certificate_generation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  status certificate_generation_status DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Error logs table
CREATE TABLE IF NOT EXISTS public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  level TEXT NOT NULL DEFAULT 'error',
  message TEXT NOT NULL,
  stack_trace TEXT,
  context JSONB DEFAULT '{}'::jsonb,
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Admin users table
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role admin_role DEFAULT 'reviewer',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Fraud flags table
CREATE TABLE IF NOT EXISTS public.fraud_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_user UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Certificate downloads tracking
CREATE TABLE IF NOT EXISTS public.certificate_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id TEXT NOT NULL,
  member_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  downloaded_at TIMESTAMPTZ DEFAULT now(),
  ip_address TEXT
);

-- Query performance logs
CREATE TABLE IF NOT EXISTS public.query_performance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_name TEXT NOT NULL,
  execution_time_ms FLOAT NOT NULL,
  rows_scanned BIGINT,
  rows_returned BIGINT,
  index_used BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- PART 4: Indexes for Performance
-- ============================================================

-- Accounts table indexes
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON public.accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_payment_status ON public.accounts(payment_status);
CREATE INDEX IF NOT EXISTS idx_accounts_approval_status ON public.accounts(approval_status);
CREATE INDEX IF NOT EXISTS idx_accounts_payment_approval ON public.accounts(payment_status, approval_status)
  WHERE approval_status = 'pending' AND payment_status = 'paid';
CREATE INDEX IF NOT EXISTS idx_accounts_reviewed_by ON public.accounts(reviewed_by)
  WHERE reviewed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_created_at ON public.accounts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accounts_updated_at ON public.accounts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_accounts_membership_id ON public.accounts(membership_id);
CREATE INDEX IF NOT EXISTS idx_accounts_email ON public.accounts(email);
CREATE INDEX IF NOT EXISTS idx_accounts_status_timeline ON public.accounts USING GIN (status_timeline);

-- Payments table indexes
CREATE INDEX IF NOT EXISTS idx_payments_member_id ON public.payments(member_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_pending ON public.payments(expires_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_link_id ON public.payments(razorpay_payment_link_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_payment_id ON public.payments(razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at DESC);

-- Certificates table indexes
CREATE INDEX IF NOT EXISTS idx_certificates_member_id ON public.certificates(member_id);
CREATE INDEX IF NOT EXISTS idx_certificates_status ON public.certificates(status);
CREATE INDEX IF NOT EXISTS idx_certificates_certificate_id ON public.certificates(certificate_id);

-- Notifications table indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(read) WHERE NOT read;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read)
  WHERE NOT read;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);

-- Certificate queue indexes
CREATE INDEX IF NOT EXISTS idx_certificate_queue_status ON public.certificate_generation_queue(status)
  WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_certificate_queue_created_at ON public.certificate_generation_queue(created_at);

-- Error logs indexes
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON public.error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_level ON public.error_logs(level);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON public.error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON public.error_logs(resolved)
  WHERE NOT resolved;

-- Admin users indexes
CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON public.admin_users(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON public.admin_users(role);

-- Fraud flags indexes
CREATE INDEX IF NOT EXISTS idx_fraud_flags_member_id ON public.fraud_flags(member_id);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_resolved ON public.fraud_flags(resolved)
  WHERE NOT resolved;

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON public.audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user ON public.audit_logs(target_user);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- Query performance indexes
CREATE INDEX IF NOT EXISTS idx_query_performance_created_at ON query_performance_logs(created_at DESC);

-- ============================================================
-- PART 5: Triggers
-- ============================================================

-- Update updated_at for accounts
DROP TRIGGER IF EXISTS trg_accounts_updated_at ON public.accounts;
CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Update updated_at for account_drafts
DROP TRIGGER IF EXISTS trg_account_drafts_updated_at ON public.account_drafts;
CREATE TRIGGER trg_account_drafts_updated_at
  BEFORE UPDATE ON public.account_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Update updated_at for error_logs
DROP TRIGGER IF EXISTS trg_error_logs_updated_at ON public.error_logs;
CREATE TRIGGER trg_error_logs_updated_at
  BEFORE UPDATE ON public.error_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Initialize timeline on account creation
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

-- Update timeline on payment verification
CREATE OR REPLACE FUNCTION update_timeline_on_payment()
RETURNS TRIGGER AS $$
BEGIN
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

-- Update timeline on approval status change
CREATE OR REPLACE FUNCTION update_timeline_on_approval()
RETURNS TRIGGER AS $$
BEGIN
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

-- Notification triggers
CREATE OR REPLACE FUNCTION notify_payment_success()
RETURNS TRIGGER AS $$
BEGIN
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

CREATE OR REPLACE FUNCTION notify_payment_failed()
RETURNS TRIGGER AS $$
BEGIN
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

CREATE OR REPLACE FUNCTION notify_approval_change()
RETURNS TRIGGER AS $$
BEGIN
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

-- Queue certificate on approval
CREATE OR REPLACE FUNCTION queue_certificate_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.approval_status IS DISTINCT FROM NEW.approval_status)
     AND NEW.approval_status = 'approved'
     AND NEW.payment_status = 'paid'
  THEN
    INSERT INTO certificate_generation_queue (account_id, status)
    VALUES (NEW.id, 'pending')
    ON CONFLICT DO NOTHING;
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
-- PART 6: Views & Helper Functions
-- ============================================================

-- Materialized view for admin dashboard
CREATE MATERIALIZED VIEW IF NOT EXISTS admin_dashboard_summary AS
SELECT
  'payment_pending'::TEXT as metric,
  COUNT(*)::BIGINT as value
FROM accounts
WHERE payment_status = 'pending'
UNION ALL
SELECT
  'review_pending'::TEXT,
  COUNT(*)::BIGINT
FROM accounts
WHERE approval_status = 'pending' AND payment_status = 'paid'
UNION ALL
SELECT
  'approved'::TEXT,
  COUNT(*)::BIGINT
FROM accounts
WHERE approval_status = 'approved'
UNION ALL
SELECT
  'rejected'::TEXT,
  COUNT(*)::BIGINT
FROM accounts
WHERE approval_status = 'rejected'
UNION ALL
SELECT
  'total_members'::TEXT,
  COUNT(*)::BIGINT
FROM accounts
UNION ALL
SELECT
  'certificates_issued'::TEXT,
  COUNT(*)::BIGINT
FROM certificates
WHERE status = 'valid';

CREATE INDEX IF NOT EXISTS idx_admin_dashboard_summary_metric ON admin_dashboard_summary(metric);

-- Helper function: Get account with details
CREATE OR REPLACE FUNCTION get_account_with_details(p_account_id UUID)
RETURNS TABLE (
  account_id UUID,
  user_id UUID,
  firm_name TEXT,
  full_name TEXT,
  email TEXT,
  payment_status TEXT,
  approval_status TEXT,
  membership_id TEXT,
  payment_count BIGINT,
  has_certificate BOOLEAN,
  fraud_flags_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.user_id,
    a.firm_name,
    a.full_name,
    a.email,
    a.payment_status::TEXT,
    a.approval_status::TEXT,
    a.membership_id,
    (SELECT COUNT(*) FROM payments WHERE member_id = a.id)::BIGINT,
    (SELECT COUNT(*) FROM certificates WHERE member_id = a.id) > 0,
    (SELECT COUNT(*) FROM fraud_flags WHERE member_id = a.id AND NOT resolved)::BIGINT
  FROM accounts a
  WHERE a.id = p_account_id;
END;
$$ LANGUAGE plpgsql;

-- Helper function: Get pending applications
CREATE OR REPLACE FUNCTION get_pending_applications(limit_count INT DEFAULT 50)
RETURNS TABLE (
  id UUID,
  firm_name TEXT,
  full_name TEXT,
  membership_id TEXT,
  created_at TIMESTAMPTZ,
  days_pending BIGINT,
  fraud_flag_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.firm_name,
    a.full_name,
    a.membership_id,
    a.created_at,
    EXTRACT(DAY FROM (NOW() - a.created_at))::BIGINT,
    (SELECT COUNT(*) FROM fraud_flags WHERE member_id = a.id AND NOT resolved)::BIGINT
  FROM accounts a
  WHERE a.approval_status = 'pending'
    AND a.payment_status = 'paid'
  ORDER BY a.created_at ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Helper function: Get next certificate job
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

-- Helper functions for certificate queue
CREATE OR REPLACE FUNCTION mark_certificate_processing(job_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE certificate_generation_queue
  SET status = 'processing', processing_started_at = now()
  WHERE id = job_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mark_certificate_completed(job_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE certificate_generation_queue
  SET status = 'completed', completed_at = now()
  WHERE id = job_id;
END;
$$ LANGUAGE plpgsql;

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

-- Function: Refresh dashboard stats
CREATE OR REPLACE FUNCTION refresh_admin_dashboard_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY admin_dashboard_summary;
END;
$$ LANGUAGE plpgsql;

-- Function: Get error statistics
CREATE OR REPLACE FUNCTION get_error_stats(days_back INT DEFAULT 7)
RETURNS TABLE (
  level TEXT,
  count BIGINT,
  unique_users BIGINT,
  latest_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    el.level,
    COUNT(*)::BIGINT as count,
    COUNT(DISTINCT el.user_id)::BIGINT as unique_users,
    MAX(el.created_at) as latest_at
  FROM error_logs el
  WHERE el.created_at >= now() - (days_back || ' days')::INTERVAL
  GROUP BY el.level
  ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function: Get unresolved critical errors
CREATE OR REPLACE FUNCTION get_unresolved_critical_errors()
RETURNS TABLE (
  id UUID,
  message TEXT,
  user_id UUID,
  level TEXT,
  created_at TIMESTAMPTZ,
  error_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    el.id,
    el.message,
    el.user_id,
    el.level,
    MAX(el.created_at) as created_at,
    COUNT(*)::BIGINT as error_count
  FROM error_logs el
  WHERE el.resolved = false
    AND el.level = 'error'
  GROUP BY el.id, el.message, el.user_id, el.level
  ORDER BY error_count DESC, created_at DESC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PART 7: Row-Level Security (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_generation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_downloads ENABLE ROW LEVEL SECURITY;

-- Accounts RLS
CREATE POLICY "Users can view own account" ON public.accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all accounts" ON public.accounts
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update own account" ON public.accounts
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Payments RLS
CREATE POLICY "Users can view own payments" ON public.payments
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.accounts WHERE id = member_id AND user_id = auth.uid()
  ));

CREATE POLICY "Admins can view all payments" ON public.payments
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  ));

-- Certificates RLS
CREATE POLICY "Users can view own certificates" ON public.certificates
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.accounts WHERE id = member_id AND user_id = auth.uid()
  ));

CREATE POLICY "Admins can view all certificates" ON public.certificates
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  ));

-- Account drafts RLS
CREATE POLICY "Users can view own drafts" ON public.account_drafts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own drafts" ON public.account_drafts
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Notifications RLS
CREATE POLICY "Users can read own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Certificate queue RLS
CREATE POLICY "Admins can view queue" ON public.certificate_generation_queue
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "System can update queue" ON public.certificate_generation_queue
  FOR UPDATE USING (true)
  WITH CHECK (true);

-- Error logs RLS
CREATE POLICY "Users can view own errors" ON public.error_logs
  FOR SELECT USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can update errors" ON public.error_logs
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  ));

-- ============================================================
-- PART 8: Grant Permissions
-- ============================================================

GRANT SELECT ON public.accounts TO authenticated;
GRANT UPDATE ON public.accounts TO authenticated;
GRANT SELECT ON public.payments TO authenticated;
GRANT SELECT ON public.certificates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.account_drafts TO authenticated;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT SELECT ON public.admin_dashboard_summary TO authenticated;

-- ============================================================
-- Complete Setup Finished
-- ============================================================
-- This migration sets up the complete database schema for NDADA app
-- All migrations 029-036 consolidated into single deployment file
