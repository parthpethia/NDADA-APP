-- Fix missing search_path on certificate queue functions
-- This prevents role mutable search_path security warnings

ALTER FUNCTION public.mark_certificate_processing(UUID) SET search_path = public;
ALTER FUNCTION public.mark_certificate_completed(UUID) SET search_path = public;
ALTER FUNCTION public.mark_certificate_failed(UUID, TEXT) SET search_path = public;
ALTER FUNCTION public.get_next_certificate_job() SET search_path = public;
ALTER FUNCTION public.queue_certificate_on_approval() SET search_path = public;

-- Also fix the overly permissive policy on the certificate queue table
DROP POLICY IF EXISTS "System can update queue" ON public.certificate_generation_queue;
CREATE POLICY "System can update queue" ON public.certificate_generation_queue
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);
