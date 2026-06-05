-- Add Terms and Privacy policy columns to accounts
ALTER TABLE public.accounts 
  ADD COLUMN IF NOT EXISTS privacy_policy_accepted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_accepted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Update handle_new_user to populate the terms and privacy fields from raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  meta_pp_accepted boolean;
  meta_terms_accepted boolean;
  meta_district text;
BEGIN
  -- Cast metadata fields safely
  meta_pp_accepted := COALESCE((NEW.raw_user_meta_data->>'privacy_policy_accepted')::boolean, false);
  meta_terms_accepted := COALESCE((NEW.raw_user_meta_data->>'terms_accepted')::boolean, false);
  meta_district := COALESCE(NEW.raw_user_meta_data->>'district', '');

  INSERT INTO public.accounts (
    user_id,
    full_name,
    email,
    phone,
    address,
    district,
    firm_name,
    license_number,
    registration_number,
    firm_address,
    contact_phone,
    contact_email,
    privacy_policy_accepted,
    terms_accepted,
    terms_accepted_at
  ) VALUES (
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), SPLIT_PART(COALESCE(NEW.email, ''), '@', 1)),
    COALESCE(NEW.email, 'unknown@example.com'),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'address', ''),
    meta_district,
    '',  -- firm_name: empty until they apply
    '',  -- license_number: empty until they apply
    '',  -- registration_number: empty until they apply
    '',  -- firm_address
    '',  -- contact_phone
    '',  -- contact_email
    meta_pp_accepted,
    meta_terms_accepted,
    CASE WHEN meta_terms_accepted THEN now() ELSE null END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    privacy_policy_accepted = EXCLUDED.privacy_policy_accepted,
    terms_accepted = EXCLUDED.terms_accepted,
    terms_accepted_at = CASE WHEN EXCLUDED.terms_accepted AND accounts.terms_accepted_at IS NULL THEN now() ELSE accounts.terms_accepted_at END;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public;
