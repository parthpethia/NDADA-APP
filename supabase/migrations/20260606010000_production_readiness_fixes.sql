-- MIGRATION: Production Readiness security & logical fixes
-- Created at: 2026-06-06 02:25:00
-- Version: 20260606010000

-- 1. Create the public verify_certificate RPC (Enforces single-row result)
CREATE OR REPLACE FUNCTION public.verify_certificate(p_certificate_id TEXT)
RETURNS TABLE (
  certificate_id TEXT,
  member_name TEXT,
  membership_id TEXT,
  issued_at TIMESTAMPTZ,
  status public.certificate_status
) AS $$
BEGIN
  RETURN QUERY 
  SELECT c.certificate_id, a.full_name, a.membership_id, c.issued_at, c.status
  FROM public.certificates c
  JOIN public.accounts a ON a.id = c.member_id
  WHERE c.certificate_id = p_certificate_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

REVOKE ALL ON FUNCTION public.verify_certificate(TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_certificate(TEXT) TO anon, authenticated, service_role;

-- 2. Aadhaar Masking Trigger (Retain only last 4 digits from the start)
CREATE OR REPLACE FUNCTION public.mask_aadhaar_always()
RETURNS TRIGGER AS $$
DECLARE
  clean_aadhaar TEXT;
BEGIN
  IF NEW.aadhaar_card_number IS NOT NULL AND NEW.aadhaar_card_number <> '' THEN
    -- If it's already masked (e.g. starts with X), do nothing
    IF NEW.aadhaar_card_number LIKE 'XXXX-XXXX-%' OR NEW.aadhaar_card_number LIKE 'XXXX XXXX %' OR NEW.aadhaar_card_number LIKE 'XXXXXXXX%' THEN
      RETURN NEW;
    END IF;
    
    clean_aadhaar := regexp_replace(NEW.aadhaar_card_number, '\D', '', 'g');
    IF length(clean_aadhaar) >= 4 THEN
      NEW.aadhaar_card_number := 'XXXX-XXXX-' || right(clean_aadhaar, 4);
    ELSE
      NEW.aadhaar_card_number := clean_aadhaar;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

DROP TRIGGER IF EXISTS trg_mask_aadhaar_on_approval ON public.accounts;
DROP TRIGGER IF EXISTS trg_mask_aadhaar_always ON public.accounts;

CREATE TRIGGER trg_mask_aadhaar_always
  BEFORE INSERT OR UPDATE OF aadhaar_card_number ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.mask_aadhaar_always();

-- Mask all existing accounts' Aadhaar numbers immediately
UPDATE public.accounts
SET aadhaar_card_number = 'XXXX-XXXX-' || right(regexp_replace(aadhaar_card_number, '\D', '', 'g'), 4)
WHERE aadhaar_card_number IS NOT NULL 
  AND aadhaar_card_number <> ''
  AND aadhaar_card_number NOT LIKE 'XXXX-XXXX-%'
  AND aadhaar_card_number NOT LIKE 'XXXX XXXX %'
  AND aadhaar_card_number NOT LIKE 'XXXXXXXX%';

-- 3. Exclude admin users from rate limiting checks
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
  -- Handle null user
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', TRUE, 'retry_after', 0);
  END IF;
  
  -- Exclude admin users from rate limiting entirely
  IF EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_user_id) THEN
    RETURN jsonb_build_object('allowed', TRUE, 'retry_after', 0);
  END IF;

  -- Clean up old rate limit hits (older than 24 hours to keep the table compact)
  DELETE FROM public.rate_limit_hits
  WHERE created_at < now() - INTERVAL '24 hours';

  -- Count requests in sliding window
  SELECT COUNT(*)::INT INTO v_count
  FROM public.rate_limit_hits
  WHERE user_id = p_user_id
    AND action_type = p_action_type
    AND created_at > now() - (p_window_seconds || ' seconds')::INTERVAL;

  -- If limit exceeded
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
    -- Record hit
    INSERT INTO public.rate_limit_hits (user_id, action_type)
    VALUES (p_user_id, p_action_type);
  END IF;

  RETURN jsonb_build_object('allowed', v_allowed, 'retry_after', v_retry_after);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

-- 4. Create the public.is_admin helper function if it doesn't exist
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

-- 5. Storage bucket access for admin/reviewer users
DROP POLICY IF EXISTS "Admins read all documents" ON storage.objects;
CREATE POLICY "Admins read all documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins read all id proofs" ON storage.objects;
CREATE POLICY "Admins read all id proofs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'id-proofs'
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins read all payment proofs" ON storage.objects;
CREATE POLICY "Admins read all payment proofs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payment-proofs'
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins read all certificates" ON storage.objects;
CREATE POLICY "Admins read all certificates"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'certificates'
    AND public.is_admin()
  );
