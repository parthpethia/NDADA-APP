import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { LoadingScreen } from '@/components/ui';
import { LayoutDashboard, Building2, Award, User } from 'lucide-react-native';
import { NotificationBell } from './notifications';
import { Image, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function DashboardLayout() {
  const { session, loading, adminUser, profileReady, member, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  // Diagnostic: trace every render of the dashboard layout with full state
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[AUTH-FORENSIC ${ts}] DashboardLayout render: session=${!!session} loading=${loading} profileReady=${profileReady} adminUser=${!!adminUser} member=${!!member}`);

  if (loading || !profileReady) {
    console.log(`[AUTH-FORENSIC ${ts}] DashboardLayout: loading/!profileReady → LoadingScreen`);
    return <LoadingScreen />;
  }
  if (!session) {
    console.log(`[AUTH-FORENSIC ${ts}] DashboardLayout: no session → Redirect to login`);
    return <Redirect href="/(auth)/login" />;
  }
  if (adminUser) {
    console.log(`[AUTH-FORENSIC ${ts}] DashboardLayout: adminUser detected → Redirect to /admin`);
    return <Redirect href="/admin" />;
  }
  if (member?.account_status === 'deleted') {
    console.log(`[AUTH-FORENSIC ${ts}] DashboardLayout: account deleted → signOut + Redirect to login`);
    signOut();
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#166534' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
        tabBarActiveTintColor: '#15803d',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          paddingBottom: insets.bottom > 0 ? insets.bottom : 6,
          height: 60 + (insets.bottom > 0 ? insets.bottom - 6 : 0),
          paddingTop: 6,
        },
        headerLeft: () => (
          <Image
            source={require('@/assets/logo-ndada.png')}
            style={{ width: 28, height: 28, marginLeft: 16, borderRadius: 14, backgroundColor: '#fff' }}
            resizeMode="contain"
          />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />,
          headerRight: () => <NotificationBell />,
        }}
      />
      <Tabs.Screen
        name="firms"
        options={{
          title: 'Firms',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Building2 size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="certificate"
        options={{
          title: 'Certificate',
          tabBarIcon: ({ color, size }) => <Award size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
      {/* Keep payment hidden but accessible within tabs */}
      <Tabs.Screen
        name="payment"
        options={{
          title: 'Payment',
          href: null,
        }}
      />

      {/* Transaction Success page (hidden, navigated to after successful payment) */}
      <Tabs.Screen
        name="payment-success"
        options={{
          title: 'Transaction Successful',
          href: null,
        }}
      />
      {/* Transaction Failed page (hidden, navigated to on failure/cancel) */}
      <Tabs.Screen
        name="payment-failed"
        options={{
          title: 'Transaction Unsuccessful',
          href: null,
        }}
      />
      {/* Hidden screens — accessible via navigation, not shown in tab bar */}
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          href: null,
        }}
      />
      <Tabs.Screen
        name="timeline"
        options={{
          title: 'Timeline',
          href: null,
        }}
      />
    </Tabs>
  );
}
