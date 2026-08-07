import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { BarChart2, TrendingUp, DollarSign, Clock, ShieldCheck, Map } from 'lucide-react-native';
import { cacheGet, cacheSet, cacheInvalidate } from '@/lib/queryCache';

interface ExecutiveKPIs {
  conversion_rate_pct: number;
  outstanding_invoices_rupees: number;
  average_review_hours: number;
  monthly_growth_rate_pct: number;
}

interface DistrictYield {
  district: string;
  members_count: number;
  revenue: number;
}

export default function ExecutiveKPIDashboardScreen() {
  const [kpis, setKpis] = useState<ExecutiveKPIs | null>(null);
  const [districtYields, setDistrictYields] = useState<DistrictYield[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchKPIData = useCallback(async (forceRefetch = false) => {
    const cachedKPI = forceRefetch ? undefined : cacheGet<ExecutiveKPIs>('admin:executive_kpis', 300_000);
    const cachedDistRaw = forceRefetch ? undefined : cacheGet<any[]>('admin:district_analytics', 300_000);

    if (cachedKPI && cachedDistRaw) {
      setKpis(cachedKPI);
      setDistrictYields(
        cachedDistRaw.map((d) => ({
          district: d.district || 'Unspecified',
          members_count: Number(d.members_count),
          revenue: Number(d.revenue),
        }))
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // 1. Fetch Executive KPIs
      let finalKPIs = cachedKPI;
      if (!finalKPIs) {
        const { data: kpiData, error: kpiErr } = await supabase.rpc('get_executive_kpis');
        if (kpiErr) throw kpiErr;
        finalKPIs = kpiData as ExecutiveKPIs;
        cacheSet('admin:executive_kpis', finalKPIs);
      }
      setKpis(finalKPIs);

      // 2. Fetch District Yields
      let finalDistRaw = cachedDistRaw;
      if (!finalDistRaw) {
        const { data: distData, error: distErr } = await supabase.rpc('get_district_analytics');
        if (distErr) throw distErr;
        finalDistRaw = (distData || []) as any[];
        cacheSet('admin:district_analytics', finalDistRaw);
      }
      const distList = finalDistRaw || [];
      setDistrictYields(
        distList.map((d: any) => ({
          district: d.district || 'Unspecified',
          members_count: Number(d.members_count),
          revenue: Number(d.revenue),
        }))
      );
    } catch (err: any) {
      Alert.alert('Metrics Error', err.message || 'Failed to fetch executive dashboard diagnostics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKPIData();
  }, [fetchKPIData]);

  const onRefresh = async () => {
    setRefreshing(true);
    cacheInvalidate('admin:executive_kpis');
    cacheInvalidate('admin:district_analytics');
    await fetchKPIData(true);
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#15803d" />
        <Text className="mt-3 text-gray-500 font-medium">Loading Executive aggregates...</Text>
      </View>
    );
  }

  if (!kpis) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 p-4">
        <BarChart2 size={48} color="#ef4444" />
        <Text className="mt-3 text-lg font-bold text-gray-900">Dashboard Unavailable</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerClassName="p-4 pb-12"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text className="mb-4 text-xl font-bold text-gray-900">Executive KPI Console</Text>

        {/* 1. Primary KPI Aggregates Grid */}
        <View className="flex-row flex-wrap gap-2 mb-4">
          
          {/* Conversion Yield Card */}
          <Card className="flex-1 min-w-[45%] bg-white p-3 border border-gray-100 shadow-sm">
            <View className="flex-row justify-between items-center mb-1">
              <Text numberOfLines={1} className="text-[10px] uppercase font-bold text-gray-400">Conversion Rate</Text>
              <ShieldCheck size={14} color="#16a34a" />
            </View>
            <Text className="text-xl font-extrabold text-gray-900">{kpis.conversion_rate_pct}%</Text>
            <Text numberOfLines={1} className="text-[9px] text-gray-400 mt-1">Approved to total registrations ratio.</Text>
          </Card>

          {/* Month-over-Month Growth Card */}
          <Card className="flex-1 min-w-[45%] bg-white p-3 border border-gray-100 shadow-sm">
            <View className="flex-row justify-between items-center mb-1">
              <Text numberOfLines={1} className="text-[10px] uppercase font-bold text-gray-400">MoM Growth Rate</Text>
              <TrendingUp size={14} color={kpis.monthly_growth_rate_pct >= 0 ? '#16a34a' : '#dc2626'} />
            </View>
            <Text className={`text-xl font-extrabold ${kpis.monthly_growth_rate_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {kpis.monthly_growth_rate_pct >= 0 ? '+' : ''}{kpis.monthly_growth_rate_pct}%
            </Text>
            <Text numberOfLines={1} className="text-[9px] text-gray-400 mt-1">Current month vs previous month.</Text>
          </Card>

          {/* Outstanding Invoice Card */}
          <Card className="flex-1 min-w-[45%] bg-white p-3 border border-gray-100 shadow-sm">
            <View className="flex-row justify-between items-center mb-1">
              <Text numberOfLines={1} className="text-[10px] uppercase font-bold text-gray-400">Outstanding Invoices</Text>
              <DollarSign size={14} color="#16a34a" />
            </View>
            <Text className="text-lg font-extrabold text-primary-600">₹{kpis.outstanding_invoices_rupees.toLocaleString('en-IN')}</Text>
            <Text numberOfLines={1} className="text-[9px] text-gray-400 mt-1">Uncollected pending fee receivables.</Text>
          </Card>

          {/* Operational Review Speed Card */}
          <Card className="flex-1 min-w-[45%] bg-white p-3 border border-gray-100 shadow-sm">
            <View className="flex-row justify-between items-center mb-1">
              <Text numberOfLines={1} className="text-[10px] uppercase font-bold text-gray-400">Review Turnaround</Text>
              <Clock size={14} color="#4f46e5" />
            </View>
            <Text className="text-lg font-extrabold text-gray-900">{kpis.average_review_hours}h</Text>
            <Text numberOfLines={1} className="text-[9px] text-gray-400 mt-1">Average submission to review latency.</Text>
          </Card>
        </View>

        {/* 2. District Yield Density Rankings */}
        <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Regional Yield Densities</Text>
        <Card className="mb-4">
          <View className="flex-row items-center gap-2 border-b border-gray-100 pb-2 mb-3">
            <Map size={16} color="#15803d" />
            <Text className="text-xs font-bold text-primary-900 uppercase">Taluka rankings by density</Text>
          </View>

          <View className="gap-2.5">
            {districtYields.map((d, index) => (
              <View key={d.district} className="flex-row justify-between items-center border-b border-gray-50 pb-2">
                <View className="flex-row items-center gap-2">
                  <Text className="text-xs font-bold text-gray-400">#{index + 1}</Text>
                  <View>
                    <Text className="text-xs font-bold text-gray-900">{d.district}</Text>
                    <Text className="text-[9px] text-gray-400 font-semibold">{d.members_count} Members</Text>
                  </View>
                </View>
                <Text className="text-xs font-bold text-green-700">₹{d.revenue.toLocaleString('en-IN')}</Text>
              </View>
            ))}

            {districtYields.length === 0 && (
              <Text className="text-center text-gray-400 py-4 text-xs italic">No regional yields calculated.</Text>
            )}
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}
