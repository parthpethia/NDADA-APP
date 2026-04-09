import { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui';
import { DashboardStats } from '@/types';
import {
  Users, Building2, CreditCard, Award, Clock, AlertTriangle,
} from 'lucide-react-native';

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    total_members: 0,
    total_firms: 0,
    payments_completed: 0,
    certificates_issued: 0,
    pending_reviews: 0,
    suspicious_accounts: 0,
  });
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    const [members, firms, payments, certs, pending, fraud] = await Promise.all([
      supabase.from('members').select('id', { count: 'exact', head: true }),
      supabase.from('firms').select('id', { count: 'exact', head: true }),
      supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'paid'),
      supabase.from('certificates').select('id', { count: 'exact', head: true }),
      supabase.from('firms').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
      supabase.from('fraud_flags').select('id', { count: 'exact', head: true }).eq('resolved', false),
    ]);

    setStats({
      total_members: members.count || 0,
      total_firms: firms.count || 0,
      payments_completed: payments.count || 0,
      certificates_issued: certs.count || 0,
      pending_reviews: pending.count || 0,
      suspicious_accounts: fraud.count || 0,
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
    { label: 'Fraud Flags', value: stats.suspicious_accounts, icon: AlertTriangle, color: '#dc2626', bg: 'bg-red-100' },
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
    </ScrollView>
  );
}
