-- Migration 028: Update registration fee default amount
-- Sets the default payment amount to ₹300 (30000 paise).

ALTER TABLE public.payments
  ALTER COLUMN amount SET DEFAULT 30000;
