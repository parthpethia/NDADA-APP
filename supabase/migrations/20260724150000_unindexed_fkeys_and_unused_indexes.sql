-- ============================================================
-- MIGRATION: Fix unindexed_foreign_keys + drop truly safe unused indexes
-- ============================================================
-- SECTION A: Add missing indexes on foreign key columns.
--   Without these, DELETE CASCADE on parent tables causes sequential scans
--   on child tables, which degrades performance at scale.
--
-- SECTION B: Drop unused indexes ONLY on legacy tables (members, firms)
--   that were consolidated into accounts and are no longer queried by the app.
--
-- NOTE ON UNUSED INDEXES WE ARE INTENTIONALLY KEEPING:
--   The Supabase linter flags indexes as "unused" based on pg_stat_user_indexes
--   which resets on stats reset and does NOT track:
--     1) FK CASCADE scans (idx_order_items_order_id, idx_payment_signatures_*)
--     2) Index usage inside SECURITY DEFINER functions (idx_accounts_trgm_search)
--     3) Index usage inside RLS subqueries (idx_admin_users_user_id, idx_admin_users_role)
--     4) Indexes that protect against future scale (idx_accounts_phone, etc.)
--   Dropping these would cause silent performance degradation. Keeping them
--   costs only trivial storage but protects query performance.
-- ============================================================

BEGIN;

-- ============================================================
-- SECTION A: ADD MISSING FOREIGN KEY INDEXES
-- ============================================================

-- 1. accounts.cash_payment_verified_by → accounts(id)
--    Used when admin verifies cash payments; speeds up JOIN and CASCADE.
CREATE INDEX IF NOT EXISTS idx_accounts_cash_payment_verified_by
  ON public.accounts(cash_payment_verified_by)
  WHERE cash_payment_verified_by IS NOT NULL;

-- 2. admin_notes.admin_id → admin_users(id)
--    Already has a partial index on member_id, but admin_id FK is unindexed.
CREATE INDEX IF NOT EXISTS idx_admin_notes_admin_id
  ON public.admin_notes(admin_id);

-- 3. admin_notes.deleted_by → admin_users(id)
--    Sparse column (only set on soft-delete), use partial index.
CREATE INDEX IF NOT EXISTS idx_admin_notes_deleted_by
  ON public.admin_notes(deleted_by)
  WHERE deleted_by IS NOT NULL;

-- 4. admin_saved_filters.admin_id → admin_users(id)
--    Used in RLS policy and filter lookups.
CREATE INDEX IF NOT EXISTS idx_admin_saved_filters_admin_id
  ON public.admin_saved_filters(admin_id);

-- 5. announcements.created_by → admin_users(id)
--    Sparse; most queries don't filter by creator but FK needs it for CASCADE.
CREATE INDEX IF NOT EXISTS idx_announcements_created_by
  ON public.announcements(created_by)
  WHERE created_by IS NOT NULL;

-- 6. error_logs.resolved_by → auth.users(id)
--    Sparse column (only set when resolved).
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved_by
  ON public.error_logs(resolved_by)
  WHERE resolved_by IS NOT NULL;

-- 7. payments.cash_verified_by → accounts(id)
--    Speeds up CASCADE when account is deleted.
CREATE INDEX IF NOT EXISTS idx_payments_cash_verified_by
  ON public.payments(cash_verified_by)
  WHERE cash_verified_by IS NOT NULL;

-- 8. payments.razorpay_order_id → orders(razorpay_order_id)
--    FK join column for payment-to-order lookups.
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order_id
  ON public.payments(razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

-- 9. review_assignments.assigned_by → admin_users(id)
--    Sparse; audit trail for who assigned the review.
CREATE INDEX IF NOT EXISTS idx_review_assignments_assigned_by
  ON public.review_assignments(assigned_by)
  WHERE assigned_by IS NOT NULL;

-- 10. role_permissions.permission_name → admin_permissions(name)
--     Small table but FK needs this for CASCADE DELETE.
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_name
  ON public.role_permissions(permission_name);

-- 11. security_events.user_id → auth.users(id)
--     Speeds up security event lookups per user and CASCADE.
CREATE INDEX IF NOT EXISTS idx_security_events_user_id
  ON public.security_events(user_id)
  WHERE user_id IS NOT NULL;


-- ============================================================
-- SECTION B: DROP UNUSED INDEXES ON LEGACY TABLES
-- ============================================================
-- The members and firms tables were consolidated into accounts in migration 029.
-- No app code queries these tables anymore. These indexes are pure dead weight.

DROP INDEX IF EXISTS public.idx_members_user_id;
DROP INDEX IF EXISTS public.idx_members_phone;
DROP INDEX IF EXISTS public.idx_firms_member_id;
DROP INDEX IF EXISTS public.idx_firms_reviewed_by;

COMMIT;
