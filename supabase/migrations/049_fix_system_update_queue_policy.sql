-- Fix overly permissive policy on certificate_generation_queue
-- In a previous migration we tried to fix "System can update queue" 
-- but it was actually named "system_update_queue" in the consolidated schema.

DROP POLICY IF EXISTS "system_update_queue" ON public.certificate_generation_queue;
CREATE POLICY "system_update_queue" ON public.certificate_generation_queue
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);
