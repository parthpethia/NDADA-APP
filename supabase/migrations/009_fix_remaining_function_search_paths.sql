-- Fix: lock down function search_path to prevent role-mutable search_path risks
-- Ref: security scanners flag functions without an explicit search_path.

ALTER FUNCTION public.check_duplicate_phone()
  SET search_path TO pg_catalog, public;

ALTER FUNCTION public.is_admin()
  SET search_path TO pg_catalog, public;

ALTER FUNCTION public.has_admin_role(required_role admin_role)
  SET search_path TO pg_catalog, public;

ALTER FUNCTION public.check_duplicate_license()
  SET search_path TO pg_catalog, public;

ALTER FUNCTION public.check_failed_payments()
  SET search_path TO pg_catalog, public;

ALTER FUNCTION public.handle_new_user()
  SET search_path TO pg_catalog, public;
