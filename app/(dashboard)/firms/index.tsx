import { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card, StatusBadge, Button, EmptyState } from '@/components/ui';
import { Account } from '@/types';

import { formatDate } from '@/lib/utils';

export default function FirmsListScreen() {
  const { member } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAccount = async () => {
    if (!member) return;
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', member.id)
      .single();
    setAccount(data || null);
  };

  useEffect(() => {
    fetchAccount();
  }, [member]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAccount();
    setRefreshing(false);
  };

  if (!account) {
    return (
      <EmptyState
        title="No Account Found"
        message="Your firm details are not registered yet. Please complete your registration."
      >
        <Button title="Register Your Firm" onPress={() => router.push('/(dashboard)/firms/new')} />
      </EmptyState>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerClassName="p-4 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push(`/(dashboard)/firms/${account.id}`)}
        >
          <Card className="mb-3">
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <Text className="text-lg font-semibold text-gray-900">{account.firm_name}</Text>
                <Text className="mt-0.5 text-sm capitalize text-gray-500">
                  {account.firm_type.replace('_', ' ')}
                </Text>
              </View>
              <StatusBadge status={account.approval_status} />
            </View>

            <View className="mt-3 border-t border-gray-100 pt-3">
              <View className="mt-1 flex-row justify-between">
                <Text className="text-xs text-gray-500">License #</Text>
                <Text className="text-xs font-medium text-gray-700">{account.license_number}</Text>
              </View>
              <View className="mt-1 flex-row justify-between">
                <Text className="text-xs text-gray-500">Registration #</Text>
                <Text className="text-xs font-medium text-gray-700">{account.registration_number}</Text>
              </View>
              {account.gst_number && (
                <View className="mt-1 flex-row justify-between">
                  <Text className="text-xs text-gray-500">GST #</Text>
                  <Text className="text-xs font-medium text-gray-700">{account.gst_number}</Text>
                </View>
              )}
              <View className="mt-1 flex-row justify-between">
                <Text className="text-xs text-gray-500">Submitted</Text>
                <Text className="text-xs font-medium text-gray-700">{formatDate(account.created_at)}</Text>
              </View>
              <Text className="mt-3 text-xs font-medium text-primary-700">
                Tap to view full form details
              </Text>
            </View>

            {account.approval_status === 'rejected' && account.rejection_reason && (
              <View className="mt-3 rounded-lg bg-red-50 p-3">
                <Text className="text-xs font-medium text-red-700">
                  Rejection Reason: {account.rejection_reason}
                </Text>
              </View>
            )}
          </Card>
        </TouchableOpacity>
      </ScrollView>

      <View className="border-t border-gray-200 bg-white p-4">
        {account.payment_status !== 'paid' ? (
          <Button title="Go to Payment" onPress={() => router.push('/cart')} />
        ) : (
          <Button
            title="View Firm Details"
            variant="outline"
            onPress={() => router.push(`/(dashboard)/firms/${account.id}`)}
          />
        )}
      </View>
    </View>
  );
}
