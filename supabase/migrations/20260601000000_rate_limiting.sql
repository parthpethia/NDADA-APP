-- Migration: Edge Function Rate Limiting
-- Created at: 2026-06-01

-- 1. Create the rate limit hits table
CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL, -- 'certificate', 'export', 'campaign'
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create index for speedy querying of hits within the last minute/window
CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_user_action ON public.rate_limit_hits(user_id, action_type, created_at DESC);

-- 3. Enable RLS
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;

-- 4. RLS policy to allow admins to view hits
CREATE POLICY "Admins can view all rate limit hits" 
  ON public.rate_limit_hits
  FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- 5. Rate limiting verification RPC function (Dynamic Window & Retry-after support)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_action_type TEXT,
  p_max_requests INT,
  p_window_seconds INT
) RETURNS JSONB AS $$
DECLARE
  v_count INT;
  v_oldest_time TIMESTAMPTZ;
  v_retry_after INT := 0;
  v_allowed BOOLEAN := TRUE;
BEGIN
  -- Handle null user
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', TRUE, 'retry_after', 0);
  END IF;

  -- 1. Clean up old rate limit hits (older than 24 hours to keep the table compact)
  DELETE FROM public.rate_limit_hits
  WHERE created_at < now() - INTERVAL '24 hours';

  -- 2. Count requests in the sliding window for this user and action using pg server timestamps
  SELECT COUNT(*)::INT INTO v_count
  FROM public.rate_limit_hits
  WHERE user_id = p_user_id
    AND action_type = p_action_type
    AND created_at > now() - (p_window_seconds || ' seconds')::INTERVAL;

  -- 3. If limit exceeded
  IF v_count >= p_max_requests THEN
    v_allowed := FALSE;
    
    -- Find the timestamp of the M-th newest request (ordered by created_at DESC)
    -- This is the request that must fall out of the window to allow a new request.
    SELECT created_at INTO v_oldest_time
    FROM public.rate_limit_hits
    WHERE user_id = p_user_id
      AND action_type = p_action_type
      AND created_at > now() - (p_window_seconds || ' seconds')::INTERVAL
    ORDER BY created_at DESC
    OFFSET (p_max_requests - 1)
    LIMIT 1;

    IF v_oldest_time IS NOT NULL THEN
      v_retry_after := CEIL(EXTRACT(EPOCH FROM (v_oldest_time + (p_window_seconds || ' seconds')::INTERVAL - now())))::INT;
      -- Ensure we return at least 1 second if it calculated as <= 0 due to precision boundary
      IF v_retry_after < 1 THEN
        v_retry_after := 1;
      END IF;
    ELSE
      v_retry_after := 1;
    END IF;
  ELSE
    -- Record the hit
    INSERT INTO public.rate_limit_hits (user_id, action_type)
    VALUES (p_user_id, p_action_type);
  END IF;

  RETURN jsonb_build_object('allowed', v_allowed, 'retry_after', v_retry_after);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public;

-- Grant execute permission to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.check_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit TO service_role;
