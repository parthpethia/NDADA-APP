-- ============================================================
-- NDADA Membership Platform - Consolidated Schema (Migrations 001-028)
-- This file contains the final database state after all migrations
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE IF NOT EXISTS firm_type AS ENUM ('proprietorship', 'partnership', 'private_limited', 'llp', 'other');
CREATE TYPE IF NOT EXISTS payment_status AS ENUM ('pending', 'paid', 'failed');
CREATE TYPE IF NOT EXISTS approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE IF NOT EXISTS account_status AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE IF NOT EXISTS certificate_status AS ENUM ('valid', 'revoked', 'suspended');
CREATE TYPE IF NOT EXISTS admin_role AS ENUM ('super_admin', 'admin', 'reviewer');

-- ============================================================
-- SEQUENCES
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS membership_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS certificate_id_seq START 1;

-- ============================================================
-- FUNCTIONS (with search_path security)
-- ============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public;

-- Generate membership ID
CREATE OR REPLACE FUNCTION generate_membership_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.membership_id := 'MEM-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('membership_id_seq')::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public;

-- Generate certificate ID
CREATE OR REPLACE FUNCTION generate_certificate_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.certificate_id := 'CERT-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('certificate_id_seq')::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public;

-- Check for duplicate phone numbers
CREATE OR REPLACE FUNCTION check_duplicate_phone()
RETURNS TRIGGER AS $$
DECLARE
  phone_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO phone_count FROM public.members WHERE phone = NEW.phone AND id != NEW.id;
  IF phone_count > 0 THEN
    INSERT INTO public.fraud_flags (member_id, reason, details)
    VALUES (NEW.id, 'duplicate_phone', 'Phone number ' || NEW.phone || ' used by another account');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public;

-- Check for duplicate license and registration numbers
CREATE OR REPLACE FUNCTION check_duplicate_license()
RETURNS TRIGGER AS $$
DECLARE
  lic_count INTEGER;
  reg_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO lic_count
  FROM public.firms f
  JOIN public.members m ON f.member_id = m.id
  WHERE f.license_number = NEW.license_number
    AND f.member_id != NEW.member_id;

  IF lic_count > 0 THEN
    INSERT INTO public.fraud_flags (member_id, reason, details)
    VALUES (NEW.member_id, 'duplicate_license',
      'License number ' || NEW.license_number || ' is used by another member''s firm');
  END IF;

  SELECT COUNT(*) INTO reg_count
  FROM public.firms f
  JOIN public.members m ON f.member_id = m.id
  WHERE f.registration_number = NEW.registration_number
    AND f.member_id != NEW.member_id;

  IF reg_count > 0 THEN
    INSERT INTO public.fraud_flags (member_id, reason, details)
    VALUES (NEW.member_id, 'duplicate_registration',
      'Registration number ' || NEW.registration_number || ' is used by another member''s firm');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public;

-- Track repeated failed payments
CREATE OR REPLACE FUNCTION check_failed_payments()
RETURNS TRIGGER AS $$
DECLARE
  fail_count INTEGER;
BEGIN
  IF NEW.status = 'failed' THEN
    SELECT COUNT(*) INTO fail_count
    FROM public.payments
    WHERE member_id = NEW.member_id AND status = 'failed';

    IF fail_count >= 3 THEN
      INSERT INTO public.fraud_flags (member_id, reason, details)
      VALUES (NEW.member_id, 'repeated_failed_payments',
        fail_count || ' failed payment attempts detected');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public;

-- Auto-create member record when user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.members (
    user_id,
    full_name,
    email,
    phone,
    address
  ) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'address', '')
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public;

-- RLS helper: check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public;

-- RLS helper: check admin role
CREATE OR REPLACE FUNCTION has_admin_role(required_role admin_role)
RETURNS BOOLEAN AS $$
DECLARE
  user_role admin_role;
BEGIN
  SELECT role INTO user_role FROM public.admin_users WHERE user_id = auth.uid();
  IF user_role IS NULL THEN RETURN false; END IF;
  IF user_role = 'super_admin' THEN RETURN true; END IF;
  IF user_role = 'admin' AND required_role IN ('admin', 'reviewer') THEN RETURN true; END IF;
  IF user_role = required_role THEN RETURN true; END IF;
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public;

-- ============================================================
-- MEMBERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  id_proof_url TEXT,
  payment_status payment_status NOT NULL DEFAULT 'pending',
  membership_id TEXT NOT NULL UNIQUE,
  account_status account_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_members_user_id ON public.members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_phone ON public.members(phone);

CREATE TRIGGER IF NOT EXISTS trg_generate_membership_id
  BEFORE INSERT ON public.members
  FOR EACH ROW
  WHEN (NEW.membership_id IS NULL OR NEW.membership_id = '')
  EXECUTE FUNCTION generate_membership_id();

CREATE TRIGGER IF NOT EXISTS trg_members_updated_at
  BEFORE UPDATE ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- FIRMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.firms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  firm_name TEXT NOT NULL,
  firm_type firm_type NOT NULL DEFAULT 'other',
  license_number TEXT NOT NULL UNIQUE,
  registration_number TEXT NOT NULL UNIQUE,
  gst_number TEXT,
  firm_address TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  documents_urls TEXT[] DEFAULT '{}',
  approval_status approval_status NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NDADA membership form fields
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
  applicant_photo_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_firms_member_id ON public.firms(member_id);
CREATE INDEX IF NOT EXISTS idx_firms_reviewed_by ON public.firms(reviewed_by);

CREATE TRIGGER IF NOT EXISTS trg_firms_updated_at
  BEFORE UPDATE ON public.firms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER IF NOT EXISTS trg_check_duplicate_license
  AFTER INSERT ON public.firms
  FOR EACH ROW
  EXECUTE FUNCTION check_duplicate_license();

-- ============================================================
-- PAYMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL DEFAULT 30000,
  currency TEXT NOT NULL DEFAULT 'inr',
  status payment_status NOT NULL DEFAULT 'pending',
  proof_url TEXT,
  provider TEXT,
  razorpay_payment_link_id TEXT,
  razorpay_payment_link_url TEXT,
  razorpay_payment_id TEXT,
  provider_event TEXT,
  provider_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_razorpay_payment_link_id
  ON public.payments (razorpay_payment_link_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider
  ON public.payments (provider);

CREATE TRIGGER IF NOT EXISTS trg_check_failed_payments
  AFTER INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION check_failed_payments();

-- ============================================================
-- CERTIFICATES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id TEXT NOT NULL UNIQUE,
  member_id UUID NOT NULL UNIQUE REFERENCES public.members(id) ON DELETE CASCADE,
  certificate_url TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status certificate_status NOT NULL DEFAULT 'valid'
);

CREATE INDEX IF NOT EXISTS idx_certificates_member_id ON public.certificates(member_id);

CREATE TRIGGER IF NOT EXISTS trg_generate_certificate_id
  BEFORE INSERT ON public.certificates
  FOR EACH ROW
  WHEN (NEW.certificate_id IS NULL OR NEW.certificate_id = '')
  EXECUTE FUNCTION generate_certificate_id();

-- ============================================================
-- ADMIN USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role admin_role NOT NULL DEFAULT 'reviewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON public.admin_users(user_id);

-- ============================================================
-- FRAUD FLAGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fraud_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_flags_member_id ON public.fraud_flags(member_id);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_resolved ON public.fraud_flags(resolved);

-- ============================================================
-- AUDIT LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_user UUID,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON public.audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ============================================================
-- CERTIFICATE DOWNLOADS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.certificate_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id UUID NOT NULL REFERENCES public.certificates(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_cert_downloads_member_id ON public.certificate_downloads(member_id);
CREATE INDEX IF NOT EXISTS idx_certificate_downloads_certificate_id ON public.certificate_downloads(certificate_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_downloads ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- MEMBERS POLICIES
-- ============================================================
DROP POLICY IF EXISTS "Users can view own member record" ON public.members;
CREATE POLICY "Users can view own member record"
  ON public.members FOR SELECT
  USING (user_id = (select auth.uid()) OR is_admin());

DROP POLICY IF EXISTS "Users can insert own member record" ON public.members;
CREATE POLICY "Users can insert own member record"
  ON public.members FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own member record" ON public.members;
CREATE POLICY "Users can update own member record"
  ON public.members FOR UPDATE
  USING (user_id = (select auth.uid()) OR is_admin());

-- ============================================================
-- FIRMS POLICIES
-- ============================================================
DROP POLICY IF EXISTS "Users can view own firms" ON public.firms;
CREATE POLICY "Users can view own firms"
  ON public.firms FOR SELECT
  USING (
    member_id IN (SELECT id FROM public.members WHERE user_id = (select auth.uid()))
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can insert own firms" ON public.firms;
CREATE POLICY "Users can insert own firms"
  ON public.firms FOR INSERT
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can update own firms" ON public.firms;
CREATE POLICY "Users can update own firms"
  ON public.firms FOR UPDATE
  USING (
    member_id IN (SELECT id FROM public.members WHERE user_id = (select auth.uid()))
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can delete own firms" ON public.firms;
CREATE POLICY "Users can delete own firms"
  ON public.firms FOR DELETE
  USING (
    member_id IN (SELECT id FROM public.members WHERE user_id = (select auth.uid()))
    OR is_admin()
  );

-- ============================================================
-- PAYMENTS POLICIES
-- ============================================================
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
CREATE POLICY "Users can view own payments"
  ON public.payments FOR SELECT
  USING (
    member_id IN (SELECT id FROM public.members WHERE user_id = (select auth.uid()))
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can insert own payments" ON public.payments;
CREATE POLICY "Users can insert own payments"
  ON public.payments FOR INSERT
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE user_id = (select auth.uid())));

-- ============================================================
-- CERTIFICATES POLICIES
-- ============================================================
DROP POLICY IF EXISTS "Users can view own certificate" ON public.certificates;
CREATE POLICY "Users can view own certificate"
  ON public.certificates FOR SELECT
  TO authenticated
  USING (
    member_id IN (SELECT id FROM public.members WHERE user_id = (select auth.uid()))
    OR is_admin()
  );

DROP POLICY IF EXISTS "Public can verify certificates" ON public.certificates;
CREATE POLICY "Public can verify certificates"
  ON public.certificates FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Admins can manage certificates" ON public.certificates;
CREATE POLICY "Admins can manage certificates"
  ON public.certificates FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================
-- ADMIN USERS POLICIES
-- ============================================================
DROP POLICY IF EXISTS "Admins can view admin users" ON public.admin_users;
CREATE POLICY "Admins can view admin users"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()) OR is_admin());

DROP POLICY IF EXISTS "Super admins can insert admin users" ON public.admin_users;
CREATE POLICY "Super admins can insert admin users"
  ON public.admin_users FOR INSERT
  TO authenticated
  WITH CHECK (has_admin_role('super_admin'));

DROP POLICY IF EXISTS "Super admins can update admin users" ON public.admin_users;
CREATE POLICY "Super admins can update admin users"
  ON public.admin_users FOR UPDATE
  TO authenticated
  USING (has_admin_role('super_admin'))
  WITH CHECK (has_admin_role('super_admin'));

DROP POLICY IF EXISTS "Super admins can delete admin users" ON public.admin_users;
CREATE POLICY "Super admins can delete admin users"
  ON public.admin_users FOR DELETE
  TO authenticated
  USING (has_admin_role('super_admin'));

-- ============================================================
-- FRAUD FLAGS POLICIES
-- ============================================================
DROP POLICY IF EXISTS "Admins can view fraud flags" ON public.fraud_flags;
CREATE POLICY "Admins can view fraud flags"
  ON public.fraud_flags FOR SELECT
  TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Admins can insert fraud flags" ON public.fraud_flags;
CREATE POLICY "Admins can insert fraud flags"
  ON public.fraud_flags FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can update fraud flags" ON public.fraud_flags;
CREATE POLICY "Admins can update fraud flags"
  ON public.fraud_flags FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can delete fraud flags" ON public.fraud_flags;
CREATE POLICY "Admins can delete fraud flags"
  ON public.fraud_flags FOR DELETE
  TO authenticated
  USING (is_admin());

-- ============================================================
-- AUDIT LOGS POLICIES
-- ============================================================
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.audit_logs;
CREATE POLICY "Admins can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (is_admin());

-- ============================================================
-- CERTIFICATE DOWNLOADS POLICIES
-- ============================================================
DROP POLICY IF EXISTS "Users can view own downloads" ON public.certificate_downloads;
CREATE POLICY "Users can view own downloads"
  ON public.certificate_downloads FOR SELECT
  USING (
    member_id IN (SELECT id FROM public.members WHERE user_id = (select auth.uid()))
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can insert own downloads" ON public.certificate_downloads;
CREATE POLICY "Users can insert own downloads"
  ON public.certificate_downloads FOR INSERT
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE user_id = (select auth.uid())));

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('certificates', 'certificates', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('id-proofs', 'id-proofs', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('payment-proofs', 'payment-proofs', false) ON CONFLICT DO NOTHING;

-- ============================================================
-- STORAGE POLICIES: documents bucket
-- ============================================================
DROP POLICY IF EXISTS "Members upload own documents" ON storage.objects;
CREATE POLICY "Members upload own documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members read own documents" ON storage.objects;
CREATE POLICY "Members read own documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins read all documents" ON storage.objects;
CREATE POLICY "Admins read all documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- ============================================================
-- STORAGE POLICIES: certificates bucket
-- ============================================================
DROP POLICY IF EXISTS "Members read own certificate" ON storage.objects;
CREATE POLICY "Members read own certificate"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'certificates'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role writes certificates" ON storage.objects;
CREATE POLICY "Service role writes certificates"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'certificates');

DROP POLICY IF EXISTS "Admins upload certificates" ON storage.objects;
CREATE POLICY "Admins upload certificates"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'certificates'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins update certificates" ON storage.objects;
CREATE POLICY "Admins update certificates"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'certificates'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins delete certificates" ON storage.objects;
CREATE POLICY "Admins delete certificates"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'certificates'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins read all certificates" ON storage.objects;
CREATE POLICY "Admins read all certificates"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'certificates'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- ============================================================
-- STORAGE POLICIES: id-proofs bucket
-- ============================================================
DROP POLICY IF EXISTS "Members upload own id proof" ON storage.objects;
CREATE POLICY "Members upload own id proof"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'id-proofs'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins read all id proofs" ON storage.objects;
CREATE POLICY "Admins read all id proofs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'id-proofs'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- ============================================================
-- STORAGE POLICIES: payment-proofs bucket
-- ============================================================
DROP POLICY IF EXISTS "Members upload own payment proofs" ON storage.objects;
CREATE POLICY "Members upload own payment proofs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members read own payment proofs" ON storage.objects;
CREATE POLICY "Members read own payment proofs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins read all payment proofs" ON storage.objects;
CREATE POLICY "Admins read all payment proofs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payment-proofs'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- ============================================================
-- AUTH TRIGGER
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
