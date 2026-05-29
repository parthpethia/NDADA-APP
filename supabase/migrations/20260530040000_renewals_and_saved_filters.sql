-- =========================================================================
-- MIGRATION: 20260530040000_renewals_and_saved_filters.sql
-- Database extensions for Renewals, Campaign Audits, and Shared Filters
-- =========================================================================

BEGIN;

-- 1. Add last_renewal_reminder_at to certificates
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS last_renewal_reminder_at TIMESTAMPTZ;

-- 2. Add is_shared to admin_saved_filters
ALTER TABLE public.admin_saved_filters ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false;

-- 3. Create notification_campaigns table
CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_value TEXT,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexing campaigns
CREATE INDEX IF NOT EXISTS idx_notification_campaigns_admin_id ON public.notification_campaigns(admin_id);

-- Enable RLS on campaigns
ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_view_campaigns" ON public.notification_campaigns
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- 4. Redefine Saved Filters Policies for Shared access
DROP POLICY IF EXISTS "admins_manage_filters" ON public.admin_saved_filters;
DROP POLICY IF EXISTS "admins_select_filters" ON public.admin_saved_filters;
DROP POLICY IF EXISTS "admins_modify_filters" ON public.admin_saved_filters;

CREATE POLICY "admins_select_filters" ON public.admin_saved_filters
  FOR SELECT TO authenticated
  USING (
    admin_id = (SELECT id FROM public.admin_users WHERE user_id = auth.uid())
    OR is_shared = true
  );

CREATE POLICY "admins_modify_filters" ON public.admin_saved_filters
  FOR ALL TO authenticated
  USING (
    admin_id = (SELECT id FROM public.admin_users WHERE user_id = auth.uid())
  )
  WITH CHECK (
    admin_id = (SELECT id FROM public.admin_users WHERE user_id = auth.uid())
  );

-- 5. Redefine regional renewal classification with exact user buckets
CREATE OR REPLACE FUNCTION public.get_membership_renewal_status()
RETURNS TABLE (
  status TEXT,
  members_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN c.status = 'revoked' OR c.status = 'suspended' THEN 'revoked'
      WHEN c.issued_at <= now() - INTERVAL '365 days' THEN 'expired'
      WHEN c.issued_at > now() - INTERVAL '365 days' AND c.issued_at <= now() - INTERVAL '335 days' THEN '0_30_days'
      WHEN c.issued_at > now() - INTERVAL '335 days' AND c.issued_at <= now() - INTERVAL '305 days' THEN '31_60_days'
      WHEN c.issued_at > now() - INTERVAL '305 days' AND c.issued_at <= now() - INTERVAL '275 days' THEN '61_90_days'
      ELSE 'active'
    END as status,
    COUNT(a.id)::BIGINT as members_count
  FROM public.accounts a
  LEFT JOIN public.certificates c ON c.member_id = a.id
  WHERE a.account_status = 'active'
  GROUP BY status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

-- 6. Redefine Executive KPIs with month-over-month comparisons
CREATE OR REPLACE FUNCTION public.get_executive_kpis()
RETURNS JSONB AS $$
DECLARE
  v_conversion_rate NUMERIC;
  v_average_review_hours NUMERIC;
  v_outstanding_invoices_revenue NUMERIC;
  v_current_month_count BIGINT := 0;
  v_prev_month_count BIGINT := 0;
  v_growth_rate_pct NUMERIC;
  v_result JSONB;
BEGIN
  -- 1. Conversion Yield Rate
  SELECT 
    CASE WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE approval_status = 'approved')::NUMERIC / COUNT(*)::NUMERIC * 100) ELSE 0 END
  INTO v_conversion_rate
  FROM public.accounts;

  -- 2. Outstanding invoice pool
  SELECT COALESCE(SUM(amount), 0) INTO v_outstanding_invoices_revenue
  FROM public.payments WHERE status = 'pending';

  -- 3. Operational Velocity
  SELECT COALESCE(
    AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at))/3600), 
    0
  ) INTO v_average_review_hours
  FROM public.accounts
  WHERE reviewed_at IS NOT NULL;

  -- 4. Month-over-month growth comparison
  v_current_month_count := (
    SELECT COUNT(*) FROM public.accounts 
    WHERE created_at >= date_trunc('month', now())
  );
  
  v_prev_month_count := (
    SELECT COUNT(*) FROM public.accounts 
    WHERE created_at >= date_trunc('month', now() - INTERVAL '1 month')
      AND created_at < date_trunc('month', now())
  );

  IF v_prev_month_count = 0 THEN
    v_growth_rate_pct := 0;
  ELSE
    v_growth_rate_pct := ((v_current_month_count - v_prev_month_count)::NUMERIC / v_prev_month_count::NUMERIC * 100);
  END IF;

  SELECT jsonb_build_object(
    'conversion_rate_pct', ROUND(v_conversion_rate, 1),
    'outstanding_invoices_rupees', v_outstanding_invoices_revenue,
    'average_review_hours', ROUND(v_average_review_hours, 1),
    'monthly_growth_rate_pct', ROUND(v_growth_rate_pct, 1)
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

COMMIT;
