-- Performance: add covering index for firms.reviewed_by foreign key

CREATE INDEX IF NOT EXISTS idx_firms_reviewed_by
  ON public.firms (reviewed_by);
