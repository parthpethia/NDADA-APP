import { Slot, Redirect, usePathname } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { LoadingScreen } from '@/components/ui';
import { View, Platform } from 'react-native';
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

  // Intercept recovery links landing on non-reset routes (e.g. / or /login) and route to /reset-password
  const hasRecoveryToken = Platform.OS === 'web' && typeof window !== 'undefined'
    ? (window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery') || window.location.hash.includes('access_token'))
    : false;

  if (hasRecoveryToken && !isResetPassword) {
    navLog('AuthLayout', 'Recovery token detected in URL → REDIRECT to reset-password');
    return <Redirect href="/(auth)/reset-password" />;
  }

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
