import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { LoadingScreen } from '@/components/ui';
import { Platform } from 'react-native';

export default function Index() {
  const { session, adminUser, loading, profileReady, isRecoverySession } = useAuth();

  if (loading || !profileReady) {
    return <LoadingScreen message="Loading..." />;
  }

  // Intercept recovery sessions or recovery tokens landing on root route
  const hasRecoveryToken = Platform.OS === 'web' && typeof window !== 'undefined'
    ? (
        window.location.hash.includes('type=recovery') ||
        window.location.search.includes('type=recovery') ||
        window.location.search.includes('token_hash') ||
        window.location.search.includes('code=') ||
        window.location.hash.includes('access_token')
      )
    : false;

  if (isRecoverySession || hasRecoveryToken) {
    return <Redirect href="/(auth)/reset-password" />;
  }

  if (session) {
    const target = adminUser ? '/admin' : '/(dashboard)';
    return <Redirect href={target} />;
  }
  return <Redirect href="/(auth)/login" />;
}

