import { useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { Tabs, Redirect, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { LoadingScreen } from '@/components/ui';
import {
  LayoutDashboard, Users, Building2, CreditCard,
  AlertTriangle, FileText,
} from 'lucide-react-native';

export default function AdminLayout() {
  const { session, loading, adminUser, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (loading) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!adminUser) return <Redirect href="/(dashboard)" />;

  const isReviewer = adminUser.role === 'reviewer';

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#1e3a8a' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
        tabBarActiveTintColor: '#1e3a8a',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { paddingBottom: 4, height: 56 },
        headerRight: () => (
          <TouchableOpacity
            className="mr-3 px-2 py-1"
            disabled={signingOut}
            onPress={async () => {
              const ok = await confirm('Logout', 'Are you sure you want to log out?', {
                confirmText: 'Logout',
                destructive: true,
              });
              if (!ok) return;

              setSigningOut(true);
              try {
                await signOut();
                router.replace('/(auth)/login');
              } finally {
                setSigningOut(false);
              }
            }}
          >
            <Text className="font-semibold text-white">
              {signingOut ? 'Logging out…' : 'Logout'}
            </Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Admin',
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />,
          href: isReviewer ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: 'Members',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
          href: isReviewer ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="firms"
        options={{
          title: 'Firms',
          tabBarIcon: ({ color, size }) => <Building2 size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: 'Payments',
          tabBarIcon: ({ color, size }) => <CreditCard size={size} color={color} />,
          href: isReviewer ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="fraud"
        options={{
          title: 'Fraud',
          tabBarIcon: ({ color, size }) => <AlertTriangle size={size} color={color} />,
          href: isReviewer ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="audit"
        options={{
          title: 'Audit',
          tabBarIcon: ({ color, size }) => <FileText size={size} color={color} />,
          href: isReviewer ? null : undefined,
        }}
      />
    </Tabs>
  );
}
