-- ============================================================
-- MIGRATION 031: Add New Payment Status States
-- ============================================================
-- This migration adds new payment status states to track:
-- - 'processing': Payment submitted, webhook pending
-- - 'expired': Payment link has expired (24hr limit)
-- - 'abandoned': User didn't complete payment within timeframe
-- ============================================================

-- Alter the payment_status enum to add new values
ALTER TYPE payment_status ADD VALUE 'processing' BEFORE 'paid';
ALTER TYPE payment_status ADD VALUE 'abandoned' AFTER 'failed';
ALTER TYPE payment_status ADD VALUE 'expired' AFTER 'failed';

-- Add columns to payments table for better tracking
ALTER TABLE payments ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Set default expiry to 24 hours from now for existing pending payments
UPDATE payments
SET expires_at = created_at + INTERVAL '24 hours'
WHERE status = 'pending' AND expires_at IS NULL;

-- Create an index for efficient expiry lookups
CREATE INDEX IF NOT EXISTS idx_payments_expires_at ON payments(expires_at)
WHERE status IN ('pending', 'processing');
