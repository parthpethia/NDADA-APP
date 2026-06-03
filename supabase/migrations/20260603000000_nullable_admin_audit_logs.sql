-- Migration: Make audit_logs.admin_id nullable and add actor details for system actions
-- actor_type indicates if the log was triggered by an 'admin', 'system', or 'user'
-- actor_identifier records the service or process name for 'system' actions

-- 1. Create enum for actor type
CREATE TYPE audit_actor_type AS ENUM ('admin', 'system', 'user');

-- 2. Add columns to audit_logs
ALTER TABLE public.audit_logs
  ADD COLUMN actor_type audit_actor_type NOT NULL DEFAULT 'admin',
  ADD COLUMN actor_identifier TEXT;

-- 3. Make admin_id nullable
ALTER TABLE public.audit_logs
  ALTER COLUMN admin_id DROP NOT NULL;

-- 4. Backfill existing records (they all have non-null admin_id)
UPDATE public.audit_logs
  SET actor_type = 'admin'
  WHERE admin_id IS NOT NULL;
