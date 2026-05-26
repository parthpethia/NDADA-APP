-- Update membership_id format to be a 4-digit number (e.g. 0001)
CREATE OR REPLACE FUNCTION generate_membership_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.membership_id IS NULL OR NEW.membership_id = '' THEN
    NEW.membership_id := LPAD(nextval('membership_id_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path TO pg_catalog, public;
