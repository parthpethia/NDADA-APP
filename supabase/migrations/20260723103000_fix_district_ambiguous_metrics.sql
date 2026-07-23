-- Migration: Fix Ambiguous Column References in Admin Analytics and Telemetry RPCs
-- Created at: 2026-07-23 10:30:00
-- Version: 20260723103000

BEGIN;

-- =========================================================================
-- 1. Fix get_district_analytics RPC
-- Disambiguates OUT parameter "district" vs table column "district"
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_district_analytics()
RETURNS TABLE (
  district TEXT,
  members_count BIGINT,
  approvals_count BIGINT,
  revenue NUMERIC,
  pending_reviews BIGINT,
  certificates_count BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
$$;

-- =========================================================================
-- 2. Fix get_membership_renewal_status RPC
-- Disambiguates OUT parameter "status" in GROUP BY clause
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_membership_renewal_status()
RETURNS TABLE (
  status TEXT,
  members_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
$$;

-- =========================================================================
-- 3. Fix global_admin_search RPC
-- Disambiguates OUT parameters (id, type, status) in UNION queries
-- =========================================================================
CREATE OR REPLACE FUNCTION public.global_admin_search(p_query TEXT)
RETURNS TABLE (
  id UUID,
  type TEXT,
  title TEXT,
  subtitle TEXT,
  status TEXT,
  search_rank INTEGER,
  deep_link TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
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
$$;

-- Grant permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.get_district_analytics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_membership_renewal_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.global_admin_search(TEXT) TO authenticated;

COMMIT;
