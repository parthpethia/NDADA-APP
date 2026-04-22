import { useEffect, useState } from 'react';
import { Notification } from '@/types';
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '@/lib/queries';

interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Hook to manage user notifications
 * Provides fetching, marking as read, and real-time updates
 */
export function useNotifications(userId: string | undefined): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch notifications and unread count in parallel
      const [notificationsResult, countResult] = await Promise.all([
        fetchNotifications(userId),
        fetchUnreadNotificationCount(userId),
      ]);

      if (notificationsResult.error) {
        throw new Error(notificationsResult.error.message);
      }

      setNotifications(notificationsResult.data || []);
      setUnreadCount(countResult.data || 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch notifications';
      setError(message);
      console.error('useNotifications error:', message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  const markAsRead = async (id: string) => {
    try {
      const { error } = await markNotificationAsRead(id);
      if (error) throw new Error(error.message);

      // Update local state
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

      // Update local state
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mark all as read';
      console.error('markAllAsRead error:', message);
      throw err;
    }
  };

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    refresh: fetchData,
  };
}
