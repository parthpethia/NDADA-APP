import { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, Linking, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card, Button, StatusBadge } from '@/components/ui';
import { useAdmin } from '@/hooks/useAdmin';
import { confirm } from '@/lib/confirm';
import { Payment } from '@/types';
import { formatDate, formatCurrency } from '@/lib/utils';
import { STORAGE_BUCKETS } from '@/constants';

interface PaymentWithMember extends Payment {
  member_name: string;
  member_email: string;
  proof_url?: string | null;
}

export default function AdminPaymentsScreen() {
  const { callAdminAction } = useAdmin();
  const [payments, setPayments] = useState<PaymentWithMember[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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

  const handleVerify = async (paymentId: string) => {
    const ok = await confirm('Confirm', 'Manually verify this payment as paid?', {
      confirmText: 'Verify',
    });
    if (!ok) return;

    setActionLoading(paymentId);
    try {
      await callAdminAction('verify-payment', { payment_id: paymentId });
      await fetchPayments();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
    setActionLoading(null);
  };

  const handleOpenProof = async (proofPath: string) => {
    try {
      const { data } = await supabase.storage
        .from(STORAGE_BUCKETS.paymentProofs)
        .createSignedUrl(proofPath, 60);
      if (!data?.signedUrl) throw new Error('Could not create signed URL');

      if (Platform.OS === 'web') {
        window.open(data.signedUrl, '_blank');
      } else {
        await Linking.openURL(data.signedUrl);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to open proof');
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerClassName="p-4 pb-8"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text className="mb-4 text-xl font-bold text-gray-900">Payment Logs</Text>

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

            <View className="flex-row justify-between">
              <Text className="text-xs text-gray-500">Date</Text>
              <Text className="text-xs text-gray-700">{formatDate(p.created_at)}</Text>
            </View>


            {p.proof_url && (
              <View className="flex-row justify-between">
                <Text className="text-xs text-gray-500">Proof</Text>
                <Text
                  className="text-xs text-primary-700"
                  onPress={() => handleOpenProof(p.proof_url as string)}
                >
                  View screenshot
                </Text>
              </View>
            )}
          </View>

          {p.status === 'pending' && (
            <View className="mt-3 border-t border-gray-100 pt-3">
              <Button
                title="Manually Verify"
                variant="primary"
                size="sm"
                onPress={() => handleVerify(p.id)}
                loading={actionLoading === p.id}
              />
            </View>
          )}
        </Card>
      ))}

      {payments.length === 0 && (
        <Text className="py-12 text-center text-gray-500">No payments found</Text>
      )}
    </ScrollView>
  );
}
