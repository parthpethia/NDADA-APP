-- =========================================================================
-- MIGRATION: 20260530020000_verify_reviewer_and_trgm.sql
-- Phase 2 Pre-verification, tightening, and search GIN optimization
-- =========================================================================

BEGIN;

-- =========================================================================
-- SECTION 1: TIGHTEN REVIEWER RLS ON ADMIN NOTES
-- =========================================================================

DROP POLICY IF EXISTS "admins_insert_notes" ON public.admin_notes;
DROP POLICY IF EXISTS "admins_update_own_notes" ON public.admin_notes;
DROP POLICY IF EXISTS "admins_delete_own_or_super" ON public.admin_notes;

-- 1. Notes Insertion: Enforce that if caller is a reviewer, the member account must be assigned to them
CREATE POLICY "admins_insert_notes" ON public.admin_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = auth.uid()
      AND (
        au.role IN ('super_admin', 'admin') -- Admins/SuperAdmins bypass assignment constraint
        OR EXISTS (
          SELECT 1 FROM public.review_assignments ra
          WHERE ra.assigned_to = au.id AND ra.account_id = member_id
        )
      )
    )
    AND admin_id = (SELECT id FROM public.admin_users WHERE user_id = auth.uid())
  );

-- 2. Notes Updates: Enforce creator checks and reviewer assignments
CREATE POLICY "admins_update_own_notes" ON public.admin_notes
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND admin_id = (SELECT id FROM public.admin_users WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = auth.uid()
      AND (
        au.role IN ('super_admin', 'admin')
        OR EXISTS (
          SELECT 1 FROM public.review_assignments ra
          WHERE ra.assigned_to = au.id AND ra.account_id = member_id
        )
      )
    )
  )
  WITH CHECK (
    admin_id = (SELECT id FROM public.admin_users WHERE user_id = auth.uid())
  );

-- 3. Notes Deletions: Creators or Super Admins on assigned workloads
CREATE POLICY "admins_delete_own_or_super" ON public.admin_notes
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      (
        admin_id = (SELECT id FROM public.admin_users WHERE user_id = auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.admin_users au
          WHERE au.user_id = auth.uid()
          AND (
            au.role IN ('super_admin', 'admin')
            OR EXISTS (
              SELECT 1 FROM public.review_assignments ra
              WHERE ra.assigned_to = au.id AND ra.account_id = member_id
            )
          )
        )
      )
      OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND role = 'super_admin')
    )
  );

-- =========================================================================
-- SECTION 2: GLOBAL SEARCH OPTIMIZATION (FORCE GIN TRIGRAM INDEX USAGE)
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
) AS $$
BEGIN
  RETURN QUERY
  -- Accounts queries using matching compound trigram comparison
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
    -- Compound string triggers the GIN trigram index exactly!
    (COALESCE(a.membership_id, '') || ' ' ||
     COALESCE(a.full_name, '') || ' ' ||
     COALESCE(a.email, '') || ' ' ||
     COALESCE(a.phone, '') || ' ' ||
     COALESCE(a.firm_name, '') || ' ' ||
     COALESCE(a.gst_number, '') || ' ' ||
     COALESCE(a.license_number, '') || ' ' ||
     COALESCE(a.registration_number, '')) ILIKE '%' || p_query || '%'
  
  UNION ALL
  
  -- Certificates search
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
  WHERE c.certificate_id ILIKE '%' || p_query || '%'
  
  ORDER BY search_rank DESC, title ASC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

-- =========================================================================
-- SECTION 3: EXPORT AUTO-CLEANUP STORAGE PURGE
-- =========================================================================

CREATE OR REPLACE FUNCTION public.cleanup_expired_exports()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER := 0;
  v_record RECORD;
BEGIN
  -- Search for expired exports that still hold file references
  FOR v_record IN 
    SELECT id, file_url FROM public.export_jobs 
    WHERE expires_at <= now() AND file_url IS NOT NULL
  LOOP
    -- 1. Purge from storage.objects table to release physical storage blocks
    -- Supabase triggers automatically hook into storage.objects deletions to delete physical storage files
    BEGIN
      DELETE FROM storage.objects 
      WHERE bucket_id = 'secure-exports' 
      AND name = v_record.file_url;
    EXCEPTION WHEN OTHERS THEN
      -- Silently proceed if storage schema is not present locally (development environment fallback)
      NULL;
    END;

    -- 2. Invalidate database references and mark as expired
    UPDATE public.export_jobs 
    SET file_url = NULL, 
        status = 'failed', 
        error_message = 'Export link expired (7 days retention limit)'
    WHERE id = v_record.id;
    
    v_deleted_count := v_deleted_count + 1;
  END LOOP;
  
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

COMMIT;
