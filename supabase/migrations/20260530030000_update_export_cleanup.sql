-- =========================================================================
-- MIGRATION: 20260530030000_update_export_cleanup.sql
-- Refine database-level cleanup to prevent physical storage leak hazards.
-- =========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.cleanup_expired_exports()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER := 0;
  v_record RECORD;
BEGIN
  -- Search for expired exports that still hold file references.
  -- Database function now only invalidates DB rows. 
  -- Official Deno Edge Function API handles physical storage removal using the Storage API.
  FOR v_record IN 
    SELECT id FROM public.export_jobs 
    WHERE expires_at <= now() AND file_url IS NOT NULL
  LOOP
    -- Invalidate database references and mark as expired
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
