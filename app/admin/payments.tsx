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
}

interface CashPaymentWithMember {
  id: string;
  member_id: string;
  full_name: string;
  email: string;
  membership_id: string;
  payment_method: string;
  cash_payment_verified: boolean;
  requested_at: string;
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
    const { data: onlinePayments, error: onlineError } = await supabase
      .from('payments')
      .select('id, status, amount, currency, provider, razorpay_payment_id, created_at, member_id, accounts!member_id(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (onlineError) {
      console.error('❌ Online payments fetch error:', onlineError);
      showMessage('Fetch Error', 'Failed to load online payments: ' + onlineError.message);
    } else {
      console.log(`💳 Online payments fetched: ${(onlinePayments || []).length} records`);
    }

    setPayments(
      (onlinePayments || []).map((p: any) => ({
        ...p,
        member_name: p.accounts?.full_name || 'Unknown',
        member_email: p.accounts?.email || '',
        accounts: undefined,
      }))
    );

    // Fetch cash payment requests
    const { data: cashPaymentAccounts, error: cashError } = await supabase
      .from('accounts')
      .select('id, full_name, email, membership_id, payment_method, cash_payment_verified, created_at, updated_at')
      .eq('payment_method', 'cash')
      .order('updated_at', { ascending: false })
      .limit(50);

    if (cashError) {
      console.error('❌ Cash payments fetch error:', cashError);
      showMessage('Fetch Error', 'Failed to load cash payments: ' + cashError.message);
    } else {
      console.log(`💵 Cash payments fetched: ${(cashPaymentAccounts || []).length} records`);
    }

    setCashPayments(
      (cashPaymentAccounts || []).map((a: any) => ({
        id: a.id,
        member_id: a.id,
        full_name: a.full_name,
        email: a.email,
        membership_id: a.membership_id,
        payment_method: a.payment_method,
        cash_payment_verified: a.cash_payment_verified,
        requested_at: a.updated_at || a.created_at,
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
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Approve cash payment for ${memberName}?`)) {
        handleCashPaymentAction(memberId, 'approved');
      }
      return;
    }

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

  const handleCashPaymentAction = async (memberId: string, action: 'approved' | 'rejected' | 'pending') => {
    setVerifyingId(memberId);
    setActionError(null);
    try {
      console.log(`Starting cash payment action: ${action} for member: ${memberId}`);
      
      const { data, error } = await supabase.rpc('verify_cash_payment', {
        p_member_id: memberId,
        p_status: action,
        p_notes: action === 'approved' ? 'Verified by admin' : (action === 'rejected' ? 'Rejected by admin' : 'Undo by admin'),
      });

      if (error) {
        console.error('Database RPC error:', error);
        setActionError(error.message || 'Failed to update payment.');
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert(`Error: ${error.message}`);
        } else {
          Alert.alert('Error', error.message || 'Failed to update payment.');
        }
        setVerifyingId(null);
        return;
      }

      console.log('RPC successful. Stopping spinner and fetching updated payments...');
      // Stop the spinner immediately so the UI feels responsive
      setVerifyingId(null);
      
      await fetchPayments();
      console.log('Payments updated successfully.');
    } catch (err: any) {
      console.error('Action error:', err);
      setActionError(err.message || 'An error occurred during verification.');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`Error: ${err.message}`);
      } else {
        Alert.alert('Error', err.message || 'An error occurred during verification.');
      }
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
                    {formatCurrency(p.amount / 100, (p.currency || 'INR').toUpperCase())}
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
                    Membership ID: {p.membership_id || 'Pending'}
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
                    <Text className="text-xs text-gray-700">{formatDate(p.requested_at)}</Text>
                </View>

                {p.cash_payment_verified ? (
                  <View className="mt-2 flex-row items-center justify-between rounded-lg bg-green-100 p-2">
                    <View className="flex-row items-center gap-2">
                      <CheckCircle size={16} color="#15803d" />
                      <Text className="text-xs font-semibold text-green-700">Verified</Text>
                    </View>
                    <Button 
                      title="Undo" 
                      variant="outline" 
                      size="sm" 
                      onPress={() => {
                        if (Platform.OS === 'web') {
                          if (typeof window !== 'undefined' && window.confirm(`Undo cash payment verification for ${p.full_name}?`)) {
                            handleCashPaymentAction(p.member_id, 'pending');
                          }
                          return;
                        }
                        Alert.alert('Undo Verification', `Undo cash payment verification for ${p.full_name}?`, [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Undo',
                            onPress: () => handleCashPaymentAction(p.member_id, 'pending'),
                            style: 'destructive',
                          },
                        ]);
                      }}
                      loading={verifyingId === p.member_id}
                    />
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
                        if (Platform.OS === 'web') {
                          if (typeof window !== 'undefined' && window.confirm(`Reject cash payment for ${p.full_name}?`)) {
                            handleCashPaymentAction(p.member_id, 'rejected');
                          }
                          return;
                        }
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
