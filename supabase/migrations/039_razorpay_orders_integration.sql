  -- ============================================================
  -- MIGRATION 039: RAZORPAY ORDERS INTEGRATION
  -- ============================================================
  -- Adds tables and functions for Razorpay order creation flow
  -- Includes: orders, order_items, payment signatures verification
  -- ============================================================

  -- ============================================================
  -- SECTION 1: ADD ORDERS TABLE
  -- ============================================================

  CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    razorpay_order_id TEXT UNIQUE,
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT DEFAULT 'INR',
    receipt TEXT,
    status TEXT DEFAULT 'created', -- created, attempted, paid, failed, expired
    notes JSONB DEFAULT '{}'::jsonb,

    -- Razorpay response
    attempts INTEGER DEFAULT 0,
    amount_paid NUMERIC(10, 2) DEFAULT 0,
    amount_due NUMERIC(10, 2),
    offer_id TEXT,
    provider_payload JSONB,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );

  -- ============================================================
  -- SECTION 2: ADD ORDER ITEMS TABLE
  -- ============================================================

  CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL, -- 'membership_fee', 'tax', 'discount', etc.
    amount NUMERIC(10, 2) NOT NULL,
    quantity INTEGER DEFAULT 1,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );

  -- ============================================================
  -- SECTION 3: ADD SIGNATURE VERIFICATION TABLE
  -- ============================================================

  CREATE TABLE IF NOT EXISTS public.payment_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES public.payments(id) ON DELETE CASCADE,
    razorpay_signature TEXT NOT NULL,
    razorpay_order_id TEXT NOT NULL,
    razorpay_payment_id TEXT NOT NULL,
    is_verified BOOLEAN DEFAULT false,
    verification_error TEXT,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
  );

  -- ============================================================
  -- SECTION 4: UPDATE PAYMENTS TABLE WITH ORDER REFERENCE
  -- ============================================================

  ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT REFERENCES public.orders(razorpay_order_id);

  -- ============================================================
  -- SECTION 5: CREATE INDEXES FOR PERFORMANCE
  -- ============================================================

  CREATE INDEX IF NOT EXISTS idx_orders_member_id ON public.orders(member_id);
  CREATE INDEX IF NOT EXISTS idx_orders_razorpay_order_id ON public.orders(razorpay_order_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
  CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_payment_signatures_razorpay_order_id ON public.payment_signatures(razorpay_order_id);
  CREATE INDEX IF NOT EXISTS idx_payment_signatures_payment_id ON public.payment_signatures(payment_id);

  -- Partial unique index: only one active (created/attempted) order per member
  CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_member_active ON public.orders(member_id, status)
  WHERE status IN ('created', 'attempted');

  -- ============================================================
  -- SECTION 6: ENABLE RLS ON NEW TABLES
  -- ============================================================

  ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.payment_signatures ENABLE ROW LEVEL SECURITY;

  -- ============================================================
  -- SECTION 7: RLS POLICIES FOR ORDERS
  -- ============================================================

  -- Users can view their own orders
  DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
  CREATE POLICY "Users can view their own orders"
  ON public.orders FOR SELECT
  USING (member_id IN (
    SELECT id FROM public.accounts WHERE user_id = auth.uid()
  ));

  -- Service role can insert orders
  DROP POLICY IF EXISTS "Service role can insert orders" ON public.orders;
  CREATE POLICY "Service role can insert orders"
  ON public.orders FOR INSERT
  WITH CHECK (true);

  -- Service role can update orders
  DROP POLICY IF EXISTS "Service role can update orders" ON public.orders;
  CREATE POLICY "Service role can update orders"
  ON public.orders FOR UPDATE
  USING (true);

  -- ============================================================
  -- SECTION 8: RLS POLICIES FOR ORDER ITEMS
  -- ============================================================

  -- Users can view items for their orders
  DROP POLICY IF EXISTS "Users can view their order items" ON public.order_items;
  CREATE POLICY "Users can view their order items"
  ON public.order_items FOR SELECT
  USING (order_id IN (
    SELECT id FROM public.orders WHERE member_id IN (
      SELECT id FROM public.accounts WHERE user_id = auth.uid()
    )
  ));

  -- Service role can insert items
  DROP POLICY IF EXISTS "Service role can insert order items" ON public.order_items;
  CREATE POLICY "Service role can insert order items"
  ON public.order_items FOR INSERT
  WITH CHECK (true);

  -- ============================================================
  -- SECTION 9: RLS POLICIES FOR PAYMENT SIGNATURES
  -- ============================================================

  -- Users can view signatures for their payments
  DROP POLICY IF EXISTS "Users can view their payment signatures" ON public.payment_signatures;
  CREATE POLICY "Users can view their payment signatures"
  ON public.payment_signatures FOR SELECT
  USING (payment_id IN (
    SELECT id FROM public.payments WHERE member_id IN (
      SELECT id FROM public.accounts WHERE user_id = auth.uid()
    )
  ));

  -- Service role can insert signatures
  DROP POLICY IF EXISTS "Service role can insert payment signatures" ON public.payment_signatures;
  CREATE POLICY "Service role can insert payment signatures"
  ON public.payment_signatures FOR INSERT
  WITH CHECK (true);

  -- Service role can update signatures
  DROP POLICY IF EXISTS "Service role can update payment signatures" ON public.payment_signatures;
  CREATE POLICY "Service role can update payment signatures"
  ON public.payment_signatures FOR UPDATE
  USING (true);

  -- ============================================================
  -- SECTION 10: UPDATE TIMESTAMP TRIGGER FOR ORDERS
  -- ============================================================

  DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
  CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
