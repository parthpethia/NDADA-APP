import '../global.css';
import { useState, useCallback } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/lib/auth';
import { NotificationProvider } from '@/lib/useNotifications';
import { useErrorTracking } from '@/lib/useErrorTracking';
import { SplashScreen } from '@/components/SplashScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Wrapper to call useErrorTracking inside AuthProvider context
function ErrorTrackingInit() {
  useErrorTracking();
  return null;
}

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);
  const handleSplashFinish = useCallback(() => setShowSplash(false), []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
        <AuthProvider>
          <ErrorTrackingInit />
          <NotificationProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(dashboard)" />
            <Stack.Screen
              name="register"
              options={{
                headerShown: true,
                title: 'Register in NDADA',
                headerStyle: { backgroundColor: '#166534' },
                headerTintColor: '#fff',
                headerTitleStyle: { fontWeight: '600' },
                presentation: 'card',
              }}
            />
            <Stack.Screen
              name="privacy-policy"
              options={{
                headerShown: true,
                title: 'Privacy Policy',
                headerStyle: { backgroundColor: '#166534' },
                headerTintColor: '#fff',
                headerTitleStyle: { fontWeight: '600' },
                presentation: 'card',
              }}
            />
            <Stack.Screen
              name="terms"
              options={{
                headerShown: true,
                title: 'Terms of Service',
                headerStyle: { backgroundColor: '#166534' },
                headerTintColor: '#fff',
                headerTitleStyle: { fontWeight: '600' },
                presentation: 'card',
              }}
            />
            <Stack.Screen
              name="cart"
              options={{
                headerShown: true,
                title: 'Cart',
                headerStyle: { backgroundColor: '#166534' },
                headerTintColor: '#fff',
                headerTitleStyle: { fontWeight: '600' },
                presentation: 'card',
              }}
            />
            <Stack.Screen
              name="verify"
              options={{
                headerShown: true,
                title: 'Verify Certificate',
                headerStyle: { backgroundColor: '#166534' },
                headerTintColor: '#fff',
                headerTitleStyle: { fontWeight: '600' },
                presentation: 'card',
              }}
            />
            <Stack.Screen name="admin" />
          </Stack>
        </NotificationProvider>
      </AuthProvider>
    </SafeAreaProvider>
    </ErrorBoundary>
  );
}
