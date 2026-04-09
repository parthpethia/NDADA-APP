-- Performance: drop unused index flagged by scanner
-- Caution: only apply if you do not need fast lookups/filtering by members.email.

DROP INDEX IF EXISTS public.idx_members_email;
