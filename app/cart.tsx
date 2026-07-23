import { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, Alert, Platform, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, Button, StatusBadge } from '@/components/ui';
import { formatCurrency, getFunctionsErrorMessage } from '@/lib/utils';
import {
  MEMBERSHIP_AMOUNT,
  APP_NAME,
  MEMBERSHIP_BENEFITS,
  MEMBERSHIP_PLAN_NAME,
} from '@/constants';
import {
  ShoppingCart,
  CheckCircle,
  Building2,
  Award,
} from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';

export default function CartScreen() {
  const { member, refreshMember } = useAuth();
  const params = useLocalSearchParams<{ success?: string; cancelled?: string }>();
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showCashConfirm, setShowCashConfirm] = useState(false);
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);
  const checkoutRef = useRef<any>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

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

  const refreshedOnMountRef = useRef(false);
  useEffect(() => {
    // Sync cart with latest account state on mount only once
    if (!refreshedOnMountRef.current) {
      refreshedOnMountRef.current = true;
      refreshMember();
    }
  }, [refreshMember]);

  useEffect(() => {
    if (params.success === 'true') {
      refreshMember();
    }
  }, [params.success, refreshMember]);

  useEffect(() => {
    if (!member) return;
    const cashSelected = member.payment_method === 'cash';
    const cashPending = cashSelected && member.payment_status !== 'paid' && !member.cash_payment_verified;
    if (cashPending) {
      router.replace('/(dashboard)/cash-payment-review');
    }
  }, [member?.payment_method, member?.payment_status, member?.cash_payment_verified, member?.id]);

  if (!member) return null;

  // Payment complete — show success
  if (member.payment_status === 'paid') {
    return (
      <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="p-4 pb-8">
        <View className="mx-auto w-full max-w-lg items-center py-8">
          <View className="mb-4 rounded-full bg-green-100 p-5">
            <CheckCircle size={48} color="#16a34a" />
          </View>
          <Text className="mb-2 text-2xl font-bold text-green-800">Payment Complete!</Text>
          <Text className="mb-6 text-center text-gray-500">
            Your registration fee payment is confirmed. Your certificate will be generated automatically.
          </Text>
          <Button
            title="View Certificate"
            onPress={() => router.push('/(dashboard)/certificate')}
            size="lg"
          />
          <Button
            title="Go to Dashboard"
            variant="outline"
            onPress={() => router.replace('/(dashboard)')}
            className="mt-3"
          />
        </View>
      </ScrollView>
    );
  }

  // ============================================================
  // Standard Checkout: Create Order → Open Modal → Verify Signature
  // ============================================================
  const handlePayment = async () => {
    if (!member) return;
    setPaymentLoading(true);

    try {
      // Mark payment method as online
      await supabase
        .from('accounts')
        .update({ payment_method: 'online' })
        .eq('id', member.id);

      // STEP 1: Create Razorpay Order
      console.log('1️⃣ Creating Razorpay order...');
      const { data: orderData, error: orderError } = await supabase.functions.invoke('razorpay-create-order', {
        body: { member_id: member.id },
      });

      if (orderError) {
        console.error('❌ Order creation failed:', orderError);
        const errMsg = await getFunctionsErrorMessage(orderError);
        throw new Error(errMsg);
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
          membership_id: member.membership_id || '',
        },
        theme: { color: '#15803d' },
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
        let razorpayOpened = false;
        try {
          const RazorpayCheckoutModule = require('react-native-razorpay')?.default || require('react-native-razorpay');
          if (RazorpayCheckoutModule && typeof RazorpayCheckoutModule.open === 'function') {
            razorpayOpened = true;
            RazorpayCheckoutModule.open(checkoutOptions)
              .then((response: any) => handlePaymentSuccess(response))
              .catch((error: any) => handlePaymentFailure(error));
          }
        } catch (err: any) {
          console.warn('⚠️ react-native-razorpay native module unavailable:', err?.message || err);
        }

        if (!razorpayOpened) {
          console.log('🌐 Opening checkout in WebBrowser...');
          await WebBrowser.openBrowserAsync(
            `https://checkout.razorpay.com/?key_id=${keyId}&order_id=${orderData.id}`
          );
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start payment';
      Alert.alert('Error', message);
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

      if (error) {
        const errMsg = await getFunctionsErrorMessage(error);
        throw new Error(errMsg);
      }

      if (!data?.verified) {
        Alert.alert(
          'Security Alert',
          'Payment signature verification failed. This payment has not been processed for security reasons.'
        );
        return;
      }

      console.log('✅ Payment verified successfully');
      await refreshMember();
      Alert.alert('Success', 'Payment verified! Your membership is being confirmed.', [
        { text: 'View Certificate', onPress: () => router.push('/(dashboard)/certificate') },
      ]);
      // Auto-redirect after a short delay if user doesn't tap
      redirectTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          router.push('/(dashboard)/certificate');
        }
      }, 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      Alert.alert('Verification Error', message);
    } finally {
      if (isMountedRef.current) {
        setVerifying(false);
      }
    }
  };

  const handlePaymentFailure = (error: any) => {
    console.error('❌ Payment failed:', error);
    setPaymentLoading(false);
    const errorMessage = error?.description || error?.message || 'Payment failed';
    Alert.alert('Payment Failed', errorMessage, [
      { text: 'Retry', onPress: () => handlePayment() },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
      router.replace('/(dashboard)/cash-payment-review');
    } catch (err: unknown) {
      console.error('Cash payment error:', err);
      const message = err instanceof Error ? err.message : 'Failed to process request';
      setCashError(message);
    } finally {
      setCashSubmitting(false);
    }
  };

  // With consolidated schema, the member record IS the firm
  const hasFirmData = !!member.firm_name;

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="p-4 pb-8">
      <View className="mx-auto w-full max-w-lg">
        {/* Success Notice */}
        {params.success === 'true' && (
          <View className="mb-4 rounded-lg bg-primary-50 p-3">
            <Text className="text-sm text-primary-700">
              Payment completed. Updating your payment status…
            </Text>
          </View>
        )}

        {/* Cancelled Notice */}
        {params.cancelled === 'true' && (
          <View className="mb-4 rounded-lg bg-yellow-50 p-3">
            <Text className="text-sm text-yellow-700">
              Payment was cancelled. You can try again below.
            </Text>
          </View>
        )}

        {/* Cart Header */}
        <View className="mb-5 flex-row items-center gap-3">
          <View className="rounded-full bg-primary-100 p-2">
            <ShoppingCart size={24} color="#15803d" />
          </View>
          <View>
            <Text className="text-xl font-bold text-gray-900">Your Cart</Text>
            <Text className="text-sm text-gray-500">Review your registration fee and complete payment</Text>
          </View>
        </View>

        <Card className="mb-4 border-primary-100 bg-primary-50">
          <CardHeader title={MEMBERSHIP_PLAN_NAME} subtitle="One-time payment" />
          <Text className="text-sm text-primary-700">
            This registration fee activates your member profile{member.membership_id ? ` linked to ${member.membership_id}` : ''} and enables certificate issuance.
          </Text>
        </Card>

        {/* Registered Firm Summary */}
        {hasFirmData && (
          <Card className="mb-4">
            <CardHeader title="Registered Firm" />
            <View className="gap-2">
              <View className="flex-row items-center gap-2">
                <Building2 size={16} color="#6b7280" />
                <Text className="flex-1 font-medium text-gray-900">{member.firm_name}</Text>
              </View>
              <CartRow label="License No." value={member.license_number} />
              <CartRow label="Registration No." value={member.registration_number} />
              <CartRow label="Type" value={member.firm_type} />
            </View>
          </Card>
        )}

        {/* Order Summary */}
        <Card className="mb-4">
          <CardHeader title="Order Summary" />
          <View className="gap-3">
            <View className="flex-row items-center justify-between rounded-lg bg-gray-50 p-3">
              <View className="flex-row items-center gap-3">
                <View className="rounded-lg bg-primary-100 p-2">
                  <Award size={20} color="#15803d" />
                </View>
                <View>
                  <Text className="font-medium text-gray-900">{APP_NAME} Membership</Text>
                  <Text className="text-xs text-gray-500">{MEMBERSHIP_PLAN_NAME}</Text>
                </View>
              </View>
              <Text className="text-lg font-bold text-gray-900">
                {formatCurrency(MEMBERSHIP_AMOUNT)}
              </Text>
            </View>

            <View className="border-t border-gray-200" />

            <View className="flex-row justify-between">
              <Text className="text-gray-500">Subtotal</Text>
              <Text className="font-medium text-gray-900">
                {formatCurrency(MEMBERSHIP_AMOUNT)}
              </Text>
            </View>

            <View className="flex-row justify-between">
              <Text className="text-gray-500">Tax</Text>
              <Text className="font-medium text-gray-900">{formatCurrency(0)}</Text>
            </View>

            <View className="border-t border-gray-200" />

            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-bold text-gray-900">Total</Text>
              <Text className="text-2xl font-bold text-primary-700">
                {formatCurrency(MEMBERSHIP_AMOUNT)}
              </Text>
            </View>
          </View>
        </Card>

        {/* What you get */}
        <Card className="mb-5">
          <CardHeader title="What You Get" />
          <View className="gap-2">
            {MEMBERSHIP_BENEFITS.map((benefit) => (
              <BenefitRow key={benefit} text={benefit} />
            ))}
          </View>
        </Card>

        {/* Payment Method Buttons */}
        <Card className="mb-4">
          <CardHeader
            title="Choose Payment Method"
            subtitle="Select how you'd like to pay"
          />
          <View className="gap-3">
            <Button
              title="Pay Online"
              onPress={handlePayment}
              loading={paymentLoading}
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

        <Text className="text-center text-xs text-gray-400">
          Choose your preferred payment method above
        </Text>
      </View>
    </ScrollView>
  );
}

function CartRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between items-center gap-2 py-0.5">
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text className="text-sm font-medium text-gray-900 flex-1 text-right" numberOfLines={2}>{value || 'N/A'}</Text>
    </View>
  );
}

function BenefitRow({ text }: { text: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <CheckCircle size={16} color="#16a34a" />
      <Text className="flex-1 text-sm text-gray-700">{text}</Text>
    </View>
  );
}
