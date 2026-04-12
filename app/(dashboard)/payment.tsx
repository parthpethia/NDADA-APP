import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, Platform, Linking } from 'react-native';
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
import { CheckCircle, Clock, XCircle } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';

export default function PaymentScreen() {
  const { member, refreshMember, session } = useAuth();
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchLatestPaymentLink = async () => {
      if (!member) return;
      const { data } = await supabase
        .from('payments')
        .select('razorpay_payment_link_url, status')
        .eq('member_id', member.id)
        .order('created_at', { ascending: false })
        .limit(1);
      const latest = data?.[0] as any | undefined;
      if (latest?.status === 'pending' && typeof latest?.razorpay_payment_link_url === 'string') {
        setPaymentLinkUrl(latest.razorpay_payment_link_url);
      }
    };

    fetchLatestPaymentLink();
  }, [member?.id, member?.payment_status]);

  if (!member) return null;

  const handlePayWithRazorpay = async () => {
    if (!member || !session) {
      console.error('❌ Missing member or session');
      Alert.alert('Error', 'Not authenticated');
      return;
    }

    setPaymentLoading(true);
    try {
      console.log('💳 Starting Razorpay payment flow for member:', member.id);
      console.log('🔐 Using session token:', session.access_token ? '✅ Present' : '❌ Missing');

      const { data, error } = await supabase.functions.invoke('razorpay-create-payment-link', {
        body: {},
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      console.log('📢 Razorpay response:', { data, error });

      if (error) {
        console.error('❌ Razorpay function error:', error);
        throw new Error(error.message);
      }

      const url = String((data as any)?.payment_link_url || '');
      if (!url) {
        console.error('❌ No payment link URL in response:', data);
        throw new Error('Could not create payment link');
      }

      console.log('✅ Got payment link:', url);
      setPaymentLinkUrl(url);

      if (Platform.OS === 'web') {
        // Popups can be blocked if opened after an async call; use same-tab navigation.
        const location = (globalThis as any)?.location as { assign?: (u: string) => void; href?: string } | undefined;
        if (typeof location?.assign === 'function') {
          console.log('🌐 Navigating to Razorpay (web - assign)');
          location.assign(url);
        } else if (location && typeof location.href === 'string') {
          console.log('🌐 Navigating to Razorpay (web - href)');
          location.href = url;
        }
      } else {
        try {
          console.log('📱 Opening Razorpay in browser');
          await WebBrowser.openBrowserAsync(url);
        } catch {
          console.log('📱 WebBrowser failed, trying Linking');
          await Linking.openURL(url);
        }
      }
    } catch (err: any) {
      console.error('❌ Payment error:', err);
      Alert.alert('Error', err?.message || 'Failed to start payment');
    }
    setPaymentLoading(false);
  };

  const handleRefreshStatus = async () => {
    setRefreshing(true);
    try {
      await refreshMember();
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
            ) : member.payment_status === 'failed' ? (
              <>
                <View className="mb-3 rounded-full bg-red-100 p-4">
                  <XCircle size={48} color="#dc2626" />
                </View>
                <Text className="text-xl font-bold text-red-700">Payment Failed</Text>
                <Text className="mt-1 text-gray-500">
                  Please try again
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

        {/* Razorpay */}
        {member.payment_status !== 'paid' && (
          <Card className="mb-4">
            <CardHeader title="Pay with Razorpay" subtitle="Fast, secure online payment" />
            <View className="gap-3">
              <Button
                title={paymentLinkUrl ? 'Continue Payment' : 'Pay Now'}
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
                After completing payment in Razorpay, come back and tap Refresh Status.
              </Text>
            </View>
          </Card>
        )}
      </View>
    </ScrollView>
  );
}
