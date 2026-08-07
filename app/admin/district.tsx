import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Alert, TextInput } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui';
import { Map, Users, CreditCard, Award, Filter, AlertTriangle } from 'lucide-react-native';
import { cacheGet, cacheSet, cacheInvalidate } from '@/lib/queryCache';

interface DistrictMetric {
  district: string;
  members_count: number;
  approvals_count: number;
  revenue: number;
  pending_reviews: number;
  certificates_count: number;
}

export default function DistrictAnalyticsScreen() {
  const [districtData, setDistrictData] = useState<DistrictMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchDistrictData = useCallback(async (forceRefetch = false) => {
    if (!forceRefetch) {
      const cached = cacheGet<DistrictMetric[]>('admin:district_analytics', 300_000);
      if (cached) {
        setDistrictData(cached);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_district_analytics');
      if (error) throw error;
      const metricsList = (data || []) as DistrictMetric[];
      setDistrictData(metricsList);
      cacheSet('admin:district_analytics', metricsList);
    } catch (err: any) {
      Alert.alert('Metrics Error', err.message || 'Failed to fetch district analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDistrictData();
  }, [fetchDistrictData]);

  const onRefresh = async () => {
    setRefreshing(true);
    cacheInvalidate('admin:district_analytics');
    await fetchDistrictData(true);
    setRefreshing(false);
  };

  const filteredData = districtData.filter((d) =>
    (d.district || 'Unspecified').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Totals calculations for context
  const totalMembers = districtData.reduce((sum, d) => sum + Number(d.members_count), 0);
  const totalRevenue = districtData.reduce((sum, d) => sum + Number(d.revenue), 0);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#15803d" />
        <Text className="mt-3 text-gray-500 font-medium">Mapping regional data registries...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Search Bar */}
      <View className="border-b border-gray-200 bg-white px-4 py-3">
        <View className="flex-row items-center rounded-lg border border-gray-300 bg-gray-50 px-3">
          <Filter size={18} color="#9ca3af" />
          <TextInput
            className="ml-2 flex-1 py-1.5 text-base text-gray-900"
            placeholder="Search talukas..."
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <ScrollView
        contentContainerClassName="p-4 pb-12"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text className="mb-4 text-xl font-bold text-gray-900">Regional Taluka Analytics</Text>

        {filteredData.map((d) => {
          const districtName = d.district || 'Unspecified';
          const memberCount = Number(d.members_count);
          const approvalsCount = Number(d.approvals_count);
          const revenue = Number(d.revenue);
          const pendingReviews = Number(d.pending_reviews);
          const certCount = Number(d.certificates_count);

          const approvalRate = memberCount > 0 ? ((approvalsCount / memberCount) * 100).toFixed(0) : '0';
          const densityShare = totalMembers > 0 ? ((memberCount / totalMembers) * 100).toFixed(1) : '0';

          return (
            <Card key={districtName} className="mb-4">
              <View className="flex-row justify-between items-start border-b border-gray-100 pb-2 mb-3">
                <View className="flex-row items-center gap-2">
                  <Map size={16} color="#15803d" />
                  <Text className="text-base font-bold text-gray-900">{districtName}</Text>
                </View>
                <View className="bg-primary-50 px-2.5 py-1 rounded-full border border-primary-100">
                  <Text className="text-[10px] font-bold text-primary-900 uppercase">Share: {densityShare}%</Text>
                </View>
              </View>

              <View className="gap-2">
                <View className="flex-row justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <Users size={14} color="#6b7280" />
                    <Text className="text-xs text-gray-500 font-medium">Total Registered Members</Text>
                  </View>
                  <Text className="text-xs font-bold text-gray-900">{memberCount}</Text>
                </View>

                <View className="flex-row justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <CreditCard size={14} color="#6b7280" />
                    <Text className="text-xs text-gray-500 font-medium">Regional Revenue Yield</Text>
                  </View>
                  <Text className="text-xs font-bold text-gray-900">₹{revenue.toLocaleString('en-IN')}</Text>
                </View>

                <View className="flex-row justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <Award size={14} color="#6b7280" />
                    <Text className="text-xs text-gray-500 font-medium">Certificates Handed</Text>
                  </View>
                  <Text className="text-xs font-semibold text-gray-900">{certCount}</Text>
                </View>

                <View className="flex-row justify-between border-t border-gray-50 pt-2 mt-1">
                  <Text className="text-xs text-gray-400 font-semibold uppercase">Approval metrics</Text>
                  <Text className="text-xs font-extrabold text-green-700">{approvalRate}% Approved ({approvalsCount}/{memberCount})</Text>
                </View>

                {pendingReviews > 0 && (
                  <View className="flex-row items-center gap-2 bg-yellow-50 p-2.5 rounded-lg border border-yellow-100 mt-2">
                    <AlertTriangle size={14} color="#ca8a04" />
                    <Text className="text-[10px] text-yellow-800 font-bold flex-1">
                      {pendingReviews} reviews pending for approved payment candidates.
                    </Text>
                  </View>
                )}
              </View>
            </Card>
          );
        })}

        {filteredData.length === 0 && (
          <Text className="text-center text-gray-400 py-12">No taluka data records found.</Text>
        )}
      </ScrollView>
    </View>
  );
}
