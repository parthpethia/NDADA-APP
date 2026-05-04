-- Fix overly permissive "Service role" policies that lacked the "TO service_role" clause
-- By default, policies without a "TO" clause apply to PUBLIC (everyone).
-- When combined with WITH CHECK (true) or USING (true), this bypasses RLS entirely.
-- We drop these flawed policies and recreate them correctly scoped to service_role.

-- 1. public.orders
DROP POLICY IF EXISTS "Service role can insert orders" ON public.orders;
CREATE POLICY "Service role can insert orders"
ON public.orders FOR INSERT TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update orders" ON public.orders;
CREATE POLICY "Service role can update orders"
ON public.orders FOR UPDATE TO service_role
USING (true);

-- 2. public.order_items
DROP POLICY IF EXISTS "Service role can insert order items" ON public.order_items;
CREATE POLICY "Service role can insert order items"
ON public.order_items FOR INSERT TO service_role
WITH CHECK (true);

-- 3. public.payment_signatures
DROP POLICY IF EXISTS "Service role can insert payment signatures" ON public.payment_signatures;
CREATE POLICY "Service role can insert payment signatures"
ON public.payment_signatures FOR INSERT TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update payment signatures" ON public.payment_signatures;
CREATE POLICY "Service role can update payment signatures"
ON public.payment_signatures FOR UPDATE TO service_role
USING (true);

-- 4. public.cash_payment_verifications
DROP POLICY IF EXISTS "Service role can insert cash payment verifications" ON public.cash_payment_verifications;
CREATE POLICY "Service role can insert cash payment verifications"
ON public.cash_payment_verifications FOR INSERT TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update cash payment verifications" ON public.cash_payment_verifications;
CREATE POLICY "Service role can update cash payment verifications"
ON public.cash_payment_verifications FOR UPDATE TO service_role
USING (true);
