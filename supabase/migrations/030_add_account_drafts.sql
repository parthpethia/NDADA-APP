-- ============================================================
-- MIGRATION 030: Add Account Drafts Table for Form Persistence
-- ============================================================
-- This table stores in-progress form data for the firm registration form.
-- It enables auto-save functionality to prevent data loss when users refresh
-- or navigate away from the form mid-submission.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.account_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 0,
  form_data JSONB NOT NULL,
  saved_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient lookups by user_id
CREATE INDEX IF NOT EXISTS idx_account_drafts_user_id ON public.account_drafts(user_id);

-- Trigger to auto-update the updated_at timestamp
CREATE TRIGGER IF NOT EXISTS trg_account_drafts_updated_at
  BEFORE UPDATE ON public.account_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS Policies: Users can only see their own drafts
ALTER TABLE public.account_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own draft" ON public.account_drafts;
CREATE POLICY "Users can view own draft"
  ON public.account_drafts FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert own draft" ON public.account_drafts;
CREATE POLICY "Users can insert own draft"
  ON public.account_drafts FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own draft" ON public.account_drafts;
CREATE POLICY "Users can update own draft"
  ON public.account_drafts FOR UPDATE
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own draft" ON public.account_drafts;
CREATE POLICY "Users can delete own draft"
  ON public.account_drafts FOR DELETE
  USING (user_id = (select auth.uid()));
