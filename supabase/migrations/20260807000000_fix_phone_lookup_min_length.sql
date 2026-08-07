-- Migration: Add minimum length validation to lookup_email_by_phone
-- Purpose: Prevent partial matches (e.g., input "123" matching any phone containing "123")
-- by requiring at least 10 digits for Indian phone numbers.

CREATE OR REPLACE FUNCTION public.lookup_email_by_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_phone text;
  v_email text;
BEGIN
  IF p_phone IS NULL OR TRIM(p_phone) = '' THEN
    RETURN NULL;
  END IF;

  -- Remove non-digit characters to normalize input
  v_clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');

  IF length(v_clean_phone) = 0 THEN
    RETURN NULL;
  END IF;

  -- If 12 digits starting with 91 (e.g. 919876543210), strip country code prefix
  IF length(v_clean_phone) = 12 AND v_clean_phone LIKE '91%' THEN
    v_clean_phone := substring(v_clean_phone from 3);
  END IF;

  -- Require at least 10 digits to prevent partial matches.
  -- Indian phone numbers are 10 digits; anything shorter would match
  -- multiple unrelated accounts (e.g., "123" matches any phone containing "123").
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
