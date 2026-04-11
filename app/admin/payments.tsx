import { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card, StatusBadge } from '@/components/ui';
import { Payment } from '@/types';
import { formatDate, formatCurrency } from '@/lib/utils';

interface PaymentWithMember extends Payment {
  member_name: string;
  member_email: string;
}

export default function AdminPaymentsScreen() {
  const [payments, setPayments] = useState<PaymentWithMember[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const showMessage = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      const webAlert = (globalThis as any)?.alert as ((text?: string) => void) | undefined;
      if (typeof webAlert === 'function') {
        webAlert(`${title}: ${message}`);
        return;
      }
    }
    Alert.alert(title, message);
  };

  const fetchPayments = async () => {
    const { data } = await supabase
      .from('payments')
      .select('*, members(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(50);

    setPayments(
      (data || []).map((p: any) => ({
        ...p,
        member_name: p.members?.full_name || 'Unknown',
        member_email: p.members?.email || '',
        members: undefined,
      }))
    );
  };

  useEffect(() => { fetchPayments(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPayments();
    setRefreshing(false);
  };

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerClassName="p-4 pb-8"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text className="mb-4 text-xl font-bold text-gray-900">Payment Logs</Text>

      {actionError ? (
        <View className="mb-3 rounded-lg bg-red-50 p-3">
          <Text className="text-sm text-red-700">{actionError}</Text>
        </View>
      ) : null}

      {payments.map((p) => (
        <Card key={p.id} className="mb-3">
          <View className="flex-row items-start justify-between">
            <View className="flex-1">
              <Text className="font-semibold text-gray-900">{p.member_name}</Text>
              <Text className="text-xs text-gray-500">{p.member_email}</Text>
            </View>
            <StatusBadge status={p.status} />
          </View>

          <View className="mt-3 gap-1">
            <View className="flex-row justify-between">
              <Text className="text-xs text-gray-500">Amount</Text>
              <Text className="text-xs font-medium text-gray-700">
                {formatCurrency(p.amount / 100, p.currency.toUpperCase())}
              </Text>
            </View>

            {p.provider ? (
              <View className="flex-row justify-between">
                <Text className="text-xs text-gray-500">Provider</Text>
                <Text className="text-xs text-gray-700">{String(p.provider)}</Text>
              </View>
            ) : null}

            {p.razorpay_payment_id ? (
              <View className="flex-row justify-between">
                <Text className="text-xs text-gray-500">Razorpay Payment ID</Text>
                <Text className="text-xs text-gray-700">{String(p.razorpay_payment_id)}</Text>
              </View>
            ) : null}

            <View className="flex-row justify-between">
              <Text className="text-xs text-gray-500">Date</Text>
              <Text className="text-xs text-gray-700">{formatDate(p.created_at)}</Text>
            </View>
          </View>
        </Card>
      ))}

      {payments.length === 0 && (
        <Text className="py-12 text-center text-gray-500">No payments found</Text>
      )}
    </ScrollView>
  );
}
