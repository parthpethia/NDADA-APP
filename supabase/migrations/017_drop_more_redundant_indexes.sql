-- Performance: drop redundant indexes that duplicate UNIQUE constraint indexes
-- Note: Postgres creates indexes automatically for UNIQUE constraints.

-- firms.registration_number is UNIQUE, so idx_firms_registration_number is redundant
DROP INDEX IF EXISTS public.idx_firms_registration_number;

-- certificates.certificate_id is UNIQUE, so idx_certificates_certificate_id is redundant
DROP INDEX IF EXISTS public.idx_certificates_certificate_id;
