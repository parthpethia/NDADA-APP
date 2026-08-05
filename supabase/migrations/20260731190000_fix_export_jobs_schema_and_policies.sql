-- ============================================================
-- MIGRATION: 20260731190000_fix_export_jobs_schema_and_policies.sql
-- Description: Isolated, fully idempotent schema script to ensure 
--              the Admin Export system (export_jobs, storage, RLS policies,
--              rate-limiting, and cleanup RPCs) is correctly configured.
-- Instructions: Run this script directly in the Supabase SQL Editor or migration runner.
-- ============================================================

BEGIN;

-- ============================================================
-- SECTION 1: ENSURE BASE FUNCTION DEPENDENCIES
-- ============================================================

-- Function to handle updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

-- ============================================================
-- SECTION 2: EXPORT JOBS TABLE CREATION & CONSTRAINTS
-- ============================================================

-- Table: public.export_jobs
CREATE TABLE IF NOT EXISTS public.export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL DEFAULT 'members',
  filters JSONB DEFAULT '{}'::jsonb,
  format TEXT NOT NULL DEFAULT 'XLSX',
  status TEXT NOT NULL DEFAULT 'pending',
  file_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days')
);

-- Update/Refresh check constraints to support all export types & formats
ALTER TABLE public.export_jobs DROP CONSTRAINT IF EXISTS export_jobs_export_type_check;
ALTER TABLE public.export_jobs ADD CONSTRAINT export_jobs_export_type_check 
  CHECK (export_type IN ('members', 'firms', 'payments', 'certificates', 'audit_logs'));

ALTER TABLE public.export_jobs DROP CONSTRAINT IF EXISTS export_jobs_format_check;
ALTER TABLE public.export_jobs ADD CONSTRAINT export_jobs_format_check 
  CHECK (format IN ('CSV', 'XLSX', 'PDF'));

ALTER TABLE public.export_jobs DROP CONSTRAINT IF EXISTS export_jobs_status_check;
ALTER TABLE public.export_jobs ADD CONSTRAINT export_jobs_status_check 
  CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

-- Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_export_jobs_admin_id ON public.export_jobs(admin_id);
CREATE INDEX IF NOT EXISTS idx_export_jobs_expires_at ON public.export_jobs(expires_at);
CREATE INDEX IF NOT EXISTS idx_export_jobs_created_at ON public.export_jobs(created_at DESC);

-- Trigger for auto updating updated_at
DROP TRIGGER IF EXISTS trg_export_jobs_updated_at ON public.export_jobs;
CREATE TRIGGER trg_export_jobs_updated_at
  BEFORE UPDATE ON public.export_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- SECTION 3: ROW LEVEL SECURITY (RLS) POLICIES FOR EXPORT JOBS
-- ============================================================

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

-- Drop all old/legacy policies to eliminate conflicts
DROP POLICY IF EXISTS "admins_view_own_exports" ON public.export_jobs;
DROP POLICY IF EXISTS "admins_create_exports" ON public.export_jobs;
DROP POLICY IF EXISTS "admins_update_own_exports" ON public.export_jobs;
DROP POLICY IF EXISTS "admins_delete_own_exports" ON public.export_jobs;
DROP POLICY IF EXISTS "service_role_export_jobs_all" ON public.export_jobs;

-- 1. SELECT Policy (Admins can view their own export jobs)
CREATE POLICY "admins_view_own_exports" ON public.export_jobs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
    AND admin_id = (SELECT id FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

-- 2. INSERT Policy (Admins can create new export jobs assigned to their profile)
CREATE POLICY "admins_create_exports" ON public.export_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
    AND admin_id = (SELECT id FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

-- 3. UPDATE Policy (Admins can update their own export jobs)
CREATE POLICY "admins_update_own_exports" ON public.export_jobs
  FOR UPDATE TO authenticated
  USING (
    admin_id = (SELECT id FROM public.admin_users WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    admin_id = (SELECT id FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

-- 4. DELETE Policy (Admins can delete their own export jobs)
CREATE POLICY "admins_delete_own_exports" ON public.export_jobs
  FOR DELETE TO authenticated
  USING (
    admin_id = (SELECT id FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

-- 5. SERVICE ROLE Policy (Full access for background workers and Edge Functions)
CREATE POLICY "service_role_export_jobs_all" ON public.export_jobs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- SECTION 4: STORAGE BUCKET & OBJECT SECURITY POLICIES
-- ============================================================

-- Ensure the private storage bucket exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('secure-exports', 'secure-exports', false) 
ON CONFLICT (id) DO UPDATE SET public = false;

-- Storage object policies for secure-exports bucket
DROP POLICY IF EXISTS "admins_read_secure_exports" ON storage.objects;
DROP POLICY IF EXISTS "admins_upload_secure_exports" ON storage.objects;
DROP POLICY IF EXISTS "admins_delete_secure_exports" ON storage.objects;
DROP POLICY IF EXISTS "service_role_secure_exports_all" ON storage.objects;

CREATE POLICY "admins_read_secure_exports" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'secure-exports'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

CREATE POLICY "admins_upload_secure_exports" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'secure-exports'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

CREATE POLICY "admins_delete_secure_exports" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'secure-exports'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid()))
  );

CREATE POLICY "service_role_secure_exports_all" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'secure-exports')
  WITH CHECK (bucket_id = 'secure-exports');

-- ============================================================
-- SECTION 5: EXPORT CLEANUP RPC PROCEDURES
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_expired_exports()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER := 0;
  v_record RECORD;
BEGIN
  -- Search for expired export jobs that still hold file references
  FOR v_record IN 
    SELECT id, file_url FROM public.export_jobs 
    WHERE expires_at <= now() AND file_url IS NOT NULL
  LOOP
    -- Invalidate database download reference
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

-- Grant permissions for cleanup function
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_exports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_exports() TO authenticated, service_role;

-- ============================================================
-- SECTION 6: RATE LIMITING TABLE & SLIDING WINDOW RPC
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_user_action 
  ON public.rate_limit_hits(user_id, action_type, created_at DESC);

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all rate limit hits" ON public.rate_limit_hits;
CREATE POLICY "Admins can view all rate limit hits" 
  ON public.rate_limit_hits
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = (select auth.uid())));

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_action_type TEXT,
  p_max_requests INT,
  p_window_seconds INT
) RETURNS JSONB AS $$
DECLARE
  v_count INT;
  v_oldest_time TIMESTAMPTZ;
  v_retry_after INT := 0;
  v_allowed BOOLEAN := TRUE;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', TRUE, 'retry_after', 0);
  END IF;

  -- Clean up old rate limit hits (> 24h)
  DELETE FROM public.rate_limit_hits
  WHERE created_at < now() - INTERVAL '24 hours';

  -- Count requests within sliding window
  SELECT COUNT(*)::INT INTO v_count
  FROM public.rate_limit_hits
  WHERE user_id = p_user_id
    AND action_type = p_action_type
    AND created_at > now() - (p_window_seconds || ' seconds')::INTERVAL;

  IF v_count >= p_max_requests THEN
    v_allowed := FALSE;
    
    SELECT created_at INTO v_oldest_time
    FROM public.rate_limit_hits
    WHERE user_id = p_user_id
      AND action_type = p_action_type
      AND created_at > now() - (p_window_seconds || ' seconds')::INTERVAL
    ORDER BY created_at DESC
    OFFSET (p_max_requests - 1)
    LIMIT 1;

    IF v_oldest_time IS NOT NULL THEN
      v_retry_after := CEIL(EXTRACT(EPOCH FROM (v_oldest_time + (p_window_seconds || ' seconds')::INTERVAL - now())))::INT;
      IF v_retry_after < 1 THEN
        v_retry_after := 1;
      END IF;
    ELSE
      v_retry_after := 1;
    END IF;
  ELSE
    INSERT INTO public.rate_limit_hits (user_id, action_type)
    VALUES (p_user_id, p_action_type);
  END IF;

  RETURN jsonb_build_object('allowed', v_allowed, 'retry_after', v_retry_after);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

GRANT EXECUTE ON FUNCTION public.check_rate_limit TO authenticated, service_role;

COMMIT;
