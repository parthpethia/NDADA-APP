import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';

export default function RegisterScreen() {
  const { session } = useAuth();
  if (session) {
    return <Redirect href="/(dashboard)/firms/new" />;
  }
  return <Redirect href="/(auth)/register" />;
}
