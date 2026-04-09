import '../global.css';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/lib/auth';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(dashboard)" />
          <Stack.Screen
            name="register"
            options={{
              headerShown: true,
              title: 'Register in NDADA',
              headerStyle: { backgroundColor: '#1e40af' },
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
              headerStyle: { backgroundColor: '#1e40af' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: '600' },
              presentation: 'card',
            }}
          />
          <Stack.Screen name="verify" />
          <Stack.Screen name="admin" />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
