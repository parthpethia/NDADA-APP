import { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, Alert, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { Card, CardHeader, Button } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { useRazorpayCheckout } from '@/lib/useRazorpayCheckout';
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

export default function CartScreen() {
  const { member, refreshMember } = useAuth();
  const params = useLocalSearchParams<{ success?: string; cancelled?: string }>();
  const [showCashConfirm, setShowCashConfirm] = useState(false);

  const {
    paymentLoading,
    cashSubmitting,
    cashError,
    handlePayWithRazorpay,
    confirmCashPayment,
    reconcilePaymentStatus,
    setCashError,
  } = useRazorpayCheckout();

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
    } else if (member.payment_status === 'processing') {
      reconcilePaymentStatus();
    }
  }, [member?.payment_method, member?.payment_status, member?.cash_payment_verified, member?.id, reconcilePaymentStatus]);

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

  // Payment processing — show verification view
  if (member.payment_status === 'processing') {
    return (
      <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="p-4 pb-8">
        <View className="mx-auto w-full max-w-lg items-center py-8">
          <View className="mb-4 rounded-full bg-primary-100 p-5">
            <CheckCircle size={48} color="#15803d" />
          </View>
          <Text className="mb-2 text-2xl font-bold text-primary-900">Verifying Payment...</Text>
          <Text className="mb-6 text-center text-gray-500">
            We're confirming your payment with Razorpay. Your certificate will be ready shortly.
          </Text>
          <Button
            title="View Certificate"
            onPress={() => router.push('/(dashboard)/certificate')}
            size="lg"
          />
          <Button
            title="Check Payment Status"
            variant="outline"
            onPress={() => void reconcilePaymentStatus()}
            className="mt-3"
          />
        </View>
      </ScrollView>
    );
  }

  const handlePayInCash = () => {
    setCashError(null);
    setShowCashConfirm(true);
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
              onPress={handlePayWithRazorpay}
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
