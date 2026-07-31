import { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { Card, CardHeader, Button, StatusBadge } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { useRazorpayCheckout } from '@/lib/useRazorpayCheckout';
import {
  MEMBERSHIP_AMOUNT,
  MEMBERSHIP_PLAN_NAME,
  MEMBERSHIP_VALIDITY_LABEL,
  MEMBERSHIP_SUPPORT_EMAIL,
} from '@/constants';
import { CheckCircle, Clock, XCircle } from 'lucide-react-native';

export default function PaymentScreen() {
  const router = useRouter();
  const { member } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const reconciledRef = useRef(false);

  const {
    paymentLoading,
    verifying,
    handlePayWithRazorpay,
    reconcilePaymentStatus,
  } = useRazorpayCheckout();

  useEffect(() => {
    if (!member) return;

    if (member.payment_status === 'paid') {
      router.replace('/(dashboard)/payment-success');
      return;
    }

    if (member.payment_status === 'processing' && !reconciledRef.current) {
      reconciledRef.current = true;
      reconcilePaymentStatus();
    }
  }, [member?.payment_status, member?.id, reconcilePaymentStatus, router]);

  if (!member) return null;

  // Crucial Fix (Bug 1): 'processing' is explicitly EXCLUDED from showing pay buttons!
  const shouldShowPayButton =
    member.payment_status !== 'paid' &&
    member.payment_status !== 'processing';

  const handleRefreshStatus = async () => {
    setRefreshing(true);
    try {
      await reconcilePaymentStatus();
      // The useEffect watching member.payment_status will automatically redirect if status is now 'paid'
    } finally {
      setRefreshing(false);
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
                <View className="mb-3 rounded-full bg-primary-100 p-4">
                  <Clock size={48} color="#16a34a" />
                </View>
                <Text className="text-xl font-bold text-primary-700">Verifying Payment</Text>
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
                  Your payment link has expired. Try again below.
                </Text>
              </>
            ) : member.payment_status === 'abandoned' ? (
              <>
                <View className="mb-3 rounded-full bg-gray-100 p-4">
                  <XCircle size={48} color="#6b7280" />
                </View>
                <Text className="text-xl font-bold text-gray-700">Payment Abandoned</Text>
                <Text className="mt-1 text-center text-sm text-gray-500">
                  You didn't complete payment. Click below to try again.
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
              <Text className="font-medium text-gray-900">{member.membership_id || 'Assigned after payment'}</Text>
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

        <Card className="mb-4 border-primary-100 bg-primary-50">
          <CardHeader title="After Payment" subtitle="What happens next" />
          <View className="gap-2">
            <Text className="text-sm text-primary-800">1. Your payment is confirmed securely via Razorpay.</Text>
            <Text className="text-sm text-primary-800">2. Your firm application moves into review.</Text>
            <Text className="text-sm text-primary-800">3. Your certificate becomes available after approval.</Text>
            <Text className="pt-1 text-xs text-primary-700">
              Need help? Contact {MEMBERSHIP_SUPPORT_EMAIL}.
            </Text>
          </View>
        </Card>

        {/* Razorpay Action Area */}
        {member.payment_status === 'processing' || verifying ? (
          <Card className="mb-4">
            <CardHeader
              title="Verify Payment"
              subtitle="Confirming your payment status"
            />
            <View className="gap-3">
              <Button
                title={verifying ? "Verifying Signature..." : "Refresh Payment Status"}
                onPress={handleRefreshStatus}
                loading={refreshing || verifying}
                size="lg"
                className="w-full"
              />
              <Text className="text-center text-xs text-gray-500">
                We're checking your payment status. This usually takes a few seconds.
              </Text>
            </View>
          </Card>
        ) : shouldShowPayButton ? (
          <Card className="mb-4">
            <CardHeader
              title="Pay Registration Fee"
              subtitle="Fast, secure online payment powered by Razorpay"
            />
            <View className="gap-3">
              <Button
                title={
                  member.payment_status === 'failed' ||
                  member.payment_status === 'expired' ||
                  member.payment_status === 'abandoned'
                    ? 'Retry Online Payment'
                    : 'Pay Online Now'
                }
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
              <Text className="text-center text-xs text-gray-500">
                Secure online payment via UPI, Credit/Debit Cards, Net Banking, or Wallets.
              </Text>
            </View>
          </Card>
        ) : null}
      </View>
    </ScrollView>
  );
}
