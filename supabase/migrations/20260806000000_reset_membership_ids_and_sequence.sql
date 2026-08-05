-- ============================================================
-- MIGRATION: Reset and Re-sequence Membership IDs
-- ============================================================
-- 1. Temporarily drop trigger to prevent side-effects during re-sequencing
-- 2. Set membership_id = NULL for ALL accounts to eliminate unique index conflicts during update
-- 3. Paid accounts (payment_status = 'paid') get sequential numbers: 0001, 0002, 0003...
-- 4. membership_id_seq counter is updated to max(paid_id) + 1
-- 5. Trigger fires BEFORE INSERT OR UPDATE so future paid accounts automatically get nextval + 1
-- ============================================================

-- Step 1: Temporarily drop trigger so it doesn't fire during bulk updates
DROP TRIGGER IF EXISTS trg_assign_membership_id_on_payment ON public.accounts;

-- Step 2: Clear membership_id for ALL accounts first to prevent unique constraint conflicts (e.g. idx_accounts_membership_id_unique)
UPDATE public.accounts
SET membership_id = NULL;

-- Step 3: Re-sequence membership_id for all paid accounts ordered by creation date
WITH paid_accounts AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS row_num
  FROM public.accounts
  WHERE payment_status = 'paid'
)
UPDATE public.accounts a
SET membership_id = LPAD(p.row_num::TEXT, 4, '0')
FROM paid_accounts p
WHERE a.id = p.id;

-- Step 4: Synchronize PostgreSQL sequence counter
DO $$
DECLARE
  v_max_val INTEGER;
BEGIN
  -- Create sequence if it doesn't exist
  CREATE SEQUENCE IF NOT EXISTS membership_id_seq START WITH 1 INCREMENT BY 1;
  
  -- Find max integer value from paid accounts
  SELECT COALESCE(MAX(membership_id::INTEGER), 0)
  INTO v_max_val
  FROM public.accounts
  WHERE membership_id IS NOT NULL AND membership_id ~ '^\d+$';

  IF v_max_val > 0 THEN
    PERFORM setval('membership_id_seq', v_max_val);
  ELSE
    PERFORM setval('membership_id_seq', 1, false);
  END IF;
END $$;

-- Step 5: Ensure trigger function assigns sequential ID on payment
CREATE OR REPLACE FUNCTION public.assign_membership_id_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  -- Assign membership_id whenever an account is paid and membership_id is null/empty
  IF NEW.payment_status = 'paid'
     AND (NEW.membership_id IS NULL OR NEW.membership_id = '') THEN
    NEW.membership_id := LPAD(nextval('membership_id_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path TO pg_catalog, public;

-- Step 6: Attach trigger BEFORE INSERT OR UPDATE on public.accounts
CREATE TRIGGER trg_assign_membership_id_on_payment
  BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_membership_id_on_payment();
