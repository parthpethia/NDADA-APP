-- Performance: drop redundant indexes that duplicate UNIQUE constraint indexes
-- Note: Postgres creates indexes automatically for UNIQUE constraints.

-- members.membership_id is UNIQUE, so idx_members_membership_id is redundant
DROP INDEX IF EXISTS public.idx_members_membership_id;

-- firms.license_number is UNIQUE, so idx_firms_license_number is redundant
DROP INDEX IF EXISTS public.idx_firms_license_number;
