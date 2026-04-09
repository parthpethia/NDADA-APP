-- ============================================================
-- Additional Fraud Prevention Triggers
-- ============================================================

-- Detect duplicate license numbers across firms (flags on insert)
CREATE OR REPLACE FUNCTION check_duplicate_license()
RETURNS TRIGGER AS $$
DECLARE
  lic_count INTEGER;
  reg_count INTEGER;
BEGIN
  -- Check license number reuse across different members
  SELECT COUNT(*) INTO lic_count
  FROM firms f
  JOIN members m ON f.member_id = m.id
  WHERE f.license_number = NEW.license_number
    AND f.member_id != NEW.member_id;

  IF lic_count > 0 THEN
    INSERT INTO fraud_flags (member_id, reason, details)
    VALUES (NEW.member_id, 'duplicate_license',
      'License number ' || NEW.license_number || ' is used by another member''s firm');
  END IF;

  -- Check registration number reuse across different members
  SELECT COUNT(*) INTO reg_count
  FROM firms f
  JOIN members m ON f.member_id = m.id
  WHERE f.registration_number = NEW.registration_number
    AND f.member_id != NEW.member_id;

  IF reg_count > 0 THEN
    INSERT INTO fraud_flags (member_id, reason, details)
    VALUES (NEW.member_id, 'duplicate_registration',
      'Registration number ' || NEW.registration_number || ' is used by another member''s firm');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_check_duplicate_license
  AFTER INSERT ON firms
  FOR EACH ROW
  EXECUTE FUNCTION check_duplicate_license();

-- Track repeated failed payments
CREATE OR REPLACE FUNCTION check_failed_payments()
RETURNS TRIGGER AS $$
DECLARE
  fail_count INTEGER;
BEGIN
  IF NEW.status = 'failed' THEN
    SELECT COUNT(*) INTO fail_count
    FROM payments
    WHERE member_id = NEW.member_id AND status = 'failed';

    IF fail_count >= 3 THEN
      INSERT INTO fraud_flags (member_id, reason, details)
      VALUES (NEW.member_id, 'repeated_failed_payments',
        fail_count || ' failed payment attempts detected');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_check_failed_payments
  AFTER INSERT OR UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION check_failed_payments();

-- ============================================================
-- Storage Bucket Setup (run manually in Supabase SQL Editor)
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('certificates', 'certificates', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('id-proofs', 'id-proofs', false) ON CONFLICT DO NOTHING;

-- Storage Policies: documents bucket
CREATE POLICY "Members upload own documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = (
    SELECT id::text FROM members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Members read own documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = (
    SELECT id::text FROM members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins read all documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents' AND EXISTS (
    SELECT 1 FROM admin_users WHERE user_id = auth.uid()
  ));

-- Storage Policies: certificates bucket
CREATE POLICY "Members read own certificate"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'certificates' AND (storage.foldername(name))[1] = (
    SELECT id::text FROM members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Service role writes certificates"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'certificates');

CREATE POLICY "Admins read all certificates"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'certificates' AND EXISTS (
    SELECT 1 FROM admin_users WHERE user_id = auth.uid()
  ));

-- Storage Policies: id-proofs bucket
CREATE POLICY "Members upload own id proof"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'id-proofs' AND (storage.foldername(name))[1] = (
    SELECT id::text FROM members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins read all id proofs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'id-proofs' AND EXISTS (
    SELECT 1 FROM admin_users WHERE user_id = auth.uid()
  ));
