-- Fix: lock down function search_path to prevent role-mutable search_path risks
-- Ref: security scanners flag functions without an explicit search_path.

ALTER FUNCTION public.generate_membership_id()
  SET search_path TO pg_catalog, public;
