-- ============================================================
-- NDADA Membership Platform - Database Schema
-- ============================================================

-- Enums
CREATE TYPE firm_type AS ENUM ('proprietorship', 'partnership', 'private_limited', 'llp', 'other');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE account_status AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE certificate_status AS ENUM ('valid', 'revoked', 'suspended');
CREATE TYPE admin_role AS ENUM ('super_admin', 'admin', 'reviewer');

-- Sequences for auto-generated IDs
CREATE SEQUENCE membership_id_seq START 1;
CREATE SEQUENCE certificate_id_seq START 1;

-- ============================================================
-- Members Table
-- ============================================================
CREATE TABLE members (
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

CREATE INDEX idx_members_user_id ON members(user_id);
CREATE INDEX idx_members_email ON members(email);
CREATE INDEX idx_members_phone ON members(phone);
CREATE INDEX idx_members_membership_id ON members(membership_id);

-- Function to auto-generate membership_id
CREATE OR REPLACE FUNCTION generate_membership_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.membership_id := 'MEM-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('membership_id_seq')::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_membership_id
  BEFORE INSERT ON members
  FOR EACH ROW
  WHEN (NEW.membership_id IS NULL OR NEW.membership_id = '')
  EXECUTE FUNCTION generate_membership_id();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_members_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Firms Table
-- ============================================================
CREATE TABLE firms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_firms_member_id ON firms(member_id);
CREATE INDEX idx_firms_license_number ON firms(license_number);
CREATE INDEX idx_firms_registration_number ON firms(registration_number);
CREATE INDEX idx_firms_approval_status ON firms(approval_status);

CREATE TRIGGER trg_firms_updated_at
  BEFORE UPDATE ON firms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Payments Table
-- ============================================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL DEFAULT 30000, -- in paise (₹300)
  currency TEXT NOT NULL DEFAULT 'inr',
  status payment_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_member_id ON payments(member_id);

-- ============================================================
-- Certificates Table
-- ============================================================
CREATE TABLE certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id TEXT NOT NULL UNIQUE,
  member_id UUID NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
  certificate_url TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status certificate_status NOT NULL DEFAULT 'valid'
);

CREATE INDEX idx_certificates_certificate_id ON certificates(certificate_id);
CREATE INDEX idx_certificates_member_id ON certificates(member_id);

-- Function to auto-generate certificate_id
CREATE OR REPLACE FUNCTION generate_certificate_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.certificate_id := 'CERT-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('certificate_id_seq')::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_certificate_id
  BEFORE INSERT ON certificates
  FOR EACH ROW
  WHEN (NEW.certificate_id IS NULL OR NEW.certificate_id = '')
  EXECUTE FUNCTION generate_certificate_id();

-- ============================================================
-- Admin Users Table
-- ============================================================
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role admin_role NOT NULL DEFAULT 'reviewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_users_user_id ON admin_users(user_id);

-- ============================================================
-- Fraud Flags Table
-- ============================================================
CREATE TABLE fraud_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fraud_flags_member_id ON fraud_flags(member_id);
CREATE INDEX idx_fraud_flags_resolved ON fraud_flags(resolved);

-- ============================================================
-- Audit Logs Table
-- ============================================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_user UUID,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================================
-- Certificate Downloads Table
-- ============================================================
CREATE TABLE certificate_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id UUID NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT
);

CREATE INDEX idx_cert_downloads_member_id ON certificate_downloads(member_id);

-- ============================================================
-- Fraud Detection Trigger: duplicate phone
-- ============================================================
CREATE OR REPLACE FUNCTION check_duplicate_phone()
RETURNS TRIGGER AS $$
DECLARE
  phone_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO phone_count FROM members WHERE phone = NEW.phone AND id != NEW.id;
  IF phone_count > 0 THEN
    INSERT INTO fraud_flags (member_id, reason, details)
    VALUES (NEW.id, 'duplicate_phone', 'Phone number ' || NEW.phone || ' used by another account');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_check_duplicate_phone
  AFTER INSERT ON members
  FOR EACH ROW
  EXECUTE FUNCTION check_duplicate_phone();

-- ============================================================
-- Storage Buckets (run in Supabase Dashboard or via API)
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('certificates', 'certificates', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('id-proofs', 'id-proofs', false);
