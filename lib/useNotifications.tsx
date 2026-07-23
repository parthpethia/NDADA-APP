import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { Notification } from '@/types';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '@/lib/queries';

/** Number of notifications to fetch per page */
const PAGE_SIZE = 30;

interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Load the next page of older notifications */
  loadMore: () => Promise<void>;
  /** Whether more notifications can be loaded */
  hasMore: boolean;
  /** Whether a loadMore call is in progress */
  loadingMore: boolean;
  /** Seed the unread count from an external source (e.g. dashboard RPC) */
  seedUnreadCount: (count: number) => void;
}

const NotificationContext = createContext<UseNotificationsReturn | null>(null);

/**
 * Internal hook to manage user notifications for the provider.
 *
 * Optimization notes:
 * - The full notification list is loaded lazily — only when `refresh()` is
 *   called (i.e. when the user opens the Notifications screen).
 * - On mount, only the unread count is fetched from the denormalized
 *   `notification_unread_counts` table (O(1) PK lookup).
 * - Polling has been replaced with a Supabase Realtime subscription that
 *   listens for INSERT and UPDATE events on the `notifications` table,
 *   filtered by user_id. This provides near-instant notification delivery.
 * - Only ONE Realtime channel is created per user session. It is cleaned up
 *   on unmount or when the userId changes (sign-out / switch user).
 */
function useNotificationsSource(userId: string | undefined): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Track whether the full list has been loaded at least once
  const listLoadedRef = useRef(false);
  const isMountedRef = useRef(true);

  /**
   * Fetch only the unread count (lightweight O(1) lookup from cached table).
   * Used on mount; Realtime handles updates after that.
   */
  const fetchCountOnly = useCallback(async () => {
    if (!userId) {
      if (isMountedRef.current) setUnreadCount(0);
      return;
    }

    try {
      const { data } = await fetchUnreadNotificationCount(userId);
      if (isMountedRef.current) {
        setUnreadCount(data || 0);
      }
    } catch (err) {
      console.warn('fetchUnreadNotificationCount error:', err);
    }
  }, [userId]);

  /**
   * Fetch the full notification list (first page) + unread count.
   * Called when the Notifications screen is opened (via refresh()).
   */
  const fetchFullData = useCallback(async () => {
    if (!userId) {
      if (isMountedRef.current) {
        setNotifications([]);
        setUnreadCount(0);
      }
      return;
    }

    if (isMountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      // Fetch notifications (first page) and unread count in parallel
      const [notificationsResult, countResult] = await Promise.all([
        fetchNotifications(userId, PAGE_SIZE),
        fetchUnreadNotificationCount(userId),
      ]);

      if (notificationsResult.error) {
        throw new Error(notificationsResult.error.message);
      }

      const items = notificationsResult.data || [];
      if (isMountedRef.current) {
        setNotifications(items);
        setUnreadCount(countResult.data || 0);
        setHasMore(items.length === PAGE_SIZE);
        listLoadedRef.current = true;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch notifications';
      if (isMountedRef.current) {
        setError(message);
      }
      console.error('useNotifications error:', message);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [userId]);

  const notificationsRef = useRef<Notification[]>([]);
  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  /**
   * Load the next page of older notifications (cursor-based pagination).
   */
  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || loadingMore) return;

    if (isMountedRef.current) setLoadingMore(true);
    try {
      // Use the last notification's created_at as the cursor from the ref to avoid stale closure
      const currentList = notificationsRef.current;
      const lastNotification = currentList[currentList.length - 1];
      if (!lastNotification) return;

      const { data, error: fetchError } = await fetchNotifications(
        userId,
        PAGE_SIZE,
        lastNotification.created_at
      );

      if (fetchError) {
        console.warn('loadMore error:', fetchError.message);
        return;
      }

      const items = data || [];
      if (isMountedRef.current) {
        setNotifications((prev) => [...prev, ...items]);
        setHasMore(items.length === PAGE_SIZE);
      }
    } catch (err) {
      console.warn('loadMore error:', err);
    } finally {
      if (isMountedRef.current) {
        setLoadingMore(false);
      }
    }
  }, [userId, hasMore, loadingMore]);

  // ─── Realtime subscription ─────────────────────────────────
  // Single channel per user session. Replaces the 120s polling interval.
  // App active -> subscribe, App backgrounded -> unsubscribe, App closed -> disconnect.
  useEffect(() => {
    isMountedRef.current = true;
    // Fetch initial unread count on mount
    fetchCountOnly();

    if (!userId) return () => { isMountedRef.current = false; };

    let channel: any = null;

    const subscribe = () => {
      if (channel) return;

      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            // A new notification arrived — increment unread count
            const newNotification = payload.new as Notification;
            if (newNotification && !newNotification.read) {
              setUnreadCount((prev) => prev + 1);
            }

            // If the full list has been loaded (user has opened Notifications screen),
            // prepend the new notification to the list for instant feedback.
            if (listLoadedRef.current && newNotification) {
              setNotifications((prev) => [newNotification, ...prev]);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const updated = payload.new as Notification;
            const old = payload.old as Partial<Notification>;

            // If read status changed (e.g. marked read from another device), sync locally
            if (old.read === false && updated.read === true) {
              setUnreadCount((prev) => Math.max(0, prev - 1));
            } else if (old.read === true && updated.read === false) {
              setUnreadCount((prev) => prev + 1);
            }

            // Update the notification in the local list
            if (listLoadedRef.current) {
              setNotifications((prev) =>
                prev.map((n) => (n.id === updated.id ? updated : n))
              );
            }
          }
        );

      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED' && __DEV__) {
          console.log(`Subscribed to notifications:${userId}`);
        }
      });
    };

    const unsubscribe = () => {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
        if (__DEV__) {
          console.log(`Unsubscribed from notifications:${userId}`);
        }
      }
    };

    let lastAppState = AppState.currentState;

    // Set up subscription if app is active on mount
    if (lastAppState === 'active') {
      subscribe();
    }

    // AppState change listener
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === lastAppState) return;
      lastAppState = nextAppState;

      console.log(`Notifications AppState changed to: ${nextAppState}`);

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        if (document.visibilityState === 'hidden' && nextAppState !== 'active') {
          unsubscribe();
        } else if (document.visibilityState === 'visible') {
          fetchCountOnly();
          subscribe();
        }
        return;
      }

      if (nextAppState === 'active') {
        // Catch up on any notifications missed while backgrounded
        fetchCountOnly();
        subscribe();
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        unsubscribe();
      }
    });

    // Cleanup: remove channel/listeners on unmount or userId change, and disconnect websocket
    return () => {
      isMountedRef.current = false;
      subscription.remove();
      unsubscribe();
    };
  }, [userId, fetchCountOnly]);

  const markAsRead = async (id: string) => {
    try {
      const { error } = await markNotificationAsRead(id);
      if (error) throw new Error(error.message);

      // Optimistic local update (Realtime will also fire, but this is instant)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mark as read';
      console.error('markAsRead error:', message);
      throw err;
    }
  };

  const markAllAsRead = async () => {
    if (!userId) return;

    try {
      const { error } = await markAllNotificationsAsRead(userId);
      if (error) throw new Error(error.message);

      // Optimistic local update
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mark all as read';
      console.error('markAllAsRead error:', message);
      throw err;
    }
  };

  /**
   * Seed the unread count from an external source (dashboard RPC).
   * This avoids the separate fetchUnreadNotificationCount() call on mount.
   */
  const seedUnreadCount = useCallback((count: number) => {
    setUnreadCount(count);
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    refresh: fetchFullData,
    loadMore,
    hasMore,
    loadingMore,
    seedUnreadCount,
  };
}

/**
 * Provider to wrap the application and coordinate a single notifications
 * Realtime subscription per user session.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const value = useNotificationsSource(user?.id);
  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * Hook to access the shared notifications state from context.
 * Can take an optional parameter for backwards compatibility, but ignores it
 * in favor of the shared context.
 */
export function useNotifications(userId?: string | undefined): UseNotificationsReturn {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
