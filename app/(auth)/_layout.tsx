import { Slot, Redirect, usePathname } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { LoadingScreen } from '@/components/ui';
import { View } from 'react-native';

export default function AuthLayout() {
  const { session, adminUser, loading } = useAuth();
  const pathname = usePathname();

  if (loading) return <LoadingScreen />;

  // Allow the reset-password page to remain accessible even with
  // an active session — the recovery flow sets a temporary session
  // that the user needs to update their password.
  const isResetPassword = pathname?.includes('reset-password');
  if (session && !isResetPassword) return <Redirect href={adminUser ? '/admin' : '/(dashboard)'} />;

  return (
    <View className="flex-1 bg-gray-50">
      <Slot />
    </View>
  );
}
