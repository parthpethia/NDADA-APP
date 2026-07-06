import { Slot, Redirect, usePathname } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { LoadingScreen } from '@/components/ui';
import { View } from 'react-native';

export default function AuthLayout() {
  const { session, adminUser, loading, profileReady } = useAuth();
  const pathname = usePathname();

  if (loading) return <LoadingScreen />;

  // Allow the reset-password page to remain accessible even with
  // an active session — the recovery flow sets a temporary session
  // that the user needs to update their password.
  const isResetPassword = pathname?.includes('reset-password');

  // Wait for profile (including admin status) to be resolved before
  // deciding where to redirect.  Without this guard the redirect fires
  // while adminUser is still null (profile fetch deferred via setTimeout)
  // and admins always land on the member dashboard.
  if (session && !isResetPassword) {
    if (!profileReady) return <LoadingScreen />;
    return <Redirect href={adminUser ? '/admin' : '/(dashboard)'} />;
  }

  return (
    <View className="flex-1 bg-white">
      <Slot />
    </View>
  );
}
