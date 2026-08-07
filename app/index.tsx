import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { LoadingScreen } from '@/components/ui';

export default function Index() {
  const { session, adminUser, loading, profileReady } = useAuth();

  if (loading || !profileReady) {
    return <LoadingScreen message="Loading..." />;
  }
  if (session) {
    const target = adminUser ? '/admin' : '/(dashboard)';
    return <Redirect href={target} />;
  }
  return <Redirect href="/(auth)/login" />;
}

