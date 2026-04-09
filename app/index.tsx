import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { LoadingScreen } from '@/components/ui';

export default function Index() {
  const { session, adminUser, loading } = useAuth();

  if (loading) return <LoadingScreen message="Loading..." />;
  if (session) return <Redirect href={adminUser ? '/admin' : '/(dashboard)'} />;
  return <Redirect href="/(auth)/login" />;
}
