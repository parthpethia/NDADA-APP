-- ============================================================
-- MIGRATION 063: Notification Optimizations
-- ============================================================
-- 1. Denormalized unread count table (eliminates COUNT(*) queries)
-- 2. Trigger-based count maintenance on INSERT/UPDATE/DELETE
-- 3. Backfill counts for existing users
-- 4. Enable Supabase Realtime for the notifications table
-- ============================================================

-- ============================================================
-- 1. UNREAD COUNTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_unread_counts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  count   INT NOT NULL DEFAULT 0
);

-- RLS: users can only read their own unread count
ALTER TABLE public.notification_unread_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own unread count"
  ON public.notification_unread_counts
  FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- 2. TRIGGER FUNCTIONS — keep unread count in sync
-- ============================================================

-- 2a. On INSERT into notifications: increment count (new notifications are unread by default)
CREATE OR REPLACE FUNCTION public.notification_count_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only increment if the new notification is unread (default)
  IF NEW.read = false THEN
    INSERT INTO public.notification_unread_counts (user_id, count)
    VALUES (NEW.user_id, 1)
    ON CONFLICT (user_id)
    DO UPDATE SET count = notification_unread_counts.count + 1;
  END IF;
  RETURN NEW;
END;
$$;

-- 2b. On UPDATE of notifications: adjust count when read status changes
CREATE OR REPLACE FUNCTION public.notification_count_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- read changed from false → true: decrement
  IF OLD.read = false AND NEW.read = true THEN
    UPDATE public.notification_unread_counts
    SET count = GREATEST(count - 1, 0)
    WHERE user_id = NEW.user_id;
  -- read changed from true → false (undo): increment
  ELSIF OLD.read = true AND NEW.read = false THEN
    INSERT INTO public.notification_unread_counts (user_id, count)
    VALUES (NEW.user_id, 1)
    ON CONFLICT (user_id)
    DO UPDATE SET count = notification_unread_counts.count + 1;
  END IF;
  RETURN NEW;
END;
$$;

-- 2c. On DELETE of notifications: decrement count if deleted notification was unread
CREATE OR REPLACE FUNCTION public.notification_count_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.read = false THEN
    UPDATE public.notification_unread_counts
    SET count = GREATEST(count - 1, 0)
    WHERE user_id = OLD.user_id;
  END IF;
  RETURN OLD;
END;
$$;

-- ============================================================
-- 3. CREATE TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS trg_notification_count_insert ON public.notifications;
CREATE TRIGGER trg_notification_count_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notification_count_on_insert();

DROP TRIGGER IF EXISTS trg_notification_count_update ON public.notifications;
CREATE TRIGGER trg_notification_count_update
  AFTER UPDATE OF read ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notification_count_on_update();

DROP TRIGGER IF EXISTS trg_notification_count_delete ON public.notifications;
CREATE TRIGGER trg_notification_count_delete
  AFTER DELETE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notification_count_on_delete();

-- ============================================================
-- 4. BACKFILL existing unread counts
-- ============================================================
INSERT INTO public.notification_unread_counts (user_id, count)
SELECT user_id, COUNT(*)
FROM public.notifications
WHERE read = false
GROUP BY user_id
ON CONFLICT (user_id) DO UPDATE SET count = EXCLUDED.count;

-- Also ensure users with zero unread have a row (avoids NULL on lookup)
INSERT INTO public.notification_unread_counts (user_id, count)
SELECT DISTINCT user_id, 0
FROM public.notifications
WHERE user_id NOT IN (SELECT user_id FROM public.notification_unread_counts)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- 5. ENABLE REALTIME for notifications table
-- ============================================================
-- This allows clients to subscribe to INSERT/UPDATE events.
-- RLS automatically filters events so each user only sees their own.
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ============================================================
-- 6. REVOKE direct write access to unread counts (trigger-managed only)
-- ============================================================
-- Users should never directly modify this table; it's maintained by triggers.
-- Only SELECT is allowed via RLS policy above.
REVOKE INSERT, UPDATE, DELETE ON public.notification_unread_counts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.notification_unread_counts FROM anon;
