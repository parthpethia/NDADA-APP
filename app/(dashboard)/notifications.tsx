import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useNotifications } from '@/lib/useNotifications';
import { Card, Button, LoadingScreen, EmptyState } from '@/components/ui';
import { Bell, CheckCircle, XCircle, AlertCircle, FileText } from 'lucide-react-native';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Notification, NotificationType } from '@/types';

const notificationTypeConfig: Record<NotificationType, { icon: React.ReactNode; color: string; bgColor: string }> = {
  payment: { icon: <FileText size={20} color="#2563eb" />, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  approval: { icon: <CheckCircle size={20} color="#16a34a" />, color: 'text-green-600', bgColor: 'bg-green-50' },
  certificate: { icon: <AlertCircle size={20} color="#f59e0b" />, color: 'text-amber-600', bgColor: 'bg-amber-50' },
  system: { icon: <Bell size={20} color="#6b7280" />, color: 'text-gray-600', bgColor: 'bg-gray-50' },
};

export function NotificationCenter() {
  const { user, member } = useAuth();
  const { notifications, unreadCount, loading, refresh, markAsRead, markAllAsRead } = useNotifications(user?.id);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleNotificationPress = async (notification: Notification) => {
    // Mark as read
    if (!notification.read) {
      await markAsRead(notification.id);
    }

    // Navigate to action URL if provided
    if (notification.action_url) {
      router.push(notification.action_url);
    }
  };

  if (loading) {
    return <LoadingScreen message="Loading notifications..." />;
  }

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerClassName="p-4 pb-8"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View className="mb-4 flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-bold text-gray-900">Notifications</Text>
          {unreadCount > 0 && (
            <Text className="text-sm text-gray-500">{unreadCount} unread</Text>
          )}
        </View>
        {unreadCount > 0 && (
          <Button title="Mark all as read" size="sm" variant="outline" onPress={markAllAsRead} />
        )}
      </View>

      {/* Notification List */}
      {notifications.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          message="You'll see updates about your application, payments, and certificates here."
        />
      ) : (
        <View className="gap-3">
          {notifications.map((notification) => {
            const config = notificationTypeConfig[notification.type];
            const timeAgo = formatDistanceToNow(parseISO(notification.created_at), { addSuffix: true });

            return (
              <TouchableOpacity
                key={notification.id}
                onPress={() => handleNotificationPress(notification)}
                activeOpacity={0.7}
              >
                <Card
                  className={`overflow-hidden border-l-4 ${
                    notification.read ? 'bg-white' : 'bg-blue-50 border-l-blue-500'
                  }`}
                >
                  <View className="flex-row gap-3">
                    {/* Icon */}
                    <View className={`${config.bgColor} items-center justify-center rounded-lg p-3`}>
                      {config.icon}
                    </View>

                    {/* Content */}
                    <View className="flex-1 justify-center">
                      <View className="flex-row items-center justify-between">
                        <Text className="font-semibold text-gray-900" numberOfLines={1}>
                          {notification.title}
                        </Text>
                        {!notification.read && (
                          <View className="ml-2 h-2 w-2 rounded-full bg-blue-500" />
                        )}
                      </View>
                      <Text className="mt-1 text-sm text-gray-600" numberOfLines={2}>
                        {notification.message}
                      </Text>
                      <Text className="mt-2 text-xs text-gray-400">{timeAgo}</Text>
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

export function NotificationBell() {
  const { user } = useAuth();
  const { unreadCount } = useNotifications(user?.id);

  return (
    <TouchableOpacity onPress={() => router.push('/(dashboard)/notifications')}>
      <View className="relative">
        <Bell size={24} color="#1f2937" />
        {unreadCount > 0 && (
          <View className="absolute -right-2 -top-2 h-5 w-5 items-center justify-center rounded-full bg-red-500">
            <Text className="text-xs font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}
