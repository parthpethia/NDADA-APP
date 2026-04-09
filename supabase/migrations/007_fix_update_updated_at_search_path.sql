-- Fix: lock down function search_path to prevent role-mutable search_path risks
-- Ref: security scanners flag functions without an explicit search_path.

ALTER FUNCTION public.update_updated_at()
  SET search_path TO pg_catalog, public;
