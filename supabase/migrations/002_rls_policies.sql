-- ============================================================
-- Row Level Security Policies
-- ============================================================

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificate_downloads ENABLE ROW LEVEL SECURITY;

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: check admin role
CREATE OR REPLACE FUNCTION has_admin_role(required_role admin_role)
RETURNS BOOLEAN AS $$
DECLARE
  user_role admin_role;
BEGIN
  SELECT role INTO user_role FROM admin_users WHERE user_id = auth.uid();
  IF user_role IS NULL THEN RETURN false; END IF;
  IF user_role = 'super_admin' THEN RETURN true; END IF;
  IF user_role = 'admin' AND required_role IN ('admin', 'reviewer') THEN RETURN true; END IF;
  IF user_role = required_role THEN RETURN true; END IF;
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Members Policies
-- ============================================================
CREATE POLICY "Users can view own member record"
  ON members FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "Users can insert own member record"
  ON members FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own member record"
  ON members FOR UPDATE
  USING (user_id = auth.uid() OR is_admin());

-- ============================================================
-- Firms Policies
-- ============================================================
CREATE POLICY "Users can view own firms"
  ON firms FOR SELECT
  USING (member_id IN (SELECT id FROM members WHERE user_id = auth.uid()) OR is_admin());

CREATE POLICY "Users can insert own firms"
  ON firms FOR INSERT
  WITH CHECK (member_id IN (SELECT id FROM members WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own firms"
  ON firms FOR UPDATE
  USING (member_id IN (SELECT id FROM members WHERE user_id = auth.uid()) OR is_admin());

CREATE POLICY "Users can delete own firms"
  ON firms FOR DELETE
  USING (member_id IN (SELECT id FROM members WHERE user_id = auth.uid()) OR is_admin());

-- ============================================================
-- Payments Policies
-- ============================================================
CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  USING (member_id IN (SELECT id FROM members WHERE user_id = auth.uid()) OR is_admin());

CREATE POLICY "Users can insert own payments"
  ON payments FOR INSERT
  WITH CHECK (member_id IN (SELECT id FROM members WHERE user_id = auth.uid()));

-- ============================================================
-- Certificates Policies
-- ============================================================
CREATE POLICY "Users can view own certificate"
  ON certificates FOR SELECT
  USING (member_id IN (SELECT id FROM members WHERE user_id = auth.uid()) OR is_admin());

-- Public verification: allow reading certificate by certificate_id
CREATE POLICY "Public can verify certificates"
  ON certificates FOR SELECT
  USING (true);

-- ============================================================
-- Admin Users Policies
-- ============================================================
CREATE POLICY "Admins can view admin users"
  ON admin_users FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "Super admins can manage admin users"
  ON admin_users FOR ALL
  USING (has_admin_role('super_admin'));

-- ============================================================
-- Fraud Flags Policies
-- ============================================================
CREATE POLICY "Admins can view fraud flags"
  ON fraud_flags FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can manage fraud flags"
  ON fraud_flags FOR ALL
  USING (is_admin());

-- ============================================================
-- Audit Logs Policies
-- ============================================================
CREATE POLICY "Admins can view audit logs"
  ON audit_logs FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (is_admin());

-- ============================================================
-- Certificate Downloads Policies
-- ============================================================
CREATE POLICY "Users can view own downloads"
  ON certificate_downloads FOR SELECT
  USING (member_id IN (SELECT id FROM members WHERE user_id = auth.uid()) OR is_admin());

CREATE POLICY "Users can insert own downloads"
  ON certificate_downloads FOR INSERT
  WITH CHECK (member_id IN (SELECT id FROM members WHERE user_id = auth.uid()));

-- ============================================================
-- Storage Policies (apply via Supabase Dashboard)
-- ============================================================
-- documents bucket: members can upload to own folder, admins can read all
-- certificates bucket: members can read own cert, admins can read/write all
-- id-proofs bucket: members can upload own, admins can read all
