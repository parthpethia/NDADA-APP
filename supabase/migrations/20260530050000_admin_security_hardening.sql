-- =========================================================================
-- MIGRATION: 20260530050000_admin_security_hardening.sql
-- hardens system against administrative privilege escalation, data leakage, 
-- and authorization bypasses inside SECURITY DEFINER RPCs and RLS policies.
-- =========================================================================

BEGIN;

-- 1. Tighten Saved Filters select RLS policy: prevent general members from accessing shared admin views
DROP POLICY IF EXISTS "admins_select_filters" ON public.admin_saved_filters;

CREATE POLICY "admins_select_filters" ON public.admin_saved_filters
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
    AND (
      admin_id = (SELECT id FROM public.admin_users WHERE user_id = auth.uid())
      OR is_shared = true
    )
  );

-- 2. Revoke misconfigured reviewer assignment permissions
-- Reviewers must not possess general "manage_assignments" capability
DELETE FROM public.role_permissions 
WHERE role = 'reviewer' AND permission_name = 'manage_assignments';

-- 3. Hardened Global Search RPC: branch reviewer search to assigned workloads exclusively
CREATE OR REPLACE FUNCTION public.global_admin_search(p_query TEXT)
RETURNS TABLE (
  id UUID,
  type TEXT,
  title TEXT,
  subtitle TEXT,
  status TEXT,
  search_rank INTEGER,
  deep_link TEXT
) AS $$
DECLARE
  v_role admin_role;
  v_admin_id UUID;
BEGIN
  -- Fetch user role and true admin database ID
  SELECT id, role INTO v_admin_id, v_role FROM public.admin_users WHERE user_id = auth.uid();
  
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Access Denied: Administrative privileges required';
  END IF;

  IF v_role = 'reviewer' THEN
    RETURN QUERY
    -- Accounts assigned to this reviewer exclusively
    SELECT 
      a.id,
      'member'::TEXT as type,
      a.full_name as title,
      'ID: ' || a.membership_id || ' | ' || a.email as subtitle,
      a.account_status::TEXT as status,
      CASE 
        WHEN a.membership_id = p_query THEN 100 
        WHEN a.email = p_query THEN 80         
        WHEN a.phone = p_query THEN 70         
        WHEN a.registration_number = p_query THEN 60 
        WHEN a.gst_number = p_query THEN 50    
        ELSE 10                                 
      END as search_rank,
      '/admin/members/' || a.id as deep_link
    FROM public.accounts a
    JOIN public.review_assignments ra ON ra.account_id = a.id
    WHERE ra.assigned_to = v_admin_id AND (
      a.membership_id ILIKE '%' || p_query || '%'
      OR a.full_name ILIKE '%' || p_query || '%'
      OR a.email ILIKE '%' || p_query || '%'
      OR a.phone ILIKE '%' || p_query || '%'
      OR a.firm_name ILIKE '%' || p_query || '%'
      OR a.gst_number ILIKE '%' || p_query || '%'
      OR a.license_number ILIKE '%' || p_query || '%'
      OR a.registration_number ILIKE '%' || p_query || '%'
    )
    
    UNION ALL
    
    -- Certificates assigned to this reviewer exclusively
    SELECT 
      c.id,
      'certificate'::TEXT as type,
      'Certificate: ' || c.certificate_id as title,
      'Member: ' || a.full_name as subtitle,
      c.status::TEXT as status,
      CASE 
        WHEN c.certificate_id = p_query THEN 90 
        ELSE 10
      END as search_rank,
      '/admin/members/' || a.id || '?tab=certificates' as deep_link
    FROM public.certificates c
    JOIN public.accounts a ON a.id = c.member_id
    JOIN public.review_assignments ra ON ra.account_id = a.id
    WHERE ra.assigned_to = v_admin_id AND c.certificate_id ILIKE '%' || p_query || '%';
  ELSE
    -- Standard Admins / Super Admins get full scope search
    RETURN QUERY
    SELECT 
      a.id,
      'member'::TEXT as type,
      a.full_name as title,
      'ID: ' || a.membership_id || ' | ' || a.email as subtitle,
      a.account_status::TEXT as status,
      CASE 
        WHEN a.membership_id = p_query THEN 100 
        WHEN a.email = p_query THEN 80         
        WHEN a.phone = p_query THEN 70         
        WHEN a.registration_number = p_query THEN 60 
        WHEN a.gst_number = p_query THEN 50    
        ELSE 10                                 
      END as search_rank,
      '/admin/members/' || a.id as deep_link
    FROM public.accounts a
    WHERE 
      (COALESCE(a.membership_id, '') || ' ' ||
       COALESCE(a.full_name, '') || ' ' ||
       COALESCE(a.email, '') || ' ' ||
       COALESCE(a.phone, '') || ' ' ||
       COALESCE(a.firm_name, '') || ' ' ||
       COALESCE(a.gst_number, '') || ' ' ||
       COALESCE(a.license_number, '') || ' ' ||
       COALESCE(a.registration_number, '')) ILIKE '%' || p_query || '%'
    
    UNION ALL
    
    SELECT 
      c.id,
      'certificate'::TEXT as type,
      'Certificate: ' || c.certificate_id as title,
      'Member: ' || a.full_name as subtitle,
      c.status::TEXT as status,
      CASE 
        WHEN c.certificate_id = p_query THEN 90 
        ELSE 10
      END as search_rank,
      '/admin/members/' || a.id || '?tab=certificates' as deep_link
    FROM public.certificates c
    JOIN public.accounts a ON a.id = c.member_id
    WHERE c.certificate_id ILIKE '%' || p_query || '%';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

-- 4. Enforce strict role-check guards on sensitive SECURITY DEFINER telemetry RPCs
CREATE OR REPLACE FUNCTION public.get_security_metrics(p_days_back INTEGER DEFAULT 30)
RETURNS JSONB AS $$
DECLARE
  v_role admin_role;
  v_result JSONB;
BEGIN
  -- Verification check
  SELECT role INTO v_role FROM public.admin_users WHERE user_id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Access Denied: Administrative privileges required';
  END IF;

  SELECT jsonb_build_object(
    'failed_logins', COALESCE((SELECT COUNT(*) FROM public.security_events WHERE event_type = 'failed_login' AND created_at >= now() - (p_days_back || ' days')::INTERVAL), 0),
    'payment_failures', COALESCE((SELECT COUNT(*) FROM public.payments WHERE status = 'failed' AND created_at >= now() - (p_days_back || ' days')::INTERVAL), 0),
    'suspicious_flags', 0, -- Legacy fallback
    'queue_failures', COALESCE((SELECT COUNT(*) FROM public.certificate_generation_queue WHERE status = 'failed' AND created_at >= now() - (p_days_back || ' days')::INTERVAL), 0),
    'admin_actions_today', COALESCE((SELECT COUNT(*) FROM public.audit_logs WHERE created_at >= now()::date), 0)
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION public.get_financial_metrics()
RETURNS JSONB AS $$
DECLARE
  v_role admin_role;
  v_result JSONB;
BEGIN
  -- Verification check
  SELECT role INTO v_role FROM public.admin_users WHERE user_id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Access Denied: Administrative privileges required';
  END IF;

  SELECT jsonb_build_object(
    'revenue_today', COALESCE((SELECT SUM(amount) FROM public.payments WHERE status = 'paid' AND created_at >= now()::date), 0),
    'revenue_month', COALESCE((SELECT SUM(amount) FROM public.payments WHERE status = 'paid' AND created_at >= date_trunc('month', now())), 0),
    'revenue_year', COALESCE((SELECT SUM(amount) FROM public.payments WHERE status = 'paid' AND created_at >= date_trunc('year', now())), 0),
    'cash_revenue', COALESCE((SELECT SUM(amount) FROM public.payments WHERE status = 'paid' AND payment_method = 'cash'), 0),
    'online_revenue', COALESCE((SELECT SUM(amount) FROM public.payments WHERE status = 'paid' AND payment_method != 'cash'), 0),
    'pending_payments', (SELECT COUNT(*) FROM public.accounts WHERE payment_status = 'pending'),
    'failed_payments', (SELECT COUNT(*) FROM public.payments WHERE status = 'failed')
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION public.get_district_analytics()
RETURNS TABLE (
  district TEXT,
  members_count BIGINT,
  approvals_count BIGINT,
  revenue NUMERIC,
  pending_reviews BIGINT,
  certificates_count BIGINT
) AS $$
#variable_conflict use_column
DECLARE
  v_role admin_role;
BEGIN
  -- Verification check
  SELECT role INTO v_role FROM public.admin_users WHERE user_id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Access Denied: Administrative privileges required';
  END IF;

  RETURN QUERY
  SELECT 
    COALESCE(a.district, 'Unspecified') as district,
    COUNT(a.id)::BIGINT as members_count,
    COUNT(a.id) FILTER (WHERE a.approval_status = 'approved')::BIGINT as approvals_count,
    COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'), 0)::NUMERIC as revenue,
    COUNT(a.id) FILTER (WHERE a.approval_status = 'pending' AND a.payment_status = 'paid')::BIGINT as pending_reviews,
    (
      SELECT COUNT(*)::BIGINT 
      FROM public.certificates c 
      JOIN public.accounts acc ON acc.id = c.member_id 
      WHERE acc.district IS NOT DISTINCT FROM a.district
    ) as certificates_count
  FROM public.accounts a
  LEFT JOIN public.payments p ON p.member_id = a.id
  GROUP BY a.district
  ORDER BY members_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION public.get_system_health()
RETURNS JSONB AS $$
DECLARE
  v_connections INTEGER := 0;
  v_accounts_size BIGINT := 0;
  v_queue_size INTEGER := 0;
  v_role admin_role;
  v_result JSONB;
BEGIN
  -- Verification check
  SELECT role INTO v_role FROM public.admin_users WHERE user_id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Access Denied: Administrative privileges required';
  END IF;

  -- Safe query pg_stat_activity connection fetch
  BEGIN
    SELECT count(*) INTO v_connections FROM pg_stat_activity;
  EXCEPTION WHEN OTHERS THEN
    v_connections := -1; -- Fallback flag for restricted environments
  END;

  -- Safe relation sizing query
  BEGIN
    SELECT pg_total_relation_size('public.accounts') INTO v_accounts_size;
  EXCEPTION WHEN OTHERS THEN
    v_accounts_size := -1;
  END;

  -- Fetch queue metrics
  SELECT count(*) INTO v_queue_size FROM public.certificate_generation_queue WHERE status = 'pending';

  SELECT jsonb_build_object(
    'db_connections', v_connections,
    'accounts_table_size_bytes', v_accounts_size,
    'queue_size', v_queue_size,
    'realtime_active_sockets', 1 -- Default metric fallback indicator
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION public.get_membership_renewal_status()
RETURNS TABLE (
  status TEXT,
  members_count BIGINT
) AS $$
#variable_conflict use_column
DECLARE
  v_role admin_role;
BEGIN
  -- Verification check
  SELECT role INTO v_role FROM public.admin_users WHERE user_id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Access Denied: Administrative privileges required';
  END IF;

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
  GROUP BY 1;
END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION public.get_executive_kpis()
RETURNS JSONB AS $$
DECLARE
  v_role admin_role;
  v_conversion_rate NUMERIC;
  v_average_review_hours NUMERIC;
  v_outstanding_invoices_revenue NUMERIC;
  v_current_month_count BIGINT := 0;
  v_prev_month_count BIGINT := 0;
  v_growth_rate_pct NUMERIC;
  v_result JSONB;
BEGIN
  -- Verification check
  SELECT role INTO v_role FROM public.admin_users WHERE user_id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Access Denied: Administrative privileges required';
  END IF;

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
