import { useEffect, useState } from 'react';
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
  const { member, refreshMember } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [showPaymentMethodSelection, setShowPaymentMethodSelection] = useState(true);
  const [showCashConfirm, setShowCashConfirm] = useState(false);

  const {
    paymentLoading,
    verifying,
    cashSubmitting,
    cashError,
    handlePayWithRazorpay,
    confirmCashPayment,
    reconcilePaymentStatus,
    setCashError,
  } = useRazorpayCheckout();

  useEffect(() => {
    if (!member) return;
    if (member.payment_status === 'paid') {
      router.replace('/(dashboard)/certificate');
      return;
    }
    const cashSelected = member.payment_method === 'cash';
    const cashPending = cashSelected && !member.cash_payment_verified;
    if (cashPending) {
      router.replace('/(dashboard)/cash-payment-review');
      return;
    }
    if (member.payment_status === 'processing') {
      reconcilePaymentStatus();
    }
  }, [member?.payment_method, member?.payment_status, member?.cash_payment_verified, member?.id, reconcilePaymentStatus]);

  if (!member) return null;

  const shouldShowPaymentMethods =
    member.payment_status !== 'paid' &&
    (member.payment_status === 'pending' ||
     member.payment_status === 'failed' ||
     member.payment_status === 'expired' ||
     member.payment_status === 'abandoned' ||
     member.payment_status === 'processing');

  const handleRefreshStatus = async () => {
    setRefreshing(true);
    try {
      await reconcilePaymentStatus();
      if (member?.payment_status === 'paid') {
        router.replace('/(dashboard)/certificate');
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handlePayOnline = () => {
    setShowPaymentMethodSelection(false);
  };

  const handlePayInCash = () => {
    setCashError(null);
    setShowCashConfirm(true);
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
            <Text className="text-sm text-primary-800">1. Your payment is confirmed securely.</Text>
            <Text className="text-sm text-primary-800">2. Your firm application moves into review.</Text>
            <Text className="text-sm text-primary-800">3. Your certificate becomes available after approval.</Text>
            <Text className="pt-1 text-xs text-primary-700">
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
                    title={verifying ? "Verifying Signature..." : "Refresh Payment Status"}
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
