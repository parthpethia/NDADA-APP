import { useState } from 'react';
import { Text, TouchableOpacity, View, Image } from 'react-native';
import { Tabs, Redirect, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { LoadingScreen } from '@/components/ui';
import {
  LayoutDashboard, Users, Building2, CreditCard,
  AlertTriangle, FileText, Award, Search,
} from 'lucide-react-native';

export default function AdminLayout() {
  const { session, loading, adminUser, signOut, profileReady } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (loading || !profileReady) return <LoadingScreen />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!adminUser) return <Redirect href="/(dashboard)" />;

  const isReviewer = adminUser.role === 'reviewer';

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#14532d' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
        tabBarActiveTintColor: '#15803d',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { paddingBottom: 4, height: 56 },
        headerLeft: () => (
          <Image
            source={require('@/assets/logo-ndada.png')}
            style={{ width: 28, height: 28, marginLeft: 16, borderRadius: 14, backgroundColor: '#fff' }}
            resizeMode="contain"
          />
        ),
        headerRight: () => (
          <View className="flex-row items-center mr-3 gap-2">
            <TouchableOpacity
              className="p-1.5 rounded-md bg-primary-800 active:bg-primary-700"
              onPress={() => router.push('/admin/search')}
            >
              <Search size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              className="rounded-md bg-red-600 px-3 py-1.5 active:bg-red-700"
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
              <Text className="font-semibold text-white text-xs">
                {signingOut ? 'Exit…' : 'Logout'}
              </Text>
            </TouchableOpacity>
          </View>
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
        name="certificates"
        options={{
          title: 'Certs',
          tabBarIcon: ({ color, size }) => <Award size={size} color={color} />,
          href: isReviewer ? null : undefined,
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
        name="audit"
        options={{
          title: 'Audit',
          tabBarIcon: ({ color, size }) => <FileText size={size} color={color} />,
          href: isReviewer ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Global Search',
          href: null,
        }}
      />
      <Tabs.Screen
        name="members/[id]"
        options={{
          title: 'Member details',
          href: null,
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: 'Queue Monitor',
          href: null,
        }}
      />
      <Tabs.Screen
        name="export"
        options={{
          title: 'Export Center',
          href: null,
        }}
      />
      <Tabs.Screen
        name="revenue"
        options={{
          title: 'Revenue Dashboard',
          href: null,
        }}
      />
      <Tabs.Screen
        name="district"
        options={{
          title: 'District Analytics',
          href: null,
        }}
      />
      <Tabs.Screen
        name="security"
        options={{
          title: 'Security Dashboard',
          href: null,
        }}
      />
      <Tabs.Screen
        name="health"
        options={{
          title: 'System Health',
          href: null,
        }}
      />
      <Tabs.Screen
        name="announcements"
        options={{
          title: 'Communications',
          href: null,
        }}
      />
      <Tabs.Screen
        name="renewals"
        options={{
          title: 'Renewals Workflow',
          href: null,
        }}
      />
      <Tabs.Screen
        name="kpi"
        options={{
          title: 'Executive KPIs',
          href: null,
        }}
      />
    </Tabs>
  );
}


