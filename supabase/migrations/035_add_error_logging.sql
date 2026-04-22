-- ============================================================
-- MIGRATION 035: Add Error Logging Table
-- ============================================================
-- Table to store application errors for monitoring and debugging
-- ============================================================

CREATE TABLE public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  level TEXT NOT NULL DEFAULT 'error', -- 'error', 'warning', 'info'
  message TEXT NOT NULL,
  stack_trace TEXT,
  context JSONB DEFAULT '{}'::jsonb,
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_error_logs_user_id ON public.error_logs(user_id);
CREATE INDEX idx_error_logs_level ON public.error_logs(level);
CREATE INDEX idx_error_logs_created_at ON public.error_logs(created_at DESC);
CREATE INDEX idx_error_logs_resolved ON public.error_logs(resolved)
  WHERE NOT resolved;

-- ============================================================
-- RLS: Admins can view all logs; users see only their own
-- ============================================================
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own errors" ON public.error_logs
  FOR SELECT
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can update errors" ON public.error_logs
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  ));

-- ============================================================
-- FUNCTION: Auto-update updated_at timestamp
-- ============================================================
CREATE TRIGGER trg_error_logs_updated_at
  BEFORE UPDATE ON public.error_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- FUNCTION: Get error statistics
-- ============================================================
CREATE OR REPLACE FUNCTION get_error_stats(days_back INT DEFAULT 7)
RETURNS TABLE (
  level TEXT,
  count BIGINT,
  unique_users BIGINT,
  latest_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    el.level,
    COUNT(*)::BIGINT as count,
    COUNT(DISTINCT el.user_id)::BIGINT as unique_users,
    MAX(el.created_at) as latest_at
  FROM error_logs el
  WHERE el.created_at >= now() - (days_back || ' days')::INTERVAL
  GROUP BY el.level
  ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Get unresolved critical errors
-- ============================================================
CREATE OR REPLACE FUNCTION get_unresolved_critical_errors()
RETURNS TABLE (
  id UUID,
  message TEXT,
  user_id UUID,
  level TEXT,
  created_at TIMESTAMPTZ,
  error_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    el.id,
    el.message,
    el.user_id,
    el.level,
    MAX(el.created_at) as created_at,
    COUNT(*)::BIGINT as error_count
  FROM error_logs el
  WHERE el.resolved = false
    AND el.level = 'error'
  GROUP BY el.id, el.message, el.user_id, el.level
  ORDER BY error_count DESC, created_at DESC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql;
