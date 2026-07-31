import { View, Text, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { Card, CardHeader, Button } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import {
  MEMBERSHIP_AMOUNT,
  MEMBERSHIP_PLAN_NAME,
  MEMBERSHIP_SUPPORT_EMAIL,
} from '@/constants';
import { XCircle } from 'lucide-react-native';

export default function PaymentFailedScreen() {
  const router = useRouter();
  const { member } = useAuth();
  const params = useLocalSearchParams<{ reason?: string; code?: string }>();

  const failureReason =
    params.reason ||
    (member?.payment_status === 'expired'
      ? 'Your payment link has expired.'
      : member?.payment_status === 'abandoned'
      ? 'Payment was cancelled or closed before completion.'
      : 'Payment could not be processed. Please try again.');

  const handleRetryPayment = () => {
    router.replace('/(dashboard)/payment');
  };

  const handleGoToDashboard = () => {
    router.replace('/(dashboard)');
  };

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="p-4 pb-8">
      <View className="mx-auto w-full max-w-lg items-center py-8">
        {/* Failure Icon */}
        <View className="mb-4 rounded-full bg-red-100 p-6">
          <XCircle size={64} color="#dc2626" />
        </View>

        {/* Failure Header */}
        <Text className="mb-2 text-2xl font-bold text-red-800">
          Payment Unsuccessful
        </Text>
        <Text className="mb-6 text-center text-gray-500">
          Don't worry — no money was deducted from your account.
        </Text>

        {/* Reason Card */}
        <Card className="mb-4 w-full border-red-100 bg-red-50">
          <CardHeader title="Transaction Details" />
          <View className="gap-2">
            <View className="flex-row justify-between">
              <Text className="text-gray-600">Plan</Text>
              <Text className="font-medium text-gray-900">{MEMBERSHIP_PLAN_NAME}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-600">Amount</Text>
              <Text className="font-medium text-gray-900">{formatCurrency(MEMBERSHIP_AMOUNT)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-600">Status</Text>
              <Text className="font-semibold text-red-700">Failed / Cancelled</Text>
            </View>
            <View className="mt-2 border-t border-red-200 pt-2">
              <Text className="text-xs font-semibold text-red-900">Reason:</Text>
              <Text className="mt-0.5 text-xs text-red-800">{failureReason}</Text>
            </View>
          </View>
        </Card>

        {/* Help Card */}
        <Card className="mb-5 w-full border-gray-200 bg-white">
          <CardHeader title="What can you do?" />
          <View className="gap-2">
            <Text className="text-sm text-gray-700">
              • Ensure your UPI / Card / Net Banking details are correct.
            </Text>
            <Text className="text-sm text-gray-700">
              • Make sure your bank has sufficient balance and daily limit.
            </Text>
            <Text className="text-sm text-gray-700">
              • If money was debited by mistake, Razorpay will auto-refund it within 3-5 business days.
            </Text>
            <Text className="pt-1 text-xs text-gray-500">
              Need assistance? Contact support at {MEMBERSHIP_SUPPORT_EMAIL}.
            </Text>
          </View>
        </Card>

        {/* Action Buttons */}
        <View className="w-full gap-3">
          <Button
            title="Try Payment Again"
            onPress={handleRetryPayment}
            size="lg"
            className="w-full"
          />
          <Button
            title="Return to Dashboard"
            variant="outline"
            onPress={handleGoToDashboard}
            className="w-full"
          />
        </View>
      </View>
    </ScrollView>
  );
}
