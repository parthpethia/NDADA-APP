import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Notification } from '@/types';
import { useAuth } from '@/lib/auth';
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

const NotificationContext = createContext<UseNotificationsReturn | null>(null);

/**
 * Internal hook to manage user notifications for the provider
 */
function useNotificationsSource(userId: string | undefined): UseNotificationsReturn {
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

    if (!userId) return;

    // Poll for new notifications every 120 seconds (2 minutes)
    const interval = setInterval(fetchData, 120000);
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

/**
 * Provider to wrap the application and coordinate a single notifications subscription/polling instance.
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
 * Can take an optional parameter for backwards compatibility, but ignores it in favor of the shared context.
 */
export function useNotifications(userId?: string | undefined): UseNotificationsReturn {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

