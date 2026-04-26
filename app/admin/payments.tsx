import { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card, StatusBadge, Button } from '@/components/ui';
import { Payment } from '@/types';
import { formatDate, formatCurrency } from '@/lib/utils';
import { CheckCircle, XCircle } from 'lucide-react-native';

interface PaymentWithMember extends Payment {
  member_name: string;
  member_email: string;
  payment_method?: string;
}

interface CashPaymentWithMember {
  id: string;
  member_id: string;
  full_name: string;
  email: string;
  membership_id: string;
  payment_method: string;
  cash_payment_verified: boolean;
  created_at: string;
}

export default function AdminPaymentsScreen() {
  const [payments, setPayments] = useState<PaymentWithMember[]>([]);
  const [cashPayments, setCashPayments] = useState<CashPaymentWithMember[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'online' | 'cash'>('online');

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
    // Fetch online payments
    const { data: onlinePayments } = await supabase
      .from('payments')
      .select('*, accounts(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(50);

    setPayments(
      (onlinePayments || []).map((p: any) => ({
        ...p,
        member_name: p.accounts?.full_name || 'Unknown',
        member_email: p.accounts?.email || '',
        accounts: undefined,
      }))
    );

    // Fetch cash payment requests
    const { data: cashPaymentAccounts } = await supabase
      .from('accounts')
      .select('id, full_name, email, membership_id, payment_method, cash_payment_verified, created_at')
      .eq('payment_method', 'cash')
      .order('created_at', { ascending: false })
      .limit(50);

    setCashPayments(
      (cashPaymentAccounts || []).map((a: any) => ({
        id: a.id,
        member_id: a.id,
        full_name: a.full_name,
        email: a.email,
        membership_id: a.membership_id,
        payment_method: a.payment_method,
        cash_payment_verified: a.cash_payment_verified,
        created_at: a.created_at,
      }))
    );
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPayments();
    setRefreshing(false);
  };

  const handleVerifyCashPayment = (memberId: string, memberName: string) => {
    Alert.alert(
      'Verify Cash Payment',
      `Approve cash payment for ${memberName}?`,
      [
        {
          text: 'Reject',
          onPress: () => handleCashPaymentAction(memberId, 'rejected'),
          style: 'destructive',
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Approve',
          onPress: () => handleCashPaymentAction(memberId, 'approved'),
          style: 'default',
        },
      ]
    );
  };

  const handleCashPaymentAction = async (memberId: string, action: 'approved' | 'rejected') => {
    setVerifyingId(memberId);
    try {
      const { data, error } = await supabase.functions.invoke('verify-cash-payment', {
        body: {
          member_id: memberId,
          status: action,
          notes: action === 'approved' ? 'Verified by admin' : 'Rejected by admin',
        },
      });

      if (error) {
        setActionError(error.message || 'Failed to update payment');
        showMessage('Error', error.message || 'Failed to update payment');
        return;
      }

      showMessage(
        'Success',
        action === 'approved'
          ? 'Cash payment verified and approved'
          : 'Cash payment request rejected'
      );
      await fetchPayments();
      setActionError(null);
    } catch (err: any) {
      setActionError(err.message || 'An error occurred');
      showMessage('Error', err.message || 'An error occurred');
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerClassName="p-4 pb-8"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text className="mb-4 text-xl font-bold text-gray-900">Payment Management</Text>

      {/* Tab Selection */}
      <View className="mb-4 flex-row gap-2">
        <Button
          title="Online Payments"
          variant={activeTab === 'online' ? 'primary' : 'outline'}
          onPress={() => setActiveTab('online')}
          className="flex-1"
        />
        <Button
          title={`Cash Payments (${cashPayments.filter((p) => !p.cash_payment_verified).length})`}
          variant={activeTab === 'cash' ? 'primary' : 'outline'}
          onPress={() => setActiveTab('cash')}
          className="flex-1"
        />
      </View>

      {actionError ? (
        <View className="mb-3 rounded-lg bg-red-50 p-3">
          <Text className="text-sm text-red-700">{actionError}</Text>
        </View>
      ) : null}

      {activeTab === 'online' ? (
        <>
          <Text className="mb-3 text-sm font-semibold text-gray-600">Online Payment Logs</Text>
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
            <Text className="py-12 text-center text-gray-500">No online payments found</Text>
          )}
        </>
      ) : (
        <>
          <Text className="mb-3 text-sm font-semibold text-gray-600">Cash Payment Requests</Text>
          {cashPayments.map((p) => (
            <Card key={p.member_id} className={`mb-3 ${p.cash_payment_verified ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}`}>
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <Text className="font-semibold text-gray-900">{p.full_name}</Text>
                  <Text className="text-xs text-gray-500">{p.email}</Text>
                  <Text className="mt-1 text-xs font-medium text-gray-700">
                    Membership ID: {p.membership_id}
                  </Text>
                </View>
                <View>
                  {p.cash_payment_verified ? (
                    <View className="rounded-full bg-green-100 p-2">
                      <CheckCircle size={20} color="#15803d" />
                    </View>
                  ) : (
                    <View className="rounded-full bg-yellow-100 p-2">
                      <Text className="text-xs font-bold text-yellow-900">Pending</Text>
                    </View>
                  )}
                </View>
              </View>

              <View className="mt-3 gap-2">
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-600">Request Date</Text>
                  <Text className="text-xs text-gray-700">{formatDate(p.created_at)}</Text>
                </View>

                {p.cash_payment_verified ? (
                  <View className="mt-2 flex-row items-center gap-2 rounded-lg bg-green-100 p-2">
                    <CheckCircle size={16} color="#15803d" />
                    <Text className="text-xs font-semibold text-green-700">Verified</Text>
                  </View>
                ) : (
                  <View className="mt-2 flex-row gap-2">
                    <Button
                      title="Approve"
                      onPress={() => handleVerifyCashPayment(p.member_id, p.full_name)}
                      loading={verifyingId === p.member_id}
                      size="sm"
                      className="flex-1"
                    />
                    <Button
                      title="Reject"
                      variant="outline"
                      onPress={() => {
                        Alert.alert('Reject Payment', `Reject cash payment for ${p.full_name}?`, [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Reject',
                            onPress: () => handleCashPaymentAction(p.member_id, 'rejected'),
                            style: 'destructive',
                          },
                        ]);
                      }}
                      loading={verifyingId === p.member_id}
                      size="sm"
                      className="flex-1"
                    />
                  </View>
                )}
              </View>
            </Card>
          ))}

          {cashPayments.length === 0 && (
            <Text className="py-12 text-center text-gray-500">No cash payment requests</Text>
          )}
        </>
      )}
    </ScrollView>
  );
}
