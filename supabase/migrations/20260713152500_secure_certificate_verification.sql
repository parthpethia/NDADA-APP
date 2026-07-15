-- Migration: Secure Certificate Verification (Add cryptographically secure, unguessable token)
-- Created at: 2026-07-13 15:25:00
-- Version: 20260713152500

-- 1. Add secure_token column to certificates table
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS secure_token UUID DEFAULT gen_random_uuid();

-- 2. Populate secure_token for existing certificates
UPDATE public.certificates SET secure_token = gen_random_uuid() WHERE secure_token IS NULL;

-- 3. Add UNIQUE constraint to secure_token
ALTER TABLE public.certificates ADD CONSTRAINT certificates_secure_token_key UNIQUE (secure_token);

-- 4. Alter the column to NOT NULL after populating
ALTER TABLE public.certificates ALTER COLUMN secure_token SET NOT NULL;

-- 5. Recreate verify_certificate RPC to support both UUID secure_token and legacy certificate_id string matching
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
BEGIN
  -- Attempt to parse the query parameter as a UUID
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

-- 6. Revoke and grant execute permissions to keep in sync with previous security setups
REVOKE ALL ON FUNCTION public.verify_certificate(TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_certificate(TEXT) TO anon, authenticated, service_role;
