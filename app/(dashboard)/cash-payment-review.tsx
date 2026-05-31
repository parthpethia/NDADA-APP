import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, AppState } from 'react-native';
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
import { Clock, AlertCircle, CheckCircle } from 'lucide-react-native';

export default function CashPaymentReviewScreen() {
  const router = useRouter();
  const { member, refreshMember } = useAuth();
  const [cashVerified, setCashVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [changingMethod, setChangingMethod] = useState(false);

  useEffect(() => {
    if (!member) return;

    const checkCashPaymentVerification = async () => {
      try {
        const { data } = await supabase
          .from('accounts')
          .select('cash_payment_verified, cash_payment_verified_at')
          .eq('id', member.id)
          .single();

        if (data?.cash_payment_verified) {
          setCashVerified(true);
          await refreshMember();
        } else {
          setCashVerified(false);
        }
      } catch (err) {
        console.error('Error checking cash payment verification:', err);
      } finally {
        setLoading(false);
      }
    };

    checkCashPaymentVerification();

    let channel: any = null;

    const subscribe = () => {
      if (channel) return;

      // Ensure global realtime client is connected
      supabase.realtime.connect();

      channel = supabase
        .channel(`cash-verify-${member.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'accounts',
            filter: `id=eq.${member.id}`,
          },
          async (payload) => {
            if (payload.new?.cash_payment_verified) {
              setCashVerified(true);
              await refreshMember();
            } else {
              setCashVerified(false);
            }
          }
        );

      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to cash-verify-${member.id}`);
        }
      });
    };

    const unsubscribe = () => {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
        console.log(`Unsubscribed from cash-verify-${member.id}`);
      }
    };

    // Set up subscription if app is active on mount
    if (AppState.currentState === 'active') {
      subscribe();
    }

    // AppState change listener
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      console.log(`Cash verification AppState changed to: ${nextAppState}`);
      if (nextAppState === 'active') {
        checkCashPaymentVerification();
        subscribe();
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        unsubscribe();
      }
    });

    // Cleanup: remove channel and listener on unmount
    return () => {
      subscription.remove();
      unsubscribe();
    };
  }, [member?.id, refreshMember]);

  if (!member) return null;

  const handleGoBack = () => {
    router.back();
  };

  const handleProceedToCertificate = () => {
    router.push('/(dashboard)/certificate');
  };

  const handleChangePaymentMethod = async () => {
    if (!member) return;
    setChangingMethod(true);
    try {
      const { error } = await supabase
        .from('accounts')
        .update({ payment_method: 'online' })
        .eq('id', member.id);

      if (error) throw error;
      
      await refreshMember();
      router.replace('/cart');
    } catch (err) {
      console.error('Error changing payment method:', err);
      Alert.alert('Error', 'Failed to change payment method');
    } finally {
      setChangingMethod(false);
    }
  };

  if (loading) {
    return (
      <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="p-4 pb-8">
        <View className="mx-auto w-full max-w-lg">
          <Card>
            <Text className="text-center text-gray-500">Loading verification status...</Text>
          </Card>
        </View>
      </ScrollView>
    );
  }

  if (cashVerified) {
    return (
      <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="p-4 pb-8">
        <View className="mx-auto w-full max-w-lg">
          {/* Success Status Card */}
          <Card className="mb-4">
            <View className="items-center py-4">
              <View className="mb-3 rounded-full bg-green-100 p-4">
                <CheckCircle size={48} color="#15803d" />
              </View>
              <Text className="text-xl font-bold text-green-700">Payment Verified!</Text>
              <Text className="mt-1 text-center text-gray-500">
                Your cash payment has been verified by admin
              </Text>
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
                <Text className="text-gray-500">Payment Method</Text>
                <Text className="font-medium text-green-700">Cash (Verified)</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-500">Status</Text>
                <StatusBadge status="paid" />
              </View>
            </View>
          </Card>

          {/* Next Steps */}
          <Card className="mb-4 border-primary-100 bg-primary-50">
            <CardHeader title="Next Steps" />
            <View className="gap-2">
              <Text className="text-sm text-primary-800">
                Your payment has been verified and confirmed!
              </Text>
              <Text className="text-sm text-primary-800">
                You can now proceed to view your certificate and access all membership benefits.
              </Text>
              <Text className="pt-1 text-xs text-primary-700">
                Need help? Contact {MEMBERSHIP_SUPPORT_EMAIL}.
              </Text>
            </View>
          </Card>

          {/* Action Buttons */}
          <Card>
            <View className="gap-3">
              <Button
                title="View Certificate"
                onPress={handleProceedToCertificate}
                size="lg"
                className="w-full"
              />
              <Button
                title="Return to Dashboard"
                variant="outline"
                onPress={() => router.navigate('/(dashboard)/')}
                className="w-full"
              />
            </View>
          </Card>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="p-4 pb-8">
      <View className="mx-auto w-full max-w-lg">
        {/* Status Card */}
        <Card className="mb-4">
          <View className="items-center py-4">
            <View className="mb-3 rounded-full bg-yellow-100 p-4">
              <Clock size={48} color="#ca8a04" />
            </View>
            <Text className="text-xl font-bold text-gray-900">Payment Under Review</Text>
            <Text className="mt-1 text-center text-gray-500">
              Your cash payment request is pending admin approval
            </Text>
          </View>
        </Card>

        {/* Alert Box */}
        <Card className="mb-4 border-yellow-100 bg-yellow-50">
          <View className="flex-row gap-3">
            <View className="pt-1">
              <AlertCircle size={20} color="#ca8a04" />
            </View>
            <View className="flex-1">
              <Text className="font-medium text-yellow-900">Payment Method: Cash</Text>
              <Text className="mt-1 text-sm text-yellow-800">
                An admin will verify and process your cash payment shortly. You'll receive a notification once the payment is confirmed. This page will auto-update.
              </Text>
            </View>
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
              <StatusBadge status="pending" />
            </View>
          </View>
        </Card>

        {/* Next Steps */}
        <Card className="mb-4 border-primary-100 bg-primary-50">
          <CardHeader title="Next Steps" />
          <View className="gap-2">
            <Text className="text-sm text-primary-800">
              <Text className="font-semibold">1. Arrange Payment:</Text> Contact the admin to arrange cash payment.
            </Text>
            <Text className="text-sm text-primary-800">
              <Text className="font-semibold">2. Wait for Confirmation:</Text> Once you pay, the admin will verify the payment.
            </Text>
            <Text className="text-sm text-primary-800">
              <Text className="font-semibold">3. Proceed:</Text> After verification, you can access your certificate.
            </Text>
            <Text className="pt-1 text-xs text-primary-700">
              Need help? Contact {MEMBERSHIP_SUPPORT_EMAIL}.
            </Text>
          </View>
        </Card>

        {/* Action Buttons */}
        <Card>
          <View className="gap-3">
            <Button
              title="Go Back"
              onPress={handleGoBack}
              size="lg"
              className="w-full"
            />
            <Button
              title="Change Payment Method"
              variant="outline"
              onPress={handleChangePaymentMethod}
              loading={changingMethod}
              className="w-full"
            />
            <Button
              title="Return to Dashboard"
              variant="outline"
              onPress={() => router.navigate('/(dashboard)/')}
              className="w-full"
            />
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}
