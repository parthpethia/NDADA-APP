-- ============================================================
-- Extend firms table with NDADA membership form fields
-- ============================================================

ALTER TABLE firms
  ADD COLUMN IF NOT EXISTS firm_pin_code TEXT,
  ADD COLUMN IF NOT EXISTS partner_proprietor_name TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS aadhaar_card_number TEXT,
  ADD COLUMN IF NOT EXISTS ifms_number TEXT,
  ADD COLUMN IF NOT EXISTS seed_cotton_license_number TEXT,
  ADD COLUMN IF NOT EXISTS seed_cotton_license_expiry TEXT,
  ADD COLUMN IF NOT EXISTS sarthi_id_cotton TEXT,
  ADD COLUMN IF NOT EXISTS seed_general_license_number TEXT,
  ADD COLUMN IF NOT EXISTS seed_general_license_expiry TEXT,
  ADD COLUMN IF NOT EXISTS sarthi_id_general TEXT,
  ADD COLUMN IF NOT EXISTS pesticide_license_number TEXT,
  ADD COLUMN IF NOT EXISTS pesticide_license_expiry TEXT,
  ADD COLUMN IF NOT EXISTS fertilizer_license_number TEXT,
  ADD COLUMN IF NOT EXISTS fertilizer_license_expiry TEXT,
  ADD COLUMN IF NOT EXISTS residence_address TEXT,
  ADD COLUMN IF NOT EXISTS residence_pin_code TEXT,
  ADD COLUMN IF NOT EXISTS applicant_photo_url TEXT;

-- Backfill new compatibility columns from existing data where possible
UPDATE firms
SET
  ifms_number = COALESCE(ifms_number, registration_number),
  seed_cotton_license_number = COALESCE(seed_cotton_license_number, license_number),
  partner_proprietor_name = COALESCE(partner_proprietor_name, ''),
  residence_address = COALESCE(residence_address, '')
WHERE TRUE;
