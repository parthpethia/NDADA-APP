import { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Link, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card, StatusBadge, Button, EmptyState } from '@/components/ui';
import { Firm } from '@/types';
import { Plus } from 'lucide-react-native';
import { formatDate } from '@/lib/utils';

export default function FirmsListScreen() {
  const { member } = useAuth();
  const [firms, setFirms] = useState<Firm[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFirms = async () => {
    if (!member) return;
    const { data } = await supabase
      .from('firms')
      .select('*')
      .eq('member_id', member.id)
      .order('created_at', { ascending: false });
    setFirms(data || []);
  };

  useEffect(() => {
    fetchFirms();
  }, [member]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchFirms();
    setRefreshing(false);
  };

  if (firms.length === 0) {
    return (
      <EmptyState
        title="No Firms Registered"
        message="Register your first firm to get started with your membership."
      >
        <Link href="/(dashboard)/firms/new" asChild>
          <Button title="Register a Firm" />
        </Link>
      </EmptyState>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerClassName="p-4 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {firms.map((firm) => (
          <TouchableOpacity
            key={firm.id}
            activeOpacity={0.85}
            onPress={() => router.push(`/(dashboard)/firms/${firm.id}`)}
          >
            <Card className="mb-3">
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <Text className="text-lg font-semibold text-gray-900">{firm.firm_name}</Text>
                  <Text className="mt-0.5 text-sm capitalize text-gray-500">
                    {firm.firm_type.replace('_', ' ')}
                  </Text>
                </View>
                <StatusBadge status={firm.approval_status} />
              </View>

              <View className="mt-3 border-t border-gray-100 pt-3">
                <View className="mt-1 flex-row justify-between">
                  <Text className="text-xs text-gray-500">License #</Text>
                  <Text className="text-xs font-medium text-gray-700">{firm.license_number}</Text>
                </View>
                <View className="mt-1 flex-row justify-between">
                  <Text className="text-xs text-gray-500">Registration #</Text>
                  <Text className="text-xs font-medium text-gray-700">{firm.registration_number}</Text>
                </View>
                {firm.gst_number && (
                  <View className="mt-1 flex-row justify-between">
                    <Text className="text-xs text-gray-500">GST #</Text>
                    <Text className="text-xs font-medium text-gray-700">{firm.gst_number}</Text>
                  </View>
                )}
                <View className="mt-1 flex-row justify-between">
                  <Text className="text-xs text-gray-500">Submitted</Text>
                  <Text className="text-xs font-medium text-gray-700">{formatDate(firm.created_at)}</Text>
                </View>
                <Text className="mt-3 text-xs font-medium text-primary-700">
                  Tap to view full form details
                </Text>
              </View>

              {firm.approval_status === 'rejected' && firm.rejection_reason && (
                <View className="mt-3 rounded-lg bg-red-50 p-3">
                  <Text className="text-xs font-medium text-red-700">
                    Rejection Reason: {firm.rejection_reason}
                  </Text>
                </View>
              )}
            </Card>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View className="border-t border-gray-200 bg-white p-4">
        <Link href="/(dashboard)/firms/new" asChild>
          <Button title="Register New Firm" />
        </Link>
      </View>
    </View>
  );
}
