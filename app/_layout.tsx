import '../global.css';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/lib/auth';
import { NotificationProvider } from '@/lib/useNotifications';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
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
            <Stack.Screen name="verify" />
            <Stack.Screen name="admin" />
          </Stack>
        </NotificationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
