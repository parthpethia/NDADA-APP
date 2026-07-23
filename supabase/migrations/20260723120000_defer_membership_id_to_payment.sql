-- ============================================================
-- MIGRATION: Defer membership_id assignment to payment confirmation
-- ============================================================
-- Problem: membership_id was auto-assigned at account creation via
--   a BEFORE INSERT trigger, wasting sequential IDs on users who
--   never pay. User A (signup #148, never pays) blocks the number
--   while User B (signup #149, pays immediately) gets a higher ID.
--
-- Solution: Assign membership_id only when payment_status transitions
--   to 'paid'. Until then, membership_id remains NULL.
-- ============================================================

-- ============================================================
-- STEP 1: Make membership_id nullable
-- ============================================================
-- Drop the existing UNIQUE constraint (it doesn't allow multiple NULLs in all PG versions < 15)
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_membership_id_key;

-- Drop old indexes on membership_id
DROP INDEX IF EXISTS public.idx_accounts_membership_id;

-- Allow NULL values
ALTER TABLE public.accounts ALTER COLUMN membership_id DROP NOT NULL;

-- Set default to NULL instead of triggering sequence
ALTER TABLE public.accounts ALTER COLUMN membership_id SET DEFAULT NULL;

-- Create a partial unique index: only enforce uniqueness where membership_id IS NOT NULL
-- This allows multiple NULLs (unpaid accounts) while preventing duplicate IDs for paid members
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_membership_id_unique
  ON public.accounts (membership_id)
  WHERE membership_id IS NOT NULL;

-- ============================================================
-- STEP 2: Drop the BEFORE INSERT trigger (no more auto-assign on signup)
-- ============================================================
DROP TRIGGER IF EXISTS trg_generate_membership_id_accounts ON public.accounts;
DROP TRIGGER IF EXISTS trg_generate_membership_id ON public.accounts;

-- ============================================================
-- STEP 3: Create new function to assign membership_id on payment
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_membership_id_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when payment_status changes TO 'paid' from something else
  -- and the account doesn't already have a membership_id
  IF NEW.payment_status = 'paid'
     AND (OLD.payment_status IS DISTINCT FROM 'paid')
     AND (NEW.membership_id IS NULL OR NEW.membership_id = '') THEN
    NEW.membership_id := LPAD(nextval('membership_id_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path TO pg_catalog, public;

-- ============================================================
-- STEP 4: Attach BEFORE UPDATE trigger on accounts
-- ============================================================
DROP TRIGGER IF EXISTS trg_assign_membership_id_on_payment ON public.accounts;
CREATE TRIGGER trg_assign_membership_id_on_payment
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_membership_id_on_payment();

-- ============================================================
-- STEP 5: Clear existing unpaid membership IDs
-- ============================================================
-- This closes the loophole for existing users who signed up but
-- never paid. They'll get a fresh sequential ID when they do pay.
UPDATE public.accounts
SET membership_id = NULL
WHERE payment_status != 'paid'
  AND membership_id IS NOT NULL;

-- ============================================================
-- STEP 6: Update global_admin_search RPC to handle NULL membership_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.global_admin_search(p_query TEXT)
RETURNS TABLE (
  id UUID,
  type TEXT,
  title TEXT,
  subtitle TEXT,
  status TEXT,
  search_rank INTEGER,
  deep_link TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  v_role admin_role;
  v_admin_id UUID;
BEGIN
  SELECT id, role INTO v_admin_id, v_role FROM public.admin_users WHERE user_id = auth.uid();
  
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Access Denied: Administrative privileges required';
  END IF;

  IF v_role = 'reviewer' THEN
    RETURN QUERY
    SELECT 
      a.id,
      'member'::TEXT as type,
      a.full_name as title,
      'ID: ' || COALESCE(a.membership_id, 'Pending') || ' | ' || a.email as subtitle,
      a.account_status::TEXT as status,
      CASE 
        WHEN a.membership_id = p_query THEN 100 
        WHEN a.email = p_query THEN 80         
        WHEN a.phone = p_query THEN 70         
        WHEN a.registration_number = p_query THEN 60 
        WHEN a.gst_number = p_query THEN 50    
        ELSE 10                                 
      END as search_rank,
      '/admin/members/' || a.id as deep_link
    FROM public.accounts a
    JOIN public.review_assignments ra ON ra.account_id = a.id
    WHERE ra.assigned_to = v_admin_id AND (
      (a.membership_id IS NOT NULL AND a.membership_id ILIKE '%' || p_query || '%')
      OR a.full_name ILIKE '%' || p_query || '%'
      OR a.email ILIKE '%' || p_query || '%'
      OR a.phone ILIKE '%' || p_query || '%'
      OR a.firm_name ILIKE '%' || p_query || '%'
      OR a.gst_number ILIKE '%' || p_query || '%'
      OR a.license_number ILIKE '%' || p_query || '%'
      OR a.registration_number ILIKE '%' || p_query || '%'
    )
    
    UNION ALL
    
    SELECT 
      c.id,
      'certificate'::TEXT as type,
      'Certificate: ' || c.certificate_id as title,
      'Member: ' || a.full_name as subtitle,
      c.status::TEXT as status,
      CASE 
        WHEN c.certificate_id = p_query THEN 90 
        ELSE 10
      END as search_rank,
      '/admin/members/' || a.id || '?tab=certificates' as deep_link
    FROM public.certificates c
    JOIN public.accounts a ON a.id = c.member_id
    JOIN public.review_assignments ra ON ra.account_id = a.id
    WHERE ra.assigned_to = v_admin_id AND c.certificate_id ILIKE '%' || p_query || '%';
  ELSE
    RETURN QUERY
    SELECT 
      a.id,
      'member'::TEXT as type,
      a.full_name as title,
      'ID: ' || COALESCE(a.membership_id, 'Pending') || ' | ' || a.email as subtitle,
      a.account_status::TEXT as status,
      CASE 
        WHEN a.membership_id = p_query THEN 100 
        WHEN a.email = p_query THEN 80         
        WHEN a.phone = p_query THEN 70         
        WHEN a.registration_number = p_query THEN 60 
        WHEN a.gst_number = p_query THEN 50    
        ELSE 10                                 
      END as search_rank,
      '/admin/members/' || a.id as deep_link
    FROM public.accounts a
    WHERE 
      (COALESCE(a.membership_id, '') || ' ' ||
       COALESCE(a.full_name, '') || ' ' ||
       COALESCE(a.email, '') || ' ' ||
       COALESCE(a.phone, '') || ' ' ||
       COALESCE(a.firm_name, '') || ' ' ||
       COALESCE(a.gst_number, '') || ' ' ||
       COALESCE(a.license_number, '') || ' ' ||
       COALESCE(a.registration_number, '')) ILIKE '%' || p_query || '%'
    
    UNION ALL
    
    SELECT 
      c.id,
      'certificate'::TEXT as type,
      'Certificate: ' || c.certificate_id as title,
      'Member: ' || a.full_name as subtitle,
      c.status::TEXT as status,
      CASE 
        WHEN c.certificate_id = p_query THEN 90 
        ELSE 10
      END as search_rank,
      '/admin/members/' || a.id || '?tab=certificates' as deep_link
    FROM public.certificates c
    JOIN public.accounts a ON a.id = c.member_id
    WHERE c.certificate_id ILIKE '%' || p_query || '%';
  END IF;
END;
$$;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
