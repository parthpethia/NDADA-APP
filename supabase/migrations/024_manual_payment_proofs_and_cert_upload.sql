-- ============================================================
-- Manual payment proof uploads + manual certificate upload
-- ============================================================

-- Add proof URL to payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_url TEXT;

-- Storage bucket for payment proofs
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT DO NOTHING;

-- Storage policies: payment-proofs bucket
DO $$
BEGIN
  -- Members upload own proofs (folder = member.id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Members upload own payment proofs'
  ) THEN
    CREATE POLICY "Members upload own payment proofs"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'payment-proofs'
        AND (storage.foldername(name))[1] = (
          SELECT id::text FROM members WHERE user_id = auth.uid()
        )
      );
  END IF;

  -- Members read own proofs
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Members read own payment proofs'
  ) THEN
    CREATE POLICY "Members read own payment proofs"
      ON storage.objects FOR SELECT
      USING (
        bucket_id = 'payment-proofs'
        AND (storage.foldername(name))[1] = (
          SELECT id::text FROM members WHERE user_id = auth.uid()
        )
      );
  END IF;

  -- Admins read all proofs
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Admins read all payment proofs'
  ) THEN
    CREATE POLICY "Admins read all payment proofs"
      ON storage.objects FOR SELECT
      USING (
        bucket_id = 'payment-proofs'
        AND EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- Allow admins to upload/manage certificates in storage (manual certificate JPEG)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Admins upload certificates'
  ) THEN
    CREATE POLICY "Admins upload certificates"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'certificates'
        AND EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Admins update certificates'
  ) THEN
    CREATE POLICY "Admins update certificates"
      ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'certificates'
        AND EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Admins delete certificates'
  ) THEN
    CREATE POLICY "Admins delete certificates"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'certificates'
        AND EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- Certificates table: allow admins to insert/update/delete certificate rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'certificates'
      AND policyname = 'Admins can manage certificates'
  ) THEN
    CREATE POLICY "Admins can manage certificates"
      ON certificates FOR ALL
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END $$;
