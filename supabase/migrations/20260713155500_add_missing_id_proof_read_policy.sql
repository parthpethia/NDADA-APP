-- Migration: Add missing SELECT policy for members on id-proofs storage bucket
-- Created at: 2026-07-13 15:55:00
-- Version: 20260713155500

DROP POLICY IF EXISTS "Members read own id proof" ON storage.objects;
CREATE POLICY "Members read own id proof"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'id-proofs'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM public.accounts WHERE user_id = auth.uid()
    )
  );
