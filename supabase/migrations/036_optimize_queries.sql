-- ============================================================
-- MIGRATION 036: Database Query Optimization
-- ============================================================
-- Adds indexes and optimizations for common queries
-- ============================================================

-- ============================================================
-- ACCOUNTS TABLE INDEXES
-- ============================================================

-- Index for user_id lookups (very common)
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON public.accounts(user_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_accounts_payment_status ON public.accounts(payment_status);
CREATE INDEX IF NOT EXISTS idx_accounts_approval_status ON public.accounts(approval_status);

-- Composite index for payment + approval status (for pending applications)
CREATE INDEX IF NOT EXISTS idx_accounts_payment_approval ON public.accounts(payment_status, approval_status)
  WHERE approval_status = 'pending' AND payment_status = 'paid';

-- Index for admin review filtering
CREATE INDEX IF NOT EXISTS idx_accounts_reviewed_by ON public.accounts(reviewed_by)
  WHERE reviewed_by IS NOT NULL;

-- Index for created_at for sorting/filtering by date
CREATE INDEX IF NOT EXISTS idx_accounts_created_at ON public.accounts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accounts_updated_at ON public.accounts(updated_at DESC);

-- Membership ID lookup
CREATE INDEX IF NOT EXISTS idx_accounts_membership_id ON public.accounts(membership_id);

-- Email lookup
CREATE INDEX IF NOT EXISTS idx_accounts_email ON public.accounts(email);

-- ============================================================
-- PAYMENTS TABLE INDEXES
-- ============================================================

-- Member ID lookup
CREATE INDEX IF NOT EXISTS idx_payments_member_id ON public.payments(member_id);

-- Payment status filtering
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- Status with expiry for pending/processing payments
CREATE INDEX IF NOT EXISTS idx_payments_pending ON public.payments(expires_at)
  WHERE status IN ('pending', 'processing');

-- Razorpay link ID lookup
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_link_id ON public.payments(razorpay_payment_link_id);

-- Razorpay payment ID lookup
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_payment_id ON public.payments(razorpay_payment_id);

-- Created at for sorting
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at DESC);

-- ============================================================
-- CERTIFICATES TABLE INDEXES
-- ============================================================

-- Member ID lookup
CREATE INDEX IF NOT EXISTS idx_certificates_member_id ON public.certificates(member_id);

-- Certificate status
CREATE INDEX IF NOT EXISTS idx_certificates_status ON public.certificates(status);

-- Certificate ID lookup
CREATE INDEX IF NOT EXISTS idx_certificates_certificate_id ON public.certificates(certificate_id);

-- ============================================================
-- NOTIFICATIONS TABLE INDEXES
-- ============================================================

-- User ID with read status (for unread count)
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read)
  WHERE NOT read;

-- Type filtering
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);

-- ============================================================
-- FRAUD FLAGS TABLE INDEXES
-- ============================================================

-- Member ID lookup
CREATE INDEX IF NOT EXISTS idx_fraud_flags_member_id ON public.fraud_flags(member_id);

-- Resolved status
CREATE INDEX IF NOT EXISTS idx_fraud_flags_resolved ON public.fraud_flags(resolved)
  WHERE NOT resolved;

-- ============================================================
-- ADMIN USERS TABLE INDEXES
-- ============================================================

-- User ID lookup
CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON public.admin_users(user_id);

-- Role filtering
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON public.admin_users(role);

-- ============================================================
-- AUDIT LOGS TABLE INDEXES
-- ============================================================

-- Admin ID lookup
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON public.audit_logs(admin_id);

-- Target user lookup
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user ON public.audit_logs(target_user);

-- Created at for sorting
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ============================================================
-- MATERIALIZED VIEW: Admin Dashboard Summary
-- ============================================================
-- Pre-computed view for dashboard stats to avoid expensive counts
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

-- Index on materialized view
CREATE INDEX IF NOT EXISTS idx_admin_dashboard_summary_metric ON admin_dashboard_summary(metric);

-- ============================================================
-- FUNCTION: Refresh dashboard stats
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_admin_dashboard_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY admin_dashboard_summary;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGER: Auto-refresh dashboard stats on changes
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_refresh_dashboard()
RETURNS TRIGGER AS $$
BEGIN
  -- Refresh every 5 minutes instead of on every insert
  -- to avoid performance impact
  IF (SELECT COUNT(*) FROM admin_dashboard_summary) > 0 THEN
    -- Stats have been calculated before, don't refresh on every change
    -- Instead, rely on periodic refresh via cron job
    NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Get account with all related data efficiently
-- ============================================================
-- This function uses explicit fields instead of * to be more efficient
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
    a.payment_status,
    a.approval_status,
    a.membership_id,
    (SELECT COUNT(*) FROM payments WHERE member_id = a.id)::BIGINT,
    (SELECT COUNT(*) FROM certificates WHERE member_id = a.id) > 0,
    (SELECT COUNT(*) FROM fraud_flags WHERE member_id = a.id AND NOT resolved)::BIGINT
  FROM accounts a
  WHERE a.id = p_account_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Get pending review applications with details
-- ============================================================
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

-- ============================================================
-- QUERY OPTIMIZATION ANALYSIS VIEW
-- ============================================================
-- This view shows query performance recommendations
CREATE VIEW query_optimization_suggestions AS
SELECT
  'Use indexed fields' as recommendation,
  'Always filter by user_id, payment_status, or approval_status when possible' as details,
  'Speeds up most queries significantly' as impact
UNION ALL
SELECT
  'Use pagination',
  'Always use LIMIT and OFFSET to avoid loading large datasets',
  'Essential for performance with large tables'
UNION ALL
SELECT
  'Batch operations',
  'Use INSERT ... SELECT for bulk operations instead of individual inserts',
  'Can be 100x faster'
UNION ALL
SELECT
  'Avoid SELECT *',
  'Specify only needed columns instead of using SELECT *',
  'Reduces bandwidth and improves cache efficiency'
UNION ALL
SELECT
  'Use Prepared statements',
  'Use parameterized queries to help database caching',
  'Improves security and performance'
UNION ALL
SELECT
  'Connection pooling',
  'Use supabase connection pooling for high-concurrency apps',
  'Prevents connection exhaustion';

-- ============================================================
-- PERFORMANCE STATS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.query_performance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_name TEXT NOT NULL,
  execution_time_ms FLOAT NOT NULL,
  rows_scanned BIGINT,
  rows_returned BIGINT,
  index_used BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for analysis
CREATE INDEX IF NOT EXISTS idx_query_performance_created_at ON query_performance_logs(created_at DESC);
