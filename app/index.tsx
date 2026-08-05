import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { LoadingScreen } from '@/components/ui';

export default function Index() {
  const { session, adminUser, loading, profileReady } = useAuth();

  // Diagnostic: trace initial routing decision
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[AUTH-FORENSIC ${ts}] Index render: session=${!!session} loading=${loading} profileReady=${profileReady} adminUser=${!!adminUser}`);

  if (loading || !profileReady) {
    console.log(`[AUTH-FORENSIC ${ts}] Index: loading/!profileReady → LoadingScreen`);
    return <LoadingScreen message="Loading..." />;
  }
  if (session) {
    const target = adminUser ? '/admin' : '/(dashboard)';
    console.log(`[AUTH-FORENSIC ${ts}] Index: session exists → Redirect to ${target}`);
    return <Redirect href={target} />;
  }
  console.log(`[AUTH-FORENSIC ${ts}] Index: no session → Redirect to login`);
  return <Redirect href="/(auth)/login" />;
}
