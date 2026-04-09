import { Slot, Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { LoadingScreen } from '@/components/ui';
import { View } from 'react-native';

export default function AuthLayout() {
  const { session, adminUser, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (session) return <Redirect href={adminUser ? '/admin' : '/(dashboard)'} />;

  return (
    <View className="flex-1 bg-gray-50">
      <Slot />
    </View>
  );
}
