import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Alert, TextInput } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card, Select } from '@/components/ui';
import { Shield, ShieldAlert, Key, CreditCard, Award, Filter } from 'lucide-react-native';
import { formatDateTime } from '@/lib/utils';

interface SecurityMetrics {
  failed_logins: number;
  payment_failures: number;
  suspicious_flags: number;
  queue_failures: number;
  admin_actions_today: number;
}

interface SecurityLog {
  id: string;
  event_type: string;
  user_id: string | null;
  ip_address: string | null;
  details: any;
  created_at: string;
}

export default function SecurityDashboardScreen() {
  const [metrics, setMetrics] = useState<SecurityMetrics | null>(null);
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [daysBack, setDaysBack] = useState('30');
  const [logFilter, setLogFilter] = useState('all');

  const fetchSecurityData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Metrics from RPC
      const days = parseInt(daysBack, 10) || 30;
      const { data: metricsData, error: metricsErr } = await supabase.rpc('get_security_metrics', {
        p_days_back: days,
      });
      if (metricsErr) throw metricsErr;
      setMetrics(metricsData as SecurityMetrics);

      // 2. Fetch Recent Security Events / Audit Logs fallback list
      const { data: logData, error: logErr } = await supabase
        .from('security_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (logErr) throw logErr;
      setLogs((logData || []) as SecurityLog[]);
    } catch (err: any) {
      Alert.alert('Metrics Error', err.message || 'Failed to fetch security analytics');
    } finally {
      setLoading(false);
    }
  }, [daysBack]);

  useEffect(() => {
    fetchSecurityData();
  }, [fetchSecurityData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSecurityData();
    setRefreshing(false);
  };

  const filteredLogs = logs.filter((l) => {
    if (logFilter === 'all') return true;
    return l.event_type === logFilter;
  });

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#15803d" />
        <Text className="mt-3 text-gray-500 font-medium">Scanning system security logs...</Text>
      </View>
    );
  }

  if (!metrics) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 p-4">
        <ShieldAlert size={48} color="#ef4444" />
        <Text className="mt-3 text-lg font-bold text-gray-900">Security Gateway Offline</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Date Window Filter Bar */}
      <View className="border-b border-gray-200 bg-white px-4 py-3 gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-bold text-gray-500 uppercase">Analysis Window</Text>
          <View className="w-[160px]">
            <Select
              value={daysBack}
              options={[
                { label: 'Past 7 Days', value: '7' },
                { label: 'Past 30 Days', value: '30' },
                { label: 'Past 90 Days', value: '90' }
              ]}
              onValueChange={setDaysBack}
            />
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerClassName="p-4 pb-12"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text className="mb-4 text-xl font-bold text-gray-900">Security & Access Audits</Text>

        {/* Aggregated Statistics Cards */}
        <View className="flex-row flex-wrap gap-2 mb-4">
          <Card className="flex-1 min-w-[45%] bg-white p-3 border-l-4 border-l-red-600">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-[10px] uppercase font-bold text-gray-400">Failed Logins</Text>
              <Key size={14} color="#dc2626" />
            </View>
            <Text className="text-lg font-extrabold text-gray-900">{metrics.failed_logins}</Text>
          </Card>

          <Card className="flex-1 min-w-[45%] bg-white p-3 border-l-4 border-l-amber-500">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-[10px] uppercase font-bold text-gray-400">Payment Rejections</Text>
              <CreditCard size={14} color="#d97706" />
            </View>
            <Text className="text-lg font-extrabold text-gray-900">{metrics.payment_failures}</Text>
          </Card>

          <Card className="flex-1 min-w-[45%] bg-white p-3 border-l-4 border-l-orange-600">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-[10px] uppercase font-bold text-gray-400">Suspicious Events</Text>
              <ShieldAlert size={14} color="#ea580c" />
            </View>
            <Text className="text-lg font-extrabold text-gray-900">{metrics.suspicious_flags}</Text>
          </Card>

          <Card className="flex-1 min-w-[45%] bg-white p-3 border-l-4 border-l-yellow-600">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-[10px] uppercase font-bold text-gray-400">Queue Aborts</Text>
              <Award size={14} color="#ca8a04" />
            </View>
            <Text className="text-lg font-extrabold text-gray-900">{metrics.queue_failures}</Text>
          </Card>
        </View>

        {/* Audit actions card */}
        <Card className="mb-4 bg-primary-900/5 border border-primary-100">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold text-primary-950 uppercase tracking-wider">Admin Actions (Today)</Text>
            <Shield size={16} color="#15803d" />
          </View>
          <Text className="text-3xl font-extrabold text-primary-900 mt-1">{metrics.admin_actions_today}</Text>
        </Card>

        {/* Recent logs registry */}
        <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Access Event Console</Text>
        
        {/* Log Filter Selector */}
        <View className="mb-3">
          <Select
            value={logFilter}
            options={[
              { label: 'All Security Events', value: 'all' },
              { label: 'Failed Logins only', value: 'failed_login' },
              { label: 'Suspicious Activities only', value: 'suspicious_activity' }
            ]}
            onValueChange={setLogFilter}
          />
        </View>

        <View className="gap-3">
          {filteredLogs.map((l) => (
            <Card key={l.id}>
              <View className="flex-row justify-between items-start mb-2">
                <View className="flex-1 pr-2">
                  <Text className="text-xs font-bold text-gray-900 uppercase">
                    {l.event_type.replace('_', ' ')}
                  </Text>
                  <Text className="text-[10px] font-semibold text-gray-500 mt-0.5">
                    IP: {l.ip_address || 'Unspecified'} | Caller UUID: {l.user_id?.slice(0, 18) || 'anonymous'}
                  </Text>
                </View>
                <Text className="text-[10px] text-gray-400">{formatDateTime(l.created_at)}</Text>
              </View>

              {l.details && (
                <View className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <Text className="text-[10px] text-gray-600 leading-relaxed font-mono">
                    {typeof l.details === 'object' ? JSON.stringify(l.details) : String(l.details)}
                  </Text>
                </View>
              )}
            </Card>
          ))}

          {filteredLogs.length === 0 && (
            <Text className="text-center text-gray-400 py-12">No recent security events registered.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
