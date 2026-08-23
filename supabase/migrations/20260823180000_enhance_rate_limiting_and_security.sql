-- Migration: Enhanced Rate Limiting & Security Hardening
-- Created at: 2026-08-23

-- 1. Upgrade rate_limit_hits table to support anonymous IPs and user identifiers
ALTER TABLE public.rate_limit_hits ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.rate_limit_hits ADD COLUMN IF NOT EXISTS client_identifier VARCHAR(128);

-- Backfill client_identifier for existing records
UPDATE public.rate_limit_hits 
SET client_identifier = user_id::text 
WHERE client_identifier IS NULL AND user_id IS NOT NULL;

-- Index for fast lookup by client_identifier, action_type, and timestamp
CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_identifier_action 
  ON public.rate_limit_hits(client_identifier, action_type, created_at DESC);

-- 2. Enhanced check_rate_limit RPC accepting text identifier (IP or User ID)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier TEXT,
  p_action_type TEXT,
  p_max_requests INT,
  p_window_seconds INT
) RETURNS JSONB AS $$
DECLARE
  v_clean_identifier TEXT;
  v_count INT;
  v_oldest_time TIMESTAMPTZ;
  v_retry_after INT := 0;
  v_allowed BOOLEAN := TRUE;
  v_user_uuid UUID := NULL;
BEGIN
  -- Normalize identifier
  v_clean_identifier := TRIM(COALESCE(p_identifier, ''));

  IF v_clean_identifier = '' THEN
    -- Fallback to default anonymous identifier if blank
    v_clean_identifier := 'anon_unknown';
  END IF;

  -- Try parsing identifier as UUID if it matches UUID format to populate user_id
  IF v_clean_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := v_clean_identifier::UUID;
  END IF;

  -- 1. Clean up old rate limit hits (older than 24 hours)
  DELETE FROM public.rate_limit_hits
  WHERE created_at < now() - INTERVAL '24 hours';

  -- 2. Count requests in sliding window for this identifier and action
  SELECT COUNT(*)::INT INTO v_count
  FROM public.rate_limit_hits
  WHERE (client_identifier = v_clean_identifier OR (v_user_uuid IS NOT NULL AND user_id = v_user_uuid))
    AND action_type = p_action_type
    AND created_at > now() - (p_window_seconds || ' seconds')::INTERVAL;

  -- 3. Check limit
  IF v_count >= p_max_requests THEN
    v_allowed := FALSE;

    SELECT created_at INTO v_oldest_time
    FROM public.rate_limit_hits
    WHERE (client_identifier = v_clean_identifier OR (v_user_uuid IS NOT NULL AND user_id = v_user_uuid))
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
    -- Record the hit
    INSERT INTO public.rate_limit_hits (client_identifier, user_id, action_type)
    VALUES (v_clean_identifier, v_user_uuid, p_action_type);
  END IF;

  RETURN jsonb_build_object('allowed', v_allowed, 'retry_after', v_retry_after);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public;

-- Backwards-compatible overload accepting UUID
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_action_type TEXT,
  p_max_requests INT,
  p_window_seconds INT
) RETURNS JSONB AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN public.check_rate_limit('anon_client', p_action_type, p_max_requests, p_window_seconds);
  ELSE
    RETURN public.check_rate_limit(p_user_id::text, p_action_type, p_max_requests, p_window_seconds);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INT, INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(UUID, TEXT, INT, INT) TO anon, authenticated, service_role;

-- 3. Add rate limiting protection to lookup_email_by_phone
CREATE OR REPLACE FUNCTION public.lookup_email_by_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_clean_phone text;
  v_email text;
  v_client_ip text;
  v_rate_check jsonb;
BEGIN
  IF p_phone IS NULL OR TRIM(p_phone) = '' THEN
    RETURN NULL;
  END IF;

  -- Extract client IP from current session headers if available, or fall back to phone query key
  BEGIN
    v_client_ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
  EXCEPTION WHEN OTHERS THEN
    v_client_ip := NULL;
  END;

  IF v_client_ip IS NULL OR TRIM(v_client_ip) = '' THEN
    v_client_ip := 'phone_lookup_' || current_user;
  ELSE
    v_client_ip := split_part(v_client_ip, ',', 1);
  END IF;

  -- Rate limit: Max 30 phone lookup queries per 15 minutes per client IP
  v_rate_check := public.check_rate_limit(v_client_ip, 'phone_lookup', 30, 900);
  IF NOT (v_rate_check->>'allowed')::boolean THEN
    RAISE EXCEPTION 'Too many requests. Please try again later.' USING ERRCODE = '42900';
  END IF;

  -- Remove non-digit characters to normalize input
  v_clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');

  IF length(v_clean_phone) = 0 THEN
    RETURN NULL;
  END IF;

  -- Strip 91 prefix if 12 digits
  IF length(v_clean_phone) = 12 AND v_clean_phone LIKE '91%' THEN
    v_clean_phone := substring(v_clean_phone from 3);
  END IF;

  -- Require at least 10 digits
  IF length(v_clean_phone) < 10 THEN
    RETURN NULL;
  END IF;

  -- Search across phone, contact_phone, and whatsapp_number
  SELECT email INTO v_email
  FROM public.accounts
  WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') LIKE '%' || v_clean_phone
     OR regexp_replace(COALESCE(contact_phone, ''), '[^0-9]', '', 'g') LIKE '%' || v_clean_phone
     OR regexp_replace(COALESCE(whatsapp_number, ''), '[^0-9]', '', 'g') LIKE '%' || v_clean_phone
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_email_by_phone(text) TO anon, authenticated, service_role;

-- 4. Add rate limiting protection to verify_certificate
CREATE OR REPLACE FUNCTION public.verify_certificate(p_certificate_id TEXT)
RETURNS TABLE (
  certificate_id TEXT,
  member_name TEXT,
  membership_id TEXT,
  issued_at TIMESTAMPTZ,
  status public.certificate_status
) AS $$
DECLARE
  v_uuid UUID;
  v_client_ip text;
  v_rate_check jsonb;
BEGIN
  -- Extract client IP from headers if available
  BEGIN
    v_client_ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
  EXCEPTION WHEN OTHERS THEN
    v_client_ip := NULL;
  END;

  IF v_client_ip IS NULL OR TRIM(v_client_ip) = '' THEN
    v_client_ip := 'cert_verify_' || current_user;
  ELSE
    v_client_ip := split_part(v_client_ip, ',', 1);
  END IF;

  -- Rate limit: Max 60 certificate verifications per minute per client IP
  v_rate_check := public.check_rate_limit(v_client_ip, 'cert_verification', 60, 60);
  IF NOT (v_rate_check->>'allowed')::boolean THEN
    RAISE EXCEPTION 'Too many verification attempts. Please try again later.' USING ERRCODE = '42900';
  END IF;

  -- Parse UUID if provided
  BEGIN
    v_uuid := p_certificate_id::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_uuid := NULL;
  END;

  RETURN QUERY 
  SELECT c.certificate_id, a.full_name, a.membership_id, c.issued_at, c.status
  FROM public.certificates c
  JOIN public.accounts a ON a.id = c.member_id
  WHERE 
    (v_uuid IS NOT NULL AND c.secure_token = v_uuid)
    OR (c.certificate_id = p_certificate_id)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

GRANT EXECUTE ON FUNCTION public.verify_certificate(TEXT) TO anon, authenticated, service_role;
