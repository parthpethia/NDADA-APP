import { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, Alert, Platform, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, Button, StatusBadge } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import {
  MEMBERSHIP_AMOUNT,
  MEMBERSHIP_PLAN_NAME,
  MEMBERSHIP_VALIDITY_LABEL,
  MEMBERSHIP_SUPPORT_EMAIL,
} from '@/constants';
import { CheckCircle, Clock, XCircle, DollarSign, Banknote } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';

export default function PaymentScreen() {
  const router = useRouter();
  const { member, refreshMember, session } = useAuth();
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPaymentMethodSelection, setShowPaymentMethodSelection] = useState(true);
  const [showCashConfirm, setShowCashConfirm] = useState(false);
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);
  const checkoutRef = useRef<any>(null);

  // Load Razorpay checkout.js script (Web only)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if ((window as any).Razorpay) return;

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  useEffect(() => {
    if (!member) return;
    const cashSelected = member.payment_method === 'cash';
    const cashPending = cashSelected && member.payment_status !== 'paid' && !member.cash_payment_verified;
    if (cashPending) {
      router.replace('/(dashboard)/cash-payment-review');
    }
  }, [member?.payment_method, member?.payment_status, member?.cash_payment_verified, member?.id, router]);

  if (!member) return null;

  const shouldShowPaymentMethods =
    member.payment_status !== 'paid' &&
    (member.payment_status === 'pending' ||
     member.payment_status === 'failed' ||
     member.payment_status === 'expired' ||
     member.payment_status === 'abandoned' ||
     member.payment_status === 'processing');

  // ============================================================
  // Standard Checkout: Create Order → Open Modal → Verify Signature
  // ============================================================
  const handlePayWithRazorpay = async () => {
    console.log('▶️ === PAYMENT FLOW START ===');
    console.log('1️⃣ Checking member:', member ? `✅ ${member.id}` : '❌ MISSING');
    console.log('2️⃣ Checking session:', session ? `✅ ${session.user?.id}` : '❌ MISSING');
    console.log('3️⃣ Checking token:', session?.access_token ? `✅ ${session.access_token.substring(0, 20)}...` : '❌ MISSING');

    if (!member) {
      console.error('❌ No member data');
      Alert.alert('Error', 'Member data not found');
      return;
    }

    if (!session) {
      console.error('❌ No session');
      Alert.alert('Error', 'Not authenticated - no session');
      return;
    }

    if (!session.access_token) {
      console.error('❌ No access token');
      Alert.alert('Error', 'Not authenticated - no token');
      return;
    }

    setPaymentLoading(true);
    try {
      // Best-effort: ensure this is treated as an online payment attempt.
      // Prevents members from lingering in the cash verification queue if they switch methods.
      await supabase
        .from('accounts')
        .update({ payment_method: 'online' })
        .eq('id', member.id);

      console.log('\n4️⃣ Invoking razorpay-create-order...');
      const { data: orderData, error: orderError } = await supabase.functions.invoke('razorpay-create-order', {
        body: { member_id: member.id },
      });

      if (orderError) {
        console.error('❌ Order creation failed:', orderError);
        throw new Error(orderError.message || 'Failed to create order');
      }

      if (!orderData?.id) {
        throw new Error('Invalid order response');
      }

      console.log('✅ Order created:', orderData.id);

      // STEP 2: Open Razorpay Checkout Modal
      const keyId = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID;
      if (!keyId) {
        throw new Error('Razorpay configuration missing (EXPO_PUBLIC_RAZORPAY_KEY_ID)');
      }

      const checkoutOptions = {
        key: keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        order_id: orderData.id,
        name: 'NDADA Membership',
        description: 'Registration Fee',
        prefill: {
          name: member.full_name,
          email: member.email,
          contact: member.phone || '',
        },
        notes: {
          member_id: member.id,
          membership_id: member.membership_id,
        },
        theme: { color: '#1d4ed8' },
        timeout: 600,
      };

      if (Platform.OS === 'web') {
        const Razorpay = (window as any).Razorpay;
        if (!Razorpay) {
          throw new Error('Razorpay SDK not loaded. Please refresh the page.');
        }

        checkoutRef.current = new Razorpay({
          ...checkoutOptions,
          handler: (response: any) => handlePaymentSuccess(response),
          modal: {
            ondismiss: () => {
              console.log('ℹ️ User closed Razorpay modal');
              setPaymentLoading(false);
            },
          },
        });
        checkoutRef.current.on('payment.failed', (response: any) => {
          handlePaymentFailure(response.error);
        });
        checkoutRef.current.open();
      } else {
        // React Native: try react-native-razorpay, fallback to WebBrowser
        try {
          const RazorpayCheckoutModule = require('react-native-razorpay').default;
          RazorpayCheckoutModule.open(checkoutOptions)
            .then((response: any) => handlePaymentSuccess(response))
            .catch((error: any) => handlePaymentFailure(error));
        } catch (err: any) {
          console.warn('⚠️ react-native-razorpay not available, opening in browser');
          await WebBrowser.openBrowserAsync(
            `https://checkout.razorpay.com/?key_id=${keyId}&order_id=${orderData.id}`
          );
        }
      }
    } catch (err: any) {
      console.error('\n❌ === PAYMENT FLOW FAILED ===');
      console.error('Error:', err.message);
      Alert.alert('Error', err?.message || 'Failed to start payment');
      setPaymentLoading(false);
    }
  };

  // STEP 3: Verify Payment Signature
  const handlePaymentSuccess = async (response: any) => {
    console.log('3️⃣ Payment successful, verifying signature...');
    setVerifying(true);
    setPaymentLoading(false);

    try {
      const { data, error } = await supabase.functions.invoke('razorpay-verify-signature', {
        body: {
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        },
      });

      if (error) throw new Error(error.message || 'Verification failed');

      if (!data?.verified) {
        Alert.alert(
          'Security Alert',
          'Payment signature verification failed. This payment has not been processed for security reasons.'
        );
        return;
      }

      console.log('✅ Payment verified successfully');
      Alert.alert('Success', 'Payment verified! Your membership is being confirmed.', [
        { text: 'OK', onPress: () => refreshMember() },
      ]);
      setTimeout(() => refreshMember(), 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      Alert.alert('Verification Error', message);
    } finally {
      setVerifying(false);
    }
  };

  const handlePaymentFailure = (error: any) => {
    console.error('❌ Payment failed:', error);
    setPaymentLoading(false);
    const errorMessage = error?.description || error?.message || 'Payment failed';
    Alert.alert('Payment Failed', errorMessage, [
      { text: 'Retry', onPress: () => handlePayWithRazorpay() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleRefreshStatus = async () => {
    setRefreshing(true);
    try {
      await refreshMember();
    } finally {
      setRefreshing(false);
    }
  };

  const handlePayOnline = () => {
    setShowPaymentMethodSelection(false);
    // The Razorpay section will now be visible
  };

  const handlePayInCash = () => {
    setCashError(null);
    setShowCashConfirm(true);
  };

  const confirmCashPayment = async () => {
    if (!member) return;
    setCashSubmitting(true);
    setCashError(null);
    try {
      console.log('Proceeding with cash payment for member:', member.id);
      const { error } = await supabase
        .from('accounts')
        .update({ payment_method: 'cash' })
        .eq('id', member.id);

      if (error) {
        console.error('Error updating payment method:', error);
        setCashError(error.message || 'Failed to process cash payment request');
        return;
      }

      setShowCashConfirm(false);
      setShowPaymentMethodSelection(false);
      router.push('/(dashboard)/cash-payment-review');
    } catch (err: any) {
      console.error('Cash payment error:', err);
      setCashError(err?.message || 'Failed to process request');
    } finally {
      setCashSubmitting(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="p-4 pb-8">
      <View className="mx-auto w-full max-w-lg">
        {/* Payment Status Card */}
        <Card className="mb-4">
          <View className="items-center py-4">
            {member.payment_status === 'paid' ? (
              <>
                <View className="mb-3 rounded-full bg-green-100 p-4">
                  <CheckCircle size={48} color="#15803d" />
                </View>
                <Text className="text-xl font-bold text-green-700">Payment Complete</Text>
                <Text className="mt-1 text-gray-500">
                  Your registration is complete
                </Text>
              </>
            ) : member.payment_status === 'processing' ? (
              <>
                <View className="mb-3 rounded-full bg-blue-100 p-4">
                  <Clock size={48} color="#2563eb" />
                </View>
                <Text className="text-xl font-bold text-blue-700">Verifying Payment</Text>
                <Text className="mt-1 text-center text-sm text-gray-500">
                  We're confirming your payment. This usually takes a few seconds.
                </Text>
              </>
            ) : member.payment_status === 'failed' ? (
              <>
                <View className="mb-3 rounded-full bg-red-100 p-4">
                  <XCircle size={48} color="#dc2626" />
                </View>
                <Text className="text-xl font-bold text-red-700">Payment Failed</Text>
                <Text className="mt-1 text-gray-500">
                  Your payment couldn't be processed
                </Text>
              </>
            ) : member.payment_status === 'expired' ? (
              <>
                <View className="mb-3 rounded-full bg-orange-100 p-4">
                  <Clock size={48} color="#ea580c" />
                </View>
                <Text className="text-xl font-bold text-orange-700">Payment Link Expired</Text>
                <Text className="mt-1 text-center text-sm text-gray-500">
                  Your payment link has expired. Generate a new one below.
                </Text>
              </>
            ) : member.payment_status === 'abandoned' ? (
              <>
                <View className="mb-3 rounded-full bg-gray-100 p-4">
                  <XCircle size={48} color="#6b7280" />
                </View>
                <Text className="text-xl font-bold text-gray-700">Payment Abandoned</Text>
                <Text className="mt-1 text-center text-sm text-gray-500">
                  You didn't complete payment. Create a new payment link to continue.
                </Text>
              </>
            ) : (
              <>
                <View className="mb-3 rounded-full bg-yellow-100 p-4">
                  <Clock size={48} color="#ca8a04" />
                </View>
                <Text className="text-xl font-bold text-gray-900">Payment Pending</Text>
                <Text className="mt-1 text-gray-500">
                  Pay securely via Razorpay
                </Text>
              </>
            )}
          </View>
        </Card>

        {/* Membership Details */}
        <Card className="mb-4">
          <CardHeader title="Registration Fee Details" />
          <View className="gap-2">
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Plan</Text>
              <Text className="font-medium text-gray-900">{MEMBERSHIP_PLAN_NAME}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Membership ID</Text>
              <Text className="font-medium text-gray-900">{member.membership_id}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Fee</Text>
              <Text className="font-medium text-gray-900">{formatCurrency(MEMBERSHIP_AMOUNT)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Validity</Text>
              <Text className="font-medium text-gray-900">{MEMBERSHIP_VALIDITY_LABEL}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Status</Text>
              <StatusBadge status={member.payment_status} />
            </View>
          </View>
        </Card>

        <Card className="mb-4 border-blue-100 bg-blue-50">
          <CardHeader title="After Payment" subtitle="What happens next" />
          <View className="gap-2">
            <Text className="text-sm text-blue-800">1. Your payment is confirmed securely.</Text>
            <Text className="text-sm text-blue-800">2. Your firm application moves into review.</Text>
            <Text className="text-sm text-blue-800">3. Your certificate becomes available after approval.</Text>
            <Text className="pt-1 text-xs text-blue-700">
              Need help? Contact {MEMBERSHIP_SUPPORT_EMAIL}.
            </Text>
          </View>
        </Card>

        {/* Payment Method Selection */}
        {showPaymentMethodSelection && shouldShowPaymentMethods && (
          <Card className="mb-4">
            <CardHeader
              title="Choose Payment Method"
              subtitle="Select how you'd like to pay"
            />
            <View className="gap-3">
              <Button
                title="Pay Online"
                onPress={handlePayOnline}
                size="lg"
                className="w-full"
              />
              <Button
                title="Pay in Cash"
                variant="outline"
                onPress={handlePayInCash}
                size="lg"
                className="w-full"
              />
              <Text className="text-center text-xs text-gray-500">
                Choose your preferred payment method above
              </Text>

              {showCashConfirm && (
                <View className="mt-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                  <Text className="font-semibold text-yellow-900">Confirm Cash Payment</Text>
                  <Text className="mt-1 text-sm text-yellow-800">
                    Are you sure you want to pay {formatCurrency(MEMBERSHIP_AMOUNT)} in cash to NDADA?
                    {'\n\n'}An admin will verify and process your payment.
                  </Text>
                  {cashError ? (
                    <Text className="mt-2 text-sm text-red-700">{cashError}</Text>
                  ) : null}
                  <View className="mt-3 flex-row gap-2">
                    <Button
                      title="Cancel"
                      variant="outline"
                      onPress={() => setShowCashConfirm(false)}
                      className="flex-1"
                      disabled={cashSubmitting}
                    />
                    <Button
                      title="Confirm"
                      onPress={() => void confirmCashPayment()}
                      loading={cashSubmitting}
                      className="flex-1"
                    />
                  </View>
                </View>
              )}
            </View>
          </Card>
        )}

        {/* Razorpay */}
        {!showPaymentMethodSelection && shouldShowPaymentMethods && (
          <Card className="mb-4">
            <CardHeader
              title={member.payment_status === 'processing' || verifying ? 'Verify Payment' : 'Pay with Razorpay'}
              subtitle={member.payment_status === 'processing' || verifying ? 'Confirming your payment status' : 'Fast, secure online payment'}
            />
            <View className="gap-3">
              {member.payment_status === 'processing' || verifying ? (
                <>
                  <Button
                    title={verifying ? "Verifying Signature..." : "Verify Payment Now"}
                    onPress={handleRefreshStatus}
                    loading={refreshing || verifying}
                    size="lg"
                    className="w-full"
                  />
                  <Text className="text-center text-xs text-gray-500">
                    We're checking your payment status. This usually takes a few seconds.
                  </Text>
                </>
              ) : member.payment_status === 'failed' || member.payment_status === 'expired' || member.payment_status === 'abandoned' ? (
                <>
                  <Button
                    title="Pay Online Now"
                    onPress={handlePayWithRazorpay}
                    loading={paymentLoading}
                    size="lg"
                    className="w-full"
                  />
                  <Button
                    title="Check Status"
                    variant="outline"
                    onPress={handleRefreshStatus}
                    loading={refreshing}
                    className="w-full"
                  />
                  <Button
                    title="Back to Payment Method Selection"
                    variant="outline"
                    onPress={() => setShowPaymentMethodSelection(true)}
                    className="w-full"
                  />
                  <Text className="text-center text-xs text-gray-500">
                    You can try making the payment again.
                  </Text>
                </>
              ) : (
                <>
                  <Button
                    title="Pay Now"
                    onPress={handlePayWithRazorpay}
                    loading={paymentLoading}
                    size="lg"
                    className="w-full"
                  />
                  <Button
                    title="Refresh Status"
                    variant="outline"
                    onPress={handleRefreshStatus}
                    loading={refreshing}
                    className="w-full"
                  />
                  <Button
                    title="Back to Payment Method Selection"
                    variant="outline"
                    onPress={() => setShowPaymentMethodSelection(true)}
                    className="w-full"
                  />
                  <Text className="text-center text-xs text-gray-500">
                    Secure online checkout.
                  </Text>
                </>
              )}
            </View>
          </Card>
        )}
      </View>
    </ScrollView>
  );
}
