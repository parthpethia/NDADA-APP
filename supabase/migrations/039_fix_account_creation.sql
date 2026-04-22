-- ============================================================
-- MIGRATION 039: FIX ACCOUNT AUTO-CREATION ON SIGNUP
-- ============================================================
-- Problem: After schema consolidation (038), several critical pieces
-- were missing that prevented account creation on user signup:
--   1. No membership_id_seq sequence
--   2. No generate_membership_id trigger on accounts
--   3. No handle_new_user trigger on auth.users
--   4. No INSERT RLS policy on accounts
--   5. No GRANT INSERT on accounts to authenticated
--   6. NOT NULL columns (license_number, registration_number)
--      have no defaults, blocking auto-creation
-- ============================================================

-- ============================================================
-- STEP 1: Ensure sequences exist
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'membership_id_seq') THEN
    CREATE SEQUENCE public.membership_id_seq START 1;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'certificate_id_seq') THEN
    CREATE SEQUENCE public.certificate_id_seq START 1;
  END IF;
END $$;

-- ============================================================
-- STEP 2: Add defaults for NOT NULL columns that block auto-creation
-- These columns are required for firm registration but should
-- default to empty strings for new signups (before firm application)
-- ============================================================
ALTER TABLE public.accounts ALTER COLUMN firm_name SET DEFAULT '';
ALTER TABLE public.accounts ALTER COLUMN license_number SET DEFAULT '';
ALTER TABLE public.accounts ALTER COLUMN registration_number SET DEFAULT '';

-- Drop UNIQUE constraints on license_number and registration_number
-- because empty-string defaults would violate uniqueness for multiple users
-- These will be enforced at the application level instead
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_license_number_key;
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_registration_number_key;

-- ============================================================
-- STEP 3: Create/replace the generate_membership_id function
-- ============================================================
CREATE OR REPLACE FUNCTION generate_membership_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.membership_id IS NULL OR NEW.membership_id = '' THEN
    NEW.membership_id := 'NDADA-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('membership_id_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path TO pg_catalog, public;

-- Trigger: auto-generate membership_id on accounts insert
DROP TRIGGER IF EXISTS trg_generate_membership_id_accounts ON public.accounts;
CREATE TRIGGER trg_generate_membership_id_accounts
  BEFORE INSERT ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION generate_membership_id();

-- ============================================================
-- STEP 4: Create/replace handle_new_user trigger function
-- This runs SECURITY DEFINER to bypass RLS on account creation
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.accounts (
    user_id,
    full_name,
    email,
    phone,
    address,
    firm_name,
    license_number,
    registration_number,
    firm_address,
    contact_phone,
    contact_email
  ) VALUES (
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), SPLIT_PART(COALESCE(NEW.email, ''), '@', 1)),
    COALESCE(NEW.email, 'unknown@example.com'),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'address', ''),
    '',  -- firm_name: empty until they apply
    '',  -- license_number: empty until they apply
    '',  -- registration_number: empty until they apply
    '',  -- firm_address
    '',  -- contact_phone
    ''   -- contact_email
  )
  ON CONFLICT (user_id) DO NOTHING;  -- Idempotent: skip if already exists
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public;

-- Attach trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- STEP 5: Add INSERT RLS policy for accounts
-- Users must be able to insert their own account row (client fallback)
-- ============================================================
DROP POLICY IF EXISTS "users_insert_own_account" ON public.accounts;
CREATE POLICY "users_insert_own_account"
  ON public.accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- STEP 6: Grant INSERT permission on accounts to authenticated users
-- ============================================================
GRANT INSERT ON public.accounts TO authenticated;

-- ============================================================
-- STEP 7: Grant usage on sequences
-- ============================================================
GRANT USAGE, SELECT ON SEQUENCE public.membership_id_seq TO authenticated;

-- ============================================================
-- MIGRATION 039 COMPLETE
-- ============================================================
