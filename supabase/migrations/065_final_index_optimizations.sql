-- ============================================================
-- MIGRATION 065: Final Index Optimization & Cleanup
-- ============================================================
-- Based on the NDADA Final Index Audit Report.
-- ============================================================

-- A. ADD NEW TARGETED INDEXES
-- ------------------------------------------------------------

-- 1. Admin firms screen: filter by district
--    Optimizes: .eq('district', filterDistrict) in admin/firms.tsx
CREATE INDEX IF NOT EXISTS idx_accounts_district 
  ON public.accounts(district) 
  WHERE district IS NOT NULL;

-- 2. Admin certificates screen: ORDER BY issued_at DESC
--    Optimizes: .order('issued_at', { ascending: false }) in admin/certificates.tsx
CREATE INDEX IF NOT EXISTS idx_certificates_issued_at 
  ON public.certificates(issued_at DESC);

-- 3. Edge functions: update queue by account_id (not PK)
--    Optimizes: .eq('account_id', member.id) in generate-certificate and process-certificate-queue
CREATE INDEX IF NOT EXISTS idx_certificate_queue_account_id 
  ON public.certificate_generation_queue(account_id);


-- B. DROP REDUNDANT & UNUSED INDEXES (reduces write overhead)
-- ------------------------------------------------------------

-- 1. Redundant: covered by accounts.user_id UNIQUE constraint
DROP INDEX IF EXISTS public.idx_accounts_user_id;

-- 2. Redundant: covered by accounts.membership_id UNIQUE constraint  
DROP INDEX IF EXISTS public.idx_accounts_membership_id;

-- 3. Unused: no query uses GIN operators (?, @>, ?&) on status_timeline
DROP INDEX IF EXISTS public.idx_accounts_status_timeline;

-- 4. Redundant: covered by certificates.certificate_id UNIQUE constraint
DROP INDEX IF EXISTS public.idx_certificates_certificate_id;

-- 5. Redundant: covered by orders.razorpay_order_id UNIQUE constraint
DROP INDEX IF EXISTS public.idx_orders_razorpay_order_id;

-- 6. Redundant: covered by admin_users.user_id UNIQUE constraint
DROP INDEX IF EXISTS public.idx_admin_users_user_id;
