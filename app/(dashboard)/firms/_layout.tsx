import { Stack } from 'expo-router';

export default function FirmsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1e40af' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'My Firms' }} />
      <Stack.Screen name="[id]" options={{ title: 'Firm Details' }} />
      <Stack.Screen name="new" options={{ title: 'Register Firm' }} />
    </Stack>
  );
}
