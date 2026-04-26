  -- Migration 041: Add cash payment verification tracking
  -- Allows admins to verify and approve cash payments

  -- ============================================================
  -- ADD CASH PAYMENT VERIFICATION FIELDS TO ACCOUNTS
  -- ============================================================

  ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'online', -- 'online' or 'cash'
  ADD COLUMN IF NOT EXISTS cash_payment_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cash_payment_verified_by UUID REFERENCES public.accounts(id),
  ADD COLUMN IF NOT EXISTS cash_payment_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cash_payment_notes TEXT;

  -- ============================================================
  -- ADD CASH PAYMENT VERIFICATION TO PAYMENTS TABLE
  -- ============================================================

  ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'online', -- 'online' or 'cash'
  ADD COLUMN IF NOT EXISTS cash_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cash_verified_by UUID REFERENCES public.accounts(id),
  ADD COLUMN IF NOT EXISTS cash_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_notes TEXT;

  -- ============================================================
  -- CREATE INDEXES FOR PERFORMANCE
  -- ============================================================

  CREATE INDEX IF NOT EXISTS idx_accounts_payment_method ON public.accounts(payment_method);
  CREATE INDEX IF NOT EXISTS idx_accounts_cash_payment_verified ON public.accounts(cash_payment_verified);
  CREATE INDEX IF NOT EXISTS idx_payments_payment_method ON public.payments(payment_method);
  CREATE INDEX IF NOT EXISTS idx_payments_cash_verified ON public.payments(cash_verified);

  -- ============================================================
  -- CREATE CASH PAYMENT VERIFICATION HISTORY TABLE
  -- ============================================================

  CREATE TABLE IF NOT EXISTS public.cash_payment_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    verified_by UUID NOT NULL REFERENCES public.accounts(id),
    status TEXT NOT NULL, -- 'pending', 'approved', 'rejected'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );

  -- ============================================================
  -- ENABLE RLS ON CASH PAYMENT VERIFICATIONS TABLE
  -- ============================================================

  ALTER TABLE public.cash_payment_verifications ENABLE ROW LEVEL SECURITY;

  -- ============================================================
  -- RLS POLICIES FOR CASH PAYMENT VERIFICATIONS
  -- ============================================================

  -- Users can view their own cash payment verification records
  DROP POLICY IF EXISTS "Users can view their own cash payment verifications" ON public.cash_payment_verifications;
  CREATE POLICY "Users can view their own cash payment verifications"
  ON public.cash_payment_verifications FOR SELECT
  USING (member_id IN (
    SELECT id FROM public.accounts WHERE user_id = auth.uid()
  ));

  -- Admins can view all cash payment verification records
  DROP POLICY IF EXISTS "Admins can view all cash payment verifications" ON public.cash_payment_verifications;
  CREATE POLICY "Admins can view all cash payment verifications"
  ON public.cash_payment_verifications FOR SELECT
  USING (
    verified_by IN (
      SELECT id FROM public.accounts
      WHERE user_id IN (SELECT user_id FROM public.admin_users)
    )
    OR member_id IN (SELECT id FROM public.accounts WHERE user_id = auth.uid())
  );

  -- Service role can insert verifications
  DROP POLICY IF EXISTS "Service role can insert cash payment verifications" ON public.cash_payment_verifications;
  CREATE POLICY "Service role can insert cash payment verifications"
  ON public.cash_payment_verifications FOR INSERT
  WITH CHECK (true);

  -- Service role can update verifications
  DROP POLICY IF EXISTS "Service role can update cash payment verifications" ON public.cash_payment_verifications;
  CREATE POLICY "Service role can update cash payment verifications"
  ON public.cash_payment_verifications FOR UPDATE
  USING (true);

  -- ============================================================
  -- CREATE INDEX FOR CASH PAYMENT VERIFICATIONS
  -- ============================================================

  CREATE INDEX IF NOT EXISTS idx_cash_payment_verifications_member_id ON public.cash_payment_verifications(member_id);
  CREATE INDEX IF NOT EXISTS idx_cash_payment_verifications_verified_by ON public.cash_payment_verifications(verified_by);
  CREATE INDEX IF NOT EXISTS idx_cash_payment_verifications_status ON public.cash_payment_verifications(status);

  -- ============================================================
  -- UPDATE TRIGGER FOR CASH PAYMENT VERIFICATIONS
  -- ============================================================

  DROP TRIGGER IF EXISTS update_cash_payment_verifications_updated_at ON public.cash_payment_verifications;
  CREATE TRIGGER update_cash_payment_verifications_updated_at
  BEFORE UPDATE ON public.cash_payment_verifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
