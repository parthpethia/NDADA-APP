-- ============================================================
-- MIGRATION 040: FIX MISSING RLS POLICIES & PERMISSIONS
-- ============================================================
-- Adds missing INSERT policies and GRANT permissions that were
-- overlooked in migration 038. Without these, drafts and
-- certificate download tracking fail silently due to RLS.
-- ============================================================

-- ============================================================
-- STEP 1: account_drafts — missing INSERT policy
-- The useAccountForm hook needs to INSERT new drafts.
-- Migration 038 only created SELECT and UPDATE policies.
-- ============================================================
DROP POLICY IF EXISTS "users_insert_own_drafts" ON public.account_drafts;
CREATE POLICY "users_insert_own_drafts"
  ON public.account_drafts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Also add DELETE policy so users can clear their own drafts
DROP POLICY IF EXISTS "users_delete_own_drafts" ON public.account_drafts;
CREATE POLICY "users_delete_own_drafts"
  ON public.account_drafts FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- STEP 2: certificate_downloads — missing INSERT policy & GRANT
-- certificate.tsx tracks downloads by inserting into this table.
-- ============================================================
ALTER TABLE public.certificate_downloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_insert_own_downloads" ON public.certificate_downloads;
CREATE POLICY "users_insert_own_downloads"
  ON public.certificate_downloads FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = member_id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users_view_own_downloads" ON public.certificate_downloads;
CREATE POLICY "users_view_own_downloads"
  ON public.certificate_downloads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = member_id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admins_view_all_downloads" ON public.certificate_downloads;
CREATE POLICY "admins_view_all_downloads"
  ON public.certificate_downloads FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

GRANT SELECT, INSERT ON public.certificate_downloads TO authenticated;

-- ============================================================
-- STEP 3: Ensure DELETE permission exists for account_drafts
-- (GRANT was given for SELECT, INSERT, UPDATE but not DELETE)
-- ============================================================
GRANT DELETE ON public.account_drafts TO authenticated;

-- ============================================================
-- MIGRATION 040 COMPLETE
-- ============================================================
