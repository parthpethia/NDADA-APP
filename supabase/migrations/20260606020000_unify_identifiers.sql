-- Migration: Unify Membership ID and Certificate ID format to NDADA/MAH/NAG/{membership_id}
-- Created at: 2026-06-06 03:15:00
-- Version: 20260606020000

-- STEP 1: Create backup table for legacy certificate identifiers
CREATE TABLE IF NOT EXISTS public.backup_certificates_legacy_ids (
  id UUID PRIMARY KEY,
  legacy_certificate_id TEXT NOT NULL,
  member_id UUID NOT NULL,
  backup_timestamp TIMESTAMPTZ DEFAULT now()
);

-- STEP 2: Backup existing certificates before migration
INSERT INTO public.backup_certificates_legacy_ids (id, legacy_certificate_id, member_id)
SELECT id, certificate_id, member_id FROM public.certificates
ON CONFLICT (id) DO UPDATE SET
  legacy_certificate_id = EXCLUDED.legacy_certificate_id,
  backup_timestamp = now();

-- STEP 3: Redefine the trigger function to format certificate_id as NDADA/MAH/NAG/{membership_id}
CREATE OR REPLACE FUNCTION public.generate_certificate_id()
RETURNS TRIGGER AS $$
DECLARE
  v_membership_id TEXT;
BEGIN
  IF NEW.certificate_id IS NULL OR NEW.certificate_id = '' THEN
    SELECT membership_id INTO v_membership_id
    FROM public.accounts
    WHERE id = NEW.member_id;
    
    IF v_membership_id IS NOT NULL AND v_membership_id <> '' THEN
      NEW.certificate_id := 'NDADA/MAH/NAG/' || v_membership_id;
    ELSE
      RAISE EXCEPTION 'Cannot generate certificate_id: No membership_id found for account %', NEW.member_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

-- STEP 4: Update all existing certificates to the new unified format
UPDATE public.certificates c
SET certificate_id = 'NDADA/MAH/NAG/' || a.membership_id
FROM public.accounts a
WHERE c.member_id = a.id;

-- STEP 5: Clean up orphans in certificate_downloads before casting
DELETE FROM public.certificate_downloads cd
WHERE NOT EXISTS (
  SELECT 1 FROM public.certificates c
  WHERE c.id::text = cd.certificate_id
);

-- STEP 6: Cast certificate_id in certificate_downloads to UUID and add foreign key
-- Note: All remaining records in certificate_downloads point to valid certificates(id) UUIDs as text
ALTER TABLE public.certificate_downloads
  ALTER COLUMN certificate_id TYPE UUID USING certificate_id::uuid,
  DROP CONSTRAINT IF EXISTS fk_certificate_downloads_certificate_id,
  ADD CONSTRAINT fk_certificate_downloads_certificate_id 
    FOREIGN KEY (certificate_id) REFERENCES public.certificates(id) ON DELETE CASCADE;

-- STEP 7: Re-queue existing certificates for background regeneration to update PDF and QR code
INSERT INTO public.certificate_generation_queue (account_id, status)
SELECT member_id, 'pending'::public.certificate_generation_status
FROM public.certificates
ON CONFLICT (account_id) DO UPDATE SET
  status = 'pending',
  processing_started_at = NULL,
  completed_at = NULL,
  error_message = NULL,
  retry_count = 0;
