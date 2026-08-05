import { Slot, Redirect, usePathname } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { LoadingScreen } from '@/components/ui';
import { View } from 'react-native';
import { ACTIVE_NAVIGATION_STRATEGY } from '@/lib/navigationStrategy';
import { navLog, renderLog } from '@/lib/utils';
import { useRef } from 'react';

export default function AuthLayout() {
  const { session, adminUser, loading, profileReady } = useAuth();
  const pathname = usePathname();
  const renderCountRef = useRef(0);
  renderCountRef.current++;

  renderLog('AuthLayout', renderCountRef.current, {
    pathname,
    session: !!session,
    loading,
    profileReady,
    adminUser: !!adminUser,
  });

  if (loading) {
    navLog('AuthLayout', 'Render LoadingScreen (loading=true)');
    return <LoadingScreen message="Checking authentication..." />;
  }

  const isResetPassword = pathname?.includes('reset-password');

  // Declarative Auth Guard: If session exists and user is not resetting password, redirect to dashboard/admin
  if (session && !isResetPassword) {
    if (!profileReady) {
      navLog('AuthLayout', 'Session active, profileReady=false → LoadingScreen');
      return <LoadingScreen message="Loading user profile..." />;
    }
    const target = adminUser ? '/admin' : '/(dashboard)';
    navLog('AuthLayout', `Session active & profile ready → REDIRECT to ${target}`);
    return <Redirect href={target} />;
  }

  navLog('AuthLayout', 'No session → rendering auth Slot');
  return (
    <View className="flex-1 bg-white">
      <Slot />
    </View>
  );
}
