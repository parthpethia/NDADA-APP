-- ============================================================
-- CONSOLIDATED SCHEMA - One User One Firm (Migration 029)
-- This migration consolidates members and firms into a single accounts table
-- ============================================================

-- ============================================================
-- PHASE 1: Create the new consolidated accounts table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Personal/Member Info
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  id_proof_url TEXT,

  -- Firm Info
  firm_name TEXT NOT NULL,
  firm_type firm_type NOT NULL DEFAULT 'other',
  license_number TEXT NOT NULL UNIQUE,
  registration_number TEXT NOT NULL UNIQUE,
  gst_number TEXT,
  firm_address TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  firm_pin_code TEXT,
  partner_proprietor_name TEXT,
  whatsapp_number TEXT,
  aadhaar_card_number TEXT,
  ifms_number TEXT,
  seed_cotton_license_number TEXT,
  seed_cotton_license_expiry TEXT,
  sarthi_id_cotton TEXT,
  seed_general_license_number TEXT,
  seed_general_license_expiry TEXT,
  sarthi_id_general TEXT,
  pesticide_license_number TEXT,
  pesticide_license_expiry TEXT,
  fertilizer_license_number TEXT,
  fertilizer_license_expiry TEXT,
  residence_address TEXT,
  residence_pin_code TEXT,
  applicant_photo_url TEXT,
  documents_urls TEXT[] DEFAULT '{}',

  -- Status Fields
  membership_id TEXT NOT NULL UNIQUE,
  payment_status payment_status NOT NULL DEFAULT 'pending',
  approval_status approval_status NOT NULL DEFAULT 'pending',
  account_status account_status NOT NULL DEFAULT 'active',
  rejection_reason TEXT,

  -- Approval Tracking
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON public.accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_phone ON public.accounts(phone);
CREATE INDEX IF NOT EXISTS idx_accounts_license_number ON public.accounts(license_number);
CREATE INDEX IF NOT EXISTS idx_accounts_registration_number ON public.accounts(registration_number);
CREATE INDEX IF NOT EXISTS idx_accounts_membership_id ON public.accounts(membership_id);
CREATE INDEX IF NOT EXISTS idx_accounts_reviewed_by ON public.accounts(reviewed_by);

-- Triggers
CREATE TRIGGER IF NOT EXISTS trg_generate_membership_id_accounts
  BEFORE INSERT ON public.accounts
  FOR EACH ROW
  WHEN (NEW.membership_id IS NULL OR NEW.membership_id = '')
  EXECUTE FUNCTION generate_membership_id();

CREATE TRIGGER IF NOT EXISTS trg_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER IF NOT EXISTS trg_check_duplicate_license_accounts
  AFTER INSERT ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION check_duplicate_license_accounts();

-- ============================================================
-- PHASE 2: Update fraud_flags to reference accounts
-- ============================================================
ALTER TABLE public.fraud_flags DROP CONSTRAINT IF EXISTS fraud_flags_member_id_fkey;
ALTER TABLE public.fraud_flags ADD CONSTRAINT fraud_flags_account_id_fkey
  FOREIGN KEY (member_id) REFERENCES public.accounts(id) ON DELETE CASCADE;

-- ============================================================
-- PHASE 3: Update payments to reference accounts
-- ============================================================
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_member_id_fkey;
ALTER TABLE public.payments ADD CONSTRAINT payments_account_id_fkey
  FOREIGN KEY (member_id) REFERENCES public.accounts(id) ON DELETE CASCADE;

-- ============================================================
-- PHASE 4: Update certificates to reference accounts
-- ============================================================
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_member_id_fkey;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_account_id_fkey
  FOREIGN KEY (member_id) REFERENCES public.accounts(id) ON DELETE CASCADE;

-- ============================================================
-- PHASE 5: Update certificate_downloads to reference accounts
-- ============================================================
ALTER TABLE public.certificate_downloads DROP CONSTRAINT IF EXISTS certificate_downloads_member_id_fkey;
ALTER TABLE public.certificate_downloads ADD CONSTRAINT certificate_downloads_account_id_fkey
  FOREIGN KEY (member_id) REFERENCES public.accounts(id) ON DELETE CASCADE;

-- ============================================================
-- PHASE 6: Create updated trigger functions for accounts table
-- ============================================================
CREATE OR REPLACE FUNCTION check_duplicate_license_accounts()
RETURNS TRIGGER AS $$
DECLARE
  lic_count INTEGER;
  reg_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO lic_count
  FROM public.accounts
  WHERE license_number = NEW.license_number
    AND id != NEW.id;

  IF lic_count > 0 THEN
    INSERT INTO public.fraud_flags (member_id, reason, details)
    VALUES (NEW.id, 'duplicate_license',
      'License number ' || NEW.license_number || ' is used by another account');
  END IF;

  SELECT COUNT(*) INTO reg_count
  FROM public.accounts
  WHERE registration_number = NEW.registration_number
    AND id != NEW.id;

  IF reg_count > 0 THEN
    INSERT INTO public.fraud_flags (member_id, reason, details)
    VALUES (NEW.id, 'duplicate_registration',
      'Registration number ' || NEW.registration_number || ' is used by another account');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public;

-- Update handle_new_user to create account record instead of member
CREATE OR REPLACE FUNCTION handle_new_user_consolidated()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.accounts (
    user_id,
    full_name,
    email,
    phone,
    address,
    firm_name,
    firm_address,
    contact_phone,
    contact_email
  ) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'address', ''),
    COALESCE(NEW.raw_user_meta_data->>'firm_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'firm_address', ''),
    COALESCE(NEW.raw_user_meta_data->>'contact_phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'contact_email', '')
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user_consolidated failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public;

-- ============================================================
-- PHASE 7: Migrate data from members and firms to accounts
-- ============================================================
INSERT INTO public.accounts (
  user_id,
  full_name,
  email,
  phone,
  address,
  id_proof_url,
  firm_name,
  firm_type,
  license_number,
  registration_number,
  gst_number,
  firm_address,
  contact_phone,
  contact_email,
  firm_pin_code,
  partner_proprietor_name,
  whatsapp_number,
  aadhaar_card_number,
  ifms_number,
  seed_cotton_license_number,
  seed_cotton_license_expiry,
  sarthi_id_cotton,
  seed_general_license_number,
  seed_general_license_expiry,
  sarthi_id_general,
  pesticide_license_number,
  pesticide_license_expiry,
  fertilizer_license_number,
  fertilizer_license_expiry,
  residence_address,
  residence_pin_code,
  applicant_photo_url,
  documents_urls,
  membership_id,
  payment_status,
  approval_status,
  account_status,
  rejection_reason,
  reviewed_by,
  reviewed_at,
  created_at,
  updated_at
)
SELECT
  m.user_id,
  m.full_name,
  m.email,
  m.phone,
  m.address,
  m.id_proof_url,
  f.firm_name,
  f.firm_type,
  f.license_number,
  f.registration_number,
  f.gst_number,
  f.firm_address,
  f.contact_phone,
  f.contact_email,
  f.firm_pin_code,
  f.partner_proprietor_name,
  f.whatsapp_number,
  f.aadhaar_card_number,
  f.ifms_number,
  f.seed_cotton_license_number,
  f.seed_cotton_license_expiry,
  f.sarthi_id_cotton,
  f.seed_general_license_number,
  f.seed_general_license_expiry,
  f.sarthi_id_general,
  f.pesticide_license_number,
  f.pesticide_license_expiry,
  f.fertilizer_license_number,
  f.fertilizer_license_expiry,
  f.residence_address,
  f.residence_pin_code,
  f.applicant_photo_url,
  f.documents_urls,
  m.membership_id,
  m.payment_status,
  f.approval_status,
  m.account_status,
  f.rejection_reason,
  f.reviewed_by,
  f.reviewed_at,
  m.created_at,
  GREATEST(m.updated_at, f.updated_at)
FROM public.members m
LEFT JOIN public.firms f ON f.member_id = m.id
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- PHASE 8: Update RLS Policies for accounts table
-- ============================================================
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own account" ON public.accounts;
CREATE POLICY "Users can view own account"
  ON public.accounts FOR SELECT
  USING (user_id = (select auth.uid()) OR is_admin());

DROP POLICY IF EXISTS "Users can insert own account" ON public.accounts;
CREATE POLICY "Users can insert own account"
  ON public.accounts FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own account" ON public.accounts;
CREATE POLICY "Users can update own account"
  ON public.accounts FOR UPDATE
  USING (user_id = (select auth.uid()) OR is_admin());

-- ============================================================
-- PHASE 9: Update payment RLS policies to use accounts
-- ============================================================
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
CREATE POLICY "Users can view own payments"
  ON public.payments FOR SELECT
  USING (
    member_id IN (SELECT id FROM public.accounts WHERE user_id = (select auth.uid()))
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can insert own payments" ON public.payments;
CREATE POLICY "Users can insert own payments"
  ON public.payments FOR INSERT
  WITH CHECK (member_id IN (SELECT id FROM public.accounts WHERE user_id = (select auth.uid())));

-- ============================================================
-- PHASE 10: Update certificate RLS policies to use accounts
-- ============================================================
DROP POLICY IF EXISTS "Users can view own certificate" ON public.certificates;
CREATE POLICY "Users can view own certificate"
  ON public.certificates FOR SELECT
  TO authenticated
  USING (
    member_id IN (SELECT id FROM public.accounts WHERE user_id = (select auth.uid()))
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can insert own downloads" ON public.certificate_downloads;
CREATE POLICY "Users can insert own downloads"
  ON public.certificate_downloads FOR INSERT
  WITH CHECK (member_id IN (SELECT id FROM public.accounts WHERE user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can view own downloads" ON public.certificate_downloads;
CREATE POLICY "Users can view own downloads"
  ON public.certificate_downloads FOR SELECT
  USING (
    member_id IN (SELECT id FROM public.accounts WHERE user_id = (select auth.uid()))
    OR is_admin()
  );

-- ============================================================
-- PHASE 11: Update storage policies to use accounts
-- ============================================================
DROP POLICY IF EXISTS "Members upload own documents" ON storage.objects;
CREATE POLICY "Members upload own documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.accounts WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members read own documents" ON storage.objects;
CREATE POLICY "Members read own documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.accounts WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members upload own id proof" ON storage.objects;
CREATE POLICY "Members upload own id proof"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'id-proofs'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.accounts WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members read own certificate" ON storage.objects;
CREATE POLICY "Members read own certificate"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'certificates'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.accounts WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members upload own payment proofs" ON storage.objects;
CREATE POLICY "Members upload own payment proofs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.accounts WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members read own payment proofs" ON storage.objects;
CREATE POLICY "Members read own payment proofs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.accounts WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- PHASE 12: Drop old triggers and switch to new auth trigger
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_consolidated();

-- ============================================================
-- PHASE 13: Keep old tables for reference (will be archived)
-- ============================================================
-- Note: members and firms tables are kept intact for data reference
-- They should be dropped after verification of data integrity
