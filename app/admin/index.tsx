import { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui';
import { DashboardStats } from '@/types';
import {
  Users, Building2, CreditCard, Award, Clock,
  TrendingUp, Map, Shield, Activity, Megaphone, BarChart2
} from 'lucide-react-native';

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    total_members: 0,
    total_firms: 0,
    payments_completed: 0,
    certificates_issued: 0,
    pending_reviews: 0,
  });
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    const [accounts, payments, certs, pending] = await Promise.all([
      supabase.from('accounts').select('id', { count: 'exact', head: true }),
      supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'paid'),
      supabase.from('certificates').select('id', { count: 'exact', head: true }),
      supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
    ]);

    setStats({
      total_members: accounts.count || 0,
      total_firms: accounts.count || 0,  // One account = one firm now
      payments_completed: payments.count || 0,
      certificates_issued: certs.count || 0,
      pending_reviews: pending.count || 0,
    });
  };

  useEffect(() => { fetchStats(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
  };

  const widgets = [
    { label: 'Total Members', value: stats.total_members, icon: Users, color: '#1d4ed8', bg: 'bg-blue-100' },
    { label: 'Total Firms', value: stats.total_firms, icon: Building2, color: '#7c3aed', bg: 'bg-purple-100' },
    { label: 'Payments Done', value: stats.payments_completed, icon: CreditCard, color: '#15803d', bg: 'bg-green-100' },
    { label: 'Certificates', value: stats.certificates_issued, icon: Award, color: '#0891b2', bg: 'bg-cyan-100' },
    { label: 'Pending Reviews', value: stats.pending_reviews, icon: Clock, color: '#ca8a04', bg: 'bg-yellow-100' },
  ];

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerClassName="p-4 pb-8"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text className="mb-4 text-2xl font-bold text-gray-900">Admin Dashboard</Text>

      <View className="flex-row flex-wrap gap-3">
        {widgets.map((w) => (
          <Card key={w.label} className="min-w-[160px] flex-1">
            <View className="flex-row items-center gap-3">
              <View className={`rounded-lg p-2 ${w.bg}`}>
                <w.icon size={22} color={w.color} />
              </View>
              <View>
                <Text className="text-2xl font-bold text-gray-900">{w.value}</Text>
                <Text className="text-xs text-gray-500">{w.label}</Text>
              </View>
            </View>
          </Card>
        ))}
      </View>

      {/* Operational Tools Section */}
      {/* Campaigns & Communications Section */}
      <Text className="mt-6 mb-3 text-base font-bold text-gray-800 uppercase tracking-wider">Campaigns & Communications</Text>
      
      <View className="flex-row gap-3 mb-4">
        <TouchableOpacity 
          className="flex-1 bg-white border border-gray-200 p-4 rounded-xl items-center gap-2 shadow-sm"
          onPress={() => router.push('/admin/announcements')}
        >
          <View className="p-3 bg-rose-50 rounded-full">
            <Megaphone size={22} color="#e11d48" />
          </View>
          <Text className="font-bold text-gray-900 text-sm">Campaigns</Text>
          <Text className="text-[10px] text-gray-400 text-center">Broadcast & target feed</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          className="flex-1 bg-white border border-gray-200 p-4 rounded-xl items-center gap-2 shadow-sm"
          onPress={() => router.push('/admin/renewals')}
        >
          <View className="p-3 bg-amber-50 rounded-full">
            <Clock size={22} color="#d97706" />
          </View>
          <Text className="font-bold text-gray-900 text-sm">Renewals</Text>
          <Text className="text-[10px] text-gray-400 text-center">Manage expirations</Text>
        </TouchableOpacity>
      </View>

      {/* Operational Tools Section */}
      <Text className="mt-4 mb-3 text-base font-bold text-gray-800 uppercase tracking-wider">Operational Tools</Text>
      
      <View className="flex-row gap-3 mb-4">
        <TouchableOpacity 
          className="flex-1 bg-white border border-gray-200 p-4 rounded-xl items-center gap-2 shadow-sm"
          onPress={() => router.push('/admin/queue')}
        >
          <View className="p-3 bg-blue-50 rounded-full">
            <Award size={22} color="#1e3a8a" />
          </View>
          <Text className="font-bold text-gray-900 text-sm">Cert Queue</Text>
          <Text className="text-[10px] text-gray-400 text-center">Monitor pipeline jobs</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          className="flex-1 bg-white border border-gray-200 p-4 rounded-xl items-center gap-2 shadow-sm"
          onPress={() => router.push('/admin/export')}
        >
          <View className="p-3 bg-indigo-50 rounded-full">
            <Users size={22} color="#4f46e5" />
          </View>
          <Text className="font-bold text-gray-900 text-sm">Export Center</Text>
          <Text className="text-[10px] text-gray-400 text-center">Compile CSV files</Text>
        </TouchableOpacity>
      </View>

      {/* Analytics & Reports Section */}
      <Text className="mt-4 mb-3 text-base font-bold text-gray-800 uppercase tracking-wider">Analytics & Reports</Text>

      <View className="gap-3">
        <TouchableOpacity 
          className="bg-white border border-gray-200 p-4 rounded-xl items-center flex-row gap-3 shadow-sm"
          onPress={() => router.push('/admin/kpi')}
        >
          <View className="p-3 bg-cyan-50 rounded-full">
            <BarChart2 size={22} color="#0891b2" />
          </View>
          <View className="flex-1">
            <Text className="font-bold text-gray-900 text-sm">Executive KPIs</Text>
            <Text className="text-[10px] text-gray-400">MoM growth & review velocities</Text>
          </View>
        </TouchableOpacity>

        <View className="flex-row gap-3">
          <TouchableOpacity 
            className="flex-1 bg-white border border-gray-200 p-4 rounded-xl items-center gap-2 shadow-sm"
            onPress={() => router.push('/admin/revenue')}
          >
            <View className="p-3 bg-green-50 rounded-full">
              <TrendingUp size={22} color="#16a34a" />
            </View>
            <Text className="font-bold text-gray-900 text-sm">Revenue stats</Text>
            <Text className="text-[10px] text-gray-400 text-center">Ledger performance</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            className="flex-1 bg-white border border-gray-200 p-4 rounded-xl items-center gap-2 shadow-sm"
            onPress={() => router.push('/admin/district')}
          >
            <View className="p-3 bg-purple-50 rounded-full">
              <Map size={22} color="#7c3aed" />
            </View>
            <Text className="font-bold text-gray-900 text-sm">District yield</Text>
            <Text className="text-[10px] text-gray-400 text-center">Regional densities</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row gap-3">
          <TouchableOpacity 
            className="flex-1 bg-white border border-gray-200 p-4 rounded-xl items-center gap-2 shadow-sm"
            onPress={() => router.push('/admin/security')}
          >
            <View className="p-3 bg-red-50 rounded-full">
              <Shield size={22} color="#dc2626" />
            </View>
            <Text className="font-bold text-gray-900 text-sm">Security Audits</Text>
            <Text className="text-[10px] text-gray-400 text-center">Access & abort logs</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            className="flex-1 bg-white border border-gray-200 p-4 rounded-xl items-center gap-2 shadow-sm"
            onPress={() => router.push('/admin/health')}
          >
            <View className="p-3 bg-amber-50 rounded-full">
              <Activity size={22} color="#d97706" />
            </View>
            <Text className="font-bold text-gray-900 text-sm">System Health</Text>
            <Text className="text-[10px] text-gray-400 text-center">Database telemetry</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

