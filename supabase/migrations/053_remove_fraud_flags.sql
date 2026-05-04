-- Migration 053: Remove fraud flags

-- 1. Drop the table and policies
DROP TABLE IF EXISTS public.fraud_flags CASCADE;

-- 2. Drop the old functions that returned fraud_flags_count
DROP FUNCTION IF EXISTS get_account_with_details(UUID);
DROP FUNCTION IF EXISTS get_pending_applications(INT);

-- 3. Recreate get_account_with_details without fraud_flags_count
CREATE OR REPLACE FUNCTION get_account_with_details(p_account_id UUID)
RETURNS TABLE (account_id UUID, user_id UUID, firm_name TEXT, full_name TEXT, email TEXT, payment_status TEXT, approval_status TEXT, membership_id TEXT, payment_count BIGINT, has_certificate BOOLEAN) AS $$
BEGIN
  RETURN QUERY SELECT a.id, a.user_id, a.firm_name, a.full_name, a.email, a.payment_status::TEXT, a.approval_status::TEXT, a.membership_id,
    (SELECT COUNT(*) FROM payments WHERE member_id = a.id)::BIGINT,
    (SELECT COUNT(*) FROM certificates WHERE member_id = a.id) > 0
  FROM accounts a WHERE a.id = p_account_id;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;

-- 4. Recreate get_pending_applications without fraud_flag_count
CREATE OR REPLACE FUNCTION get_pending_applications(limit_count INT DEFAULT 50)
RETURNS TABLE (id UUID, firm_name TEXT, full_name TEXT, membership_id TEXT, created_at TIMESTAMPTZ, days_pending BIGINT) AS $$
BEGIN
  RETURN QUERY SELECT a.id, a.firm_name, a.full_name, a.membership_id, a.created_at,
    EXTRACT(DAY FROM (NOW() - a.created_at))::BIGINT
  FROM accounts a WHERE a.approval_status = 'pending' AND a.payment_status = 'paid'
  ORDER BY a.created_at ASC LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SET search_path = pg_catalog, public;
