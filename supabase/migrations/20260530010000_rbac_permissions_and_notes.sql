-- =========================================================================
-- MIGRATION: 20260530010000_rbac_permissions_and_notes.sql
-- Unified Database setup for NDADA Admin Portal Expansion
-- Features: Permissions, Notes (Soft-Delete), Assignments (Least-Privilege RLS),
-- Global Ranked Search, Asynchronous Export Queue, Security, Financial, and Health RPCs
-- =========================================================================

BEGIN;

-- =========================================================================
-- SECTION 1: PERMISSION-BASED RBAC FOUNDATION
-- =========================================================================

-- Table: public.admin_permissions
CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: public.role_permissions (Mapping roles to permission names)
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role admin_role NOT NULL,
  permission_name TEXT NOT NULL REFERENCES public.admin_permissions(name) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_name)
);

-- RLS Enablement
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Select policies
CREATE POLICY "admins_view_permissions" ON public.admin_permissions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

CREATE POLICY "admins_view_role_permissions" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- Security Definer permission check helper
CREATE OR REPLACE FUNCTION public.has_permission(p_user_id UUID, p_permission TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_role admin_role;
  v_has_perm BOOLEAN;
BEGIN
  -- Fetch role for user
  SELECT role INTO v_role FROM public.admin_users WHERE user_id = p_user_id;
  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Super admin bypasses all permission checks
  IF v_role = 'super_admin' THEN
    RETURN TRUE;
  END IF;

  -- Check matching role permission mappings
  SELECT EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE role = v_role AND permission_name = p_permission
  ) INTO v_has_perm;

  RETURN v_has_perm;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

-- Seed baseline permissions
INSERT INTO public.admin_permissions (name, description) VALUES
  ('manage_members', 'Allows creating, modifying, suspending, and activating members'),
  ('manage_firms', 'Allows modifying firm details, approving, and rejecting firm submissions'),
  ('manage_certificates', 'Allows viewing, downloading, revoking, and regenerating membership certificates'),
  ('manage_payments', 'Allows verifying payments, viewing payment details, and updating payment statuses'),
  ('view_audit_logs', 'Allows viewing administrative actions audit log'),
  ('manage_admins', 'Allows super admins to create, promote, demote, disable, and enable admins/reviewers'),
  ('manage_assignments', 'Allows assigning, reassigning, and removing application reviewers'),
  ('manage_queue', 'Allows monitoring, retrying, and canceling certificate generation jobs')
ON CONFLICT (name) DO NOTHING;

-- Seed baseline mappings
INSERT INTO public.role_permissions (role, permission_name) VALUES
  ('reviewer', 'manage_assignments'),
  ('admin', 'manage_members'),
  ('admin', 'manage_firms'),
  ('admin', 'manage_certificates'),
  ('admin', 'manage_payments'),
  ('admin', 'view_audit_logs'),
  ('admin', 'manage_assignments'),
  ('admin', 'manage_queue')
ON CONFLICT DO NOTHING;

-- =========================================================================
-- SECTION 2: ADMIN NOTES SYSTEM WITH SOFT-DELETE
-- =========================================================================

-- Table: public.admin_notes
CREATE TABLE IF NOT EXISTS public.admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL
);

-- Indexing
CREATE INDEX IF NOT EXISTS idx_admin_notes_member_id ON public.admin_notes(member_id) WHERE deleted_at IS NULL;

-- Enable RLS
ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

-- Notes Policies (Strictly confidential - Admins only)
CREATE POLICY "admins_select_active_notes" ON public.admin_notes
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL 
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY "admins_insert_notes" ON public.admin_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
    AND admin_id = (SELECT id FROM public.admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY "admins_update_own_notes" ON public.admin_notes
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND admin_id = (SELECT id FROM public.admin_users WHERE user_id = auth.uid())
  )
  WITH CHECK (
    admin_id = (SELECT id FROM public.admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY "admins_delete_own_or_super" ON public.admin_notes
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      admin_id = (SELECT id FROM public.admin_users WHERE user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND role = 'super_admin')
    )
  );

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_admin_notes_updated_at ON public.admin_notes;
CREATE TRIGGER trg_admin_notes_updated_at
  BEFORE UPDATE ON public.admin_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =========================================================================
-- SECTION 3: REVIEW ASSIGNMENTS & LEAST-PRIVILEGE RLS
-- =========================================================================

-- Table: public.review_assignments
CREATE TABLE IF NOT EXISTS public.review_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID UNIQUE NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexing
CREATE INDEX IF NOT EXISTS idx_review_assignments_assigned_to ON public.review_assignments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_review_assignments_account_id ON public.review_assignments(account_id);

-- Enable RLS
ALTER TABLE public.review_assignments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "admins_view_assignments" ON public.review_assignments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

CREATE POLICY "admins_modify_assignments" ON public.review_assignments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin')));

DROP TRIGGER IF EXISTS trg_review_assignments_updated_at ON public.review_assignments;
CREATE TRIGGER trg_review_assignments_updated_at
  BEFORE UPDATE ON public.review_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- REFACTOR ACCOUNTS SELECT POLICIES
DROP POLICY IF EXISTS "admins_view_all_accounts" ON public.accounts;

-- 1. Full view access for standard Admins & Super Admins
CREATE POLICY "admins_view_all_accounts" ON public.accounts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

-- 2. Strict assigned-only select access for Reviewers
CREATE POLICY "reviewers_view_assigned_accounts" ON public.accounts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      JOIN public.review_assignments ra ON ra.assigned_to = au.id
      WHERE au.user_id = auth.uid() AND ra.account_id = public.accounts.id
    )
  );

-- =========================================================================
-- SECTION 4: GLOBAL SEARCH OPTIMIZATION WITH WEIGHTED RANKING
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Text search compound index
CREATE INDEX IF NOT EXISTS idx_accounts_trgm_search ON public.accounts USING gin (
  (COALESCE(membership_id, '') || ' ' ||
   COALESCE(full_name, '') || ' ' ||
   COALESCE(email, '') || ' ' ||
   COALESCE(phone, '') || ' ' ||
   COALESCE(firm_name, '') || ' ' ||
   COALESCE(gst_number, '') || ' ' ||
   COALESCE(license_number, '') || ' ' ||
   COALESCE(registration_number, '')) gin_trgm_ops
);

-- Ranked global search function
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
BEGIN
  RETURN QUERY
  -- Accounts queries
  SELECT 
    a.id,
    'member'::TEXT as type,
    a.full_name as title,
    'ID: ' || a.membership_id || ' | ' || a.email as subtitle,
    a.account_status::TEXT as status,
    CASE 
      WHEN a.membership_id = p_query THEN 100 -- Priority 1: Exact Membership ID
      WHEN a.email = p_query THEN 80         -- Priority 3: Exact Email
      WHEN a.phone = p_query THEN 70         -- Priority 4: Exact Phone
      WHEN a.registration_number = p_query THEN 60 -- Priority 5: Exact Registration Number
      WHEN a.gst_number = p_query THEN 50    -- Priority 6: Exact GST Number
      ELSE 10                                 -- Fuzzy Match
    END as search_rank,
    '/admin/members/' || a.id as deep_link
  FROM public.accounts a
  WHERE 
    a.membership_id ILIKE '%' || p_query || '%'
    OR a.full_name ILIKE '%' || p_query || '%'
    OR a.email ILIKE '%' || p_query || '%'
    OR a.phone ILIKE '%' || p_query || '%'
    OR a.firm_name ILIKE '%' || p_query || '%'
    OR a.gst_number ILIKE '%' || p_query || '%'
    OR a.license_number ILIKE '%' || p_query || '%'
    OR a.registration_number ILIKE '%' || p_query || '%'
  
  UNION ALL
  
  -- Certificates queries
  SELECT 
    c.id,
    'certificate'::TEXT as type,
    'Certificate: ' || c.certificate_id as title,
    'Member: ' || a.full_name as subtitle,
    c.status::TEXT as status,
    CASE 
      WHEN c.certificate_id = p_query THEN 90 -- Priority 2: Exact Certificate ID
      ELSE 10
    END as search_rank,
    '/admin/members/' || a.id || '?tab=certificates' as deep_link
  FROM public.certificates c
  JOIN public.accounts a ON a.id = c.member_id
  WHERE c.certificate_id ILIKE '%' || p_query || '%'
  
  ORDER BY search_rank DESC, title ASC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

-- =========================================================================
-- SECTION 5: EXPORT CENTER WITH AUTOMATIC 7-DAY CLEANUP
-- =========================================================================

-- Table: public.export_jobs
CREATE TABLE IF NOT EXISTS public.export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL CHECK (export_type IN ('members', 'firms', 'payments', 'certificates', 'audit_logs')),
  filters JSONB DEFAULT '{}'::jsonb,
  format TEXT NOT NULL CHECK (format IN ('CSV', 'XLSX')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
  file_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_admin_id ON public.export_jobs(admin_id);

-- Enable RLS
ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "admins_view_own_exports" ON public.export_jobs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
    AND admin_id = (SELECT id FROM public.admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY "admins_create_exports" ON public.export_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
    AND admin_id = (SELECT id FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS trg_export_jobs_updated_at ON public.export_jobs;
CREATE TRIGGER trg_export_jobs_updated_at
  BEFORE UPDATE ON public.export_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Export clean-up procedure
CREATE OR REPLACE FUNCTION public.cleanup_expired_exports()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER := 0;
  v_record RECORD;
BEGIN
  -- Search for expired exports that still hold download paths
  FOR v_record IN 
    SELECT id, file_url FROM public.export_jobs 
    WHERE expires_at <= now() AND file_url IS NOT NULL
  LOOP
    -- Invalidate database links
    UPDATE public.export_jobs 
    SET file_url = NULL, status = 'failed', error_message = 'Export link expired (7 days retention limit)'
    WHERE id = v_record.id;
    
    v_deleted_count := v_deleted_count + 1;
  END LOOP;
  
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

-- =========================================================================
-- SECTION 6: ANALYTICS & DIAGNOSTICS STATS FUNCTIONS
-- =========================================================================

-- Table additions to capture security events if not present
CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_read_security_events" ON public.security_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- 1. Security Aggregates
CREATE OR REPLACE FUNCTION public.get_security_metrics(p_days_back INTEGER DEFAULT 30)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'failed_logins', COALESCE((SELECT COUNT(*) FROM public.security_events WHERE event_type = 'failed_login' AND created_at >= now() - (p_days_back || ' days')::INTERVAL), 0),
    'payment_failures', COALESCE((SELECT COUNT(*) FROM public.payments WHERE status = 'failed' AND created_at >= now() - (p_days_back || ' days')::INTERVAL), 0),
    'suspicious_flags', COALESCE((SELECT COUNT(*) FROM public.fraud_flags WHERE resolved = false AND created_at >= now() - (p_days_back || ' days')::INTERVAL), 0),
    'queue_failures', COALESCE((SELECT COUNT(*) FROM public.certificate_generation_queue WHERE status = 'failed' AND created_at >= now() - (p_days_back || ' days')::INTERVAL), 0),
    'admin_actions_today', COALESCE((SELECT COUNT(*) FROM public.audit_logs WHERE created_at >= now()::date), 0)
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

-- 2. Financial Metrics
CREATE OR REPLACE FUNCTION public.get_financial_metrics()
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
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

-- 3. District Aggregates
CREATE OR REPLACE FUNCTION public.get_district_analytics()
RETURNS TABLE (
  district TEXT,
  members_count BIGINT,
  approvals_count BIGINT,
  revenue NUMERIC,
  pending_reviews BIGINT,
  certificates_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(a.district, 'Unspecified') as district,
    COUNT(a.id)::BIGINT as members_count,
    COUNT(a.id) FILTER (WHERE a.approval_status = 'approved')::BIGINT as approvals_count,
    COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'), 0)::NUMERIC as revenue,
    COUNT(a.id) FILTER (WHERE a.approval_status = 'pending' AND a.payment_status = 'paid')::BIGINT as pending_reviews,
    (SELECT COUNT(*) FROM public.certificates c WHERE c.member_id IN (SELECT id FROM public.accounts WHERE district = a.district))::BIGINT as certificates_count
  FROM public.accounts a
  LEFT JOIN public.payments p ON p.member_id = a.id
  GROUP BY a.district
  ORDER BY members_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

-- 4. Defensive System Health Diagnostics
CREATE OR REPLACE FUNCTION public.get_system_health()
RETURNS JSONB AS $$
DECLARE
  v_connections INTEGER := 0;
  v_accounts_size BIGINT := 0;
  v_queue_size INTEGER := 0;
  v_result JSONB;
BEGIN
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

-- =========================================================================
-- SECTION 7: ANNOUNCEMENT CENTER & SAVED FILTERS
-- =========================================================================

-- Table: public.announcements
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('all', 'district', 'group')),
  target_value TEXT,
  created_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_announcements" ON public.announcements
  FOR SELECT TO authenticated
  USING (true); -- Broad visibility for notification delivery

CREATE POLICY "admins_manage_announcements" ON public.announcements
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin')));

-- Table: public.admin_saved_filters
CREATE TABLE IF NOT EXISTS public.admin_saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_saved_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_filters" ON public.admin_saved_filters
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
    AND admin_id = (SELECT id FROM public.admin_users WHERE user_id = auth.uid())
  );

COMMIT;
