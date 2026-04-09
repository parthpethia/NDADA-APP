-- Performance: avoid multiple permissive RLS policies for the same role/action
-- Fix certificates so role anon has only one permissive SELECT policy.

-- Public verification should apply to anon only
ALTER POLICY "Public can verify certificates"
  ON public.certificates
  TO anon;

-- Member-specific access should apply to authenticated users only
ALTER POLICY "Users can view own certificate"
  ON public.certificates
  TO authenticated;
