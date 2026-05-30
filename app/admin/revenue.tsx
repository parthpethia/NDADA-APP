import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui';
import { CreditCard, Calendar, ArrowUpRight, TrendingUp, AlertTriangle } from 'lucide-react-native';

interface FinancialMetrics {
  revenue_today: number;
  revenue_month: number;
  revenue_year: number;
  cash_revenue: number;
  online_revenue: number;
  pending_payments: number;
  failed_payments: number;
}

export default function RevenueDashboardScreen() {
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRevenueMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_financial_metrics');
      if (error) throw error;
      setMetrics(data as FinancialMetrics);
    } catch (err: any) {
      Alert.alert('Metrics Error', err.message || 'Failed to fetch financial metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRevenueMetrics();
  }, [fetchRevenueMetrics]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRevenueMetrics();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#15803d" />
        <Text className="mt-3 text-gray-500 font-medium">Analyzing Ledger metrics...</Text>
      </View>
    );
  }

  if (!metrics) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 p-4">
        <AlertTriangle size={48} color="#f59e0b" />
        <Text className="mt-3 text-lg font-bold text-gray-900">Ledger Unreachable</Text>
      </View>
    );
  }

  // Calculate percentages
  const totalCollected = metrics.cash_revenue + metrics.online_revenue;
  const cashPct = totalCollected > 0 ? ((metrics.cash_revenue / totalCollected) * 100).toFixed(1) : '0';
  const onlinePct = totalCollected > 0 ? ((metrics.online_revenue / totalCollected) * 100).toFixed(1) : '0';

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerClassName="p-4 pb-12"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text className="mb-4 text-xl font-bold text-gray-900">Revenue & Financial Center</Text>

        {/* Primary Totals Panels */}
        <View className="gap-3 mb-4">
          <Card className="border-l-4 border-l-green-600 bg-white p-4">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-[10px] uppercase font-bold text-gray-400">Total Revenue (Year-to-Date)</Text>
              <TrendingUp size={16} color="#16a34a" />
            </View>
            <Text className="text-3xl font-extrabold text-gray-900">₹{metrics.revenue_year.toLocaleString('en-IN')}</Text>
          </Card>

          <View className="flex-row gap-3">
            <Card className="flex-1 bg-white p-3.5 border-l-4 border-l-primary-600">
              <View className="flex-row justify-between items-center mb-1">
                <Text className="text-[9px] uppercase font-bold text-gray-400">This Month</Text>
                <Calendar size={14} color="#16a34a" />
              </View>
              <Text className="text-lg font-extrabold text-gray-900">₹{metrics.revenue_month.toLocaleString('en-IN')}</Text>
            </Card>

            <Card className="flex-1 bg-white p-3.5 border-l-4 border-l-indigo-600">
              <View className="flex-row justify-between items-center mb-1">
                <Text className="text-[9px] uppercase font-bold text-gray-400">Today</Text>
                <ArrowUpRight size={14} color="#4f46e5" />
              </View>
              <Text className="text-lg font-extrabold text-gray-900">₹{metrics.revenue_today.toLocaleString('en-IN')}</Text>
            </Card>
          </View>
        </View>

        {/* Payment Methods splits */}
        <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Payment Method Split</Text>
        <Card className="mb-4">
          <View className="flex-row justify-between items-center border-b border-gray-100 pb-2 mb-3">
            <CreditCard size={16} color="#15803d" />
            <Text className="text-[10px] uppercase font-bold text-primary-900">Breakdown Metrics</Text>
          </View>

          <View className="gap-3">
            <View>
              <View className="flex-row justify-between mb-1">
                <Text className="text-xs font-medium text-gray-600">Online Transactions</Text>
                <Text className="text-xs font-bold text-gray-900">₹{metrics.online_revenue.toLocaleString('en-IN')} ({onlinePct}%)</Text>
              </View>
              <View className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <View className="h-2 bg-primary-600 rounded-full" style={{ width: `${onlinePct}%` as any }} />
              </View>
            </View>

            <View>
              <View className="flex-row justify-between mb-1">
                <Text className="text-xs font-medium text-gray-600">Verified Cash Payments</Text>
                <Text className="text-xs font-bold text-gray-900">₹{metrics.cash_revenue.toLocaleString('en-IN')} ({cashPct}%)</Text>
              </View>
              <View className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <View className="h-2 bg-green-600 rounded-full" style={{ width: `${cashPct}%` as any }} />
              </View>
            </View>
          </View>
        </Card>

        {/* Accounts Payment Pipeline Statuses */}
        <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Pipeline Statuses</Text>
        <View className="flex-row gap-3">
          <Card className="flex-1 bg-white p-3.5 border border-yellow-100">
            <Text className="text-[10px] uppercase font-bold text-yellow-600 mb-1">Pending Invoices</Text>
            <Text className="text-2xl font-extrabold text-gray-900">{metrics.pending_payments}</Text>
            <Text className="text-[9px] text-gray-400 mt-0.5">Awaiting transactions</Text>
          </Card>

          <Card className="flex-1 bg-white p-3.5 border border-red-100">
            <Text className="text-[10px] uppercase font-bold text-red-600 mb-1">Failed Attempts</Text>
            <Text className="text-2xl font-extrabold text-gray-900">{metrics.failed_payments}</Text>
            <Text className="text-[9px] text-gray-400 mt-0.5">Rejected charges</Text>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
