-- Performance: add covering index for fraud_flags.member_id foreign key

CREATE INDEX IF NOT EXISTS idx_fraud_flags_member_id
  ON public.fraud_flags (member_id);
