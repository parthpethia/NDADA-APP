import { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { Card, CardHeader, Button } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import {
  MEMBERSHIP_AMOUNT,
  MEMBERSHIP_PLAN_NAME,
  MEMBERSHIP_SUPPORT_EMAIL,
} from '@/constants';
import { CheckCircle } from 'lucide-react-native';

const AUTO_REDIRECT_SECONDS = 4;

export default function PaymentSuccessScreen() {
  const router = useRouter();
  const { member } = useAuth();
  const [countdown, setCountdown] = useState(AUTO_REDIRECT_SECONDS);
  const redirectedRef = useRef(false);

  // Auto-redirect countdown to certificate page
  useEffect(() => {
    if (redirectedRef.current) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (!redirectedRef.current) {
            redirectedRef.current = true;
            router.replace('/(dashboard)/certificate');
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  // If user navigates here but isn't paid, send them to payment page
  useEffect(() => {
    if (member && member.payment_status !== 'paid' && member.payment_status !== 'processing') {
      router.replace('/(dashboard)/payment');
    }
  }, [member?.payment_status, router]);

  if (!member) return null;

  const handleViewCertificate = () => {
    if (!redirectedRef.current) {
      redirectedRef.current = true;
      router.replace('/(dashboard)/certificate');
    }
  };

  const handleGoToDashboard = () => {
    if (!redirectedRef.current) {
      redirectedRef.current = true;
      router.replace('/(dashboard)');
    }
  };

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="p-4 pb-8">
      <View className="mx-auto w-full max-w-lg items-center py-8">
        {/* Success Icon */}
        <View className="mb-4 rounded-full bg-green-100 p-6">
          <CheckCircle size={64} color="#16a34a" />
        </View>

        {/* Success Header */}
        <Text className="mb-2 text-2xl font-bold text-green-800">
          Transaction Successful!
        </Text>
        <Text className="mb-6 text-center text-gray-500">
          Your payment has been verified and confirmed.
        </Text>

        {/* Payment Details Card */}
        <Card className="mb-4 w-full">
          <CardHeader title="Payment Summary" />
          <View className="gap-2">
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Plan</Text>
              <Text className="font-medium text-gray-900">{MEMBERSHIP_PLAN_NAME}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Amount Paid</Text>
              <Text className="font-medium text-green-700">{formatCurrency(MEMBERSHIP_AMOUNT)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Membership ID</Text>
              <Text className="font-medium text-gray-900">
                {member.membership_id || 'Being assigned...'}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Payment Method</Text>
              <Text className="font-medium text-gray-900">Online (Razorpay)</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Status</Text>
              <Text className="font-semibold text-green-700">✅ Verified</Text>
            </View>
          </View>
        </Card>

        {/* Next Steps */}
        <Card className="mb-5 w-full border-primary-100 bg-primary-50">
          <CardHeader title="What's Next?" />
          <View className="gap-1">
            <Text className="text-sm text-primary-800">
              Your membership certificate is being generated automatically. You'll be redirected shortly.
            </Text>
            <Text className="pt-1 text-xs text-primary-700">
              Need help? Contact {MEMBERSHIP_SUPPORT_EMAIL}.
            </Text>
          </View>
        </Card>

        {/* Auto-redirect countdown */}
        <Text className="mb-4 text-center text-sm text-gray-400">
          Redirecting to certificate in {countdown}s...
        </Text>

        {/* Action Buttons */}
        <View className="w-full gap-3">
          <Button
            title="View Certificate"
            onPress={handleViewCertificate}
            size="lg"
            className="w-full"
          />
          <Button
            title="Go to Dashboard"
            variant="outline"
            onPress={handleGoToDashboard}
            className="w-full"
          />
        </View>
      </View>
    </ScrollView>
  );
}
