import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, Platform, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, Button, StatusBadge } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import {
  MEMBERSHIP_AMOUNT,
  APP_NAME,
  MEMBERSHIP_BENEFITS,
  MEMBERSHIP_PLAN_NAME,
  MEMBERSHIP_VALIDITY_LABEL,
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

  useEffect(() => {
    if (params.success === 'true') {
      refreshMember();
    }
  }, [params.success, refreshMember]);

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

  const handlePayment = async () => {
    setPaymentLoading(true);
    try {
      // Best-effort: ensure payment method is online when starting an online payment.
      // This prevents members from remaining in the "cash" review queue if they later pay online.
      await supabase
        .from('accounts')
        .update({ payment_method: 'online' })
        .eq('id', member.id);

      const { data, error } = await supabase.functions.invoke('razorpay-create-payment-link', {
        body: {},
      });
      if (error) throw new Error(error.message);

      const url = String((data as any)?.payment_link_url || '');
      if (!url) throw new Error('Could not create payment link');

      if (Platform.OS === 'web') {
        const location = (globalThis as any)?.location as { assign?: (u: string) => void; href?: string } | undefined;
        if (typeof location?.assign === 'function') {
          location.assign(url);
        } else if (location && typeof location.href === 'string') {
          location.href = url;
        }
      } else {
        try {
          await WebBrowser.openBrowserAsync(url);
        } catch {
          await Linking.openURL(url);
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to start payment');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handlePayInCash = () => {
    Alert.alert(
      'Confirm Cash Payment',
      `Are you sure you want to pay ${formatCurrency(MEMBERSHIP_AMOUNT)} in cash to NDADA?\n\nAn admin will verify and process your payment.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Yes, Proceed',
          onPress: async () => {
            try {
              console.log('Proceeding with cash payment for member:', member.id);
              // Update payment method to cash
              const { error } = await supabase
                .from('accounts')
                .update({
                  payment_method: 'cash',
                })
                .eq('id', member.id);

              if (error) {
                console.error('Error updating payment method:', error);
                Alert.alert('Error', 'Failed to process cash payment request');
                return;
              }

              console.log('Payment method updated to cash, navigating to review page');
              // Navigate to cash payment review page
              router.push('/(dashboard)/cash-payment-review');
            } catch (err: any) {
              console.error('Cash payment error:', err);
              Alert.alert('Error', err?.message || 'Failed to process request');
            }
          },
          style: 'default',
        },
      ]
    );
  };

  // With consolidated schema, the member record IS the firm
  const hasFirmData = !!member.firm_name;

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="p-4 pb-8">
      <View className="mx-auto w-full max-w-lg">
        {/* Success Notice */}
        {params.success === 'true' && (
          <View className="mb-4 rounded-lg bg-blue-50 p-3">
            <Text className="text-sm text-blue-700">
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
            <ShoppingCart size={24} color="#1d4ed8" />
          </View>
          <View>
            <Text className="text-xl font-bold text-gray-900">Your Cart</Text>
            <Text className="text-sm text-gray-500">Review your registration fee and complete payment</Text>
          </View>
        </View>

        <Card className="mb-4 border-primary-100 bg-primary-50">
          <CardHeader title={MEMBERSHIP_PLAN_NAME} subtitle="One-time payment" />
          <Text className="text-sm text-primary-700">
            This registration fee activates the member profile linked to {member.membership_id} and enables certificate issuance after approval.
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
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-gray-500">Status</Text>
                <StatusBadge status={member.approval_status} />
              </View>
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
                  <Award size={20} color="#1d4ed8" />
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
    <View className="flex-row justify-between">
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text className="text-sm font-medium text-gray-900">{value}</Text>
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
