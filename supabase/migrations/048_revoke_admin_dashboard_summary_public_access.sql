-- Revoke SELECT on the materialized view from anon and authenticated roles
-- Materialized views don't support Row Level Security (RLS), so if they are in the public schema
-- and have SELECT privileges, any user can read all their data via the GraphQL/REST API.

REVOKE SELECT ON public.admin_dashboard_summary FROM PUBLIC;
REVOKE SELECT ON public.admin_dashboard_summary FROM anon;
REVOKE SELECT ON public.admin_dashboard_summary FROM authenticated;
