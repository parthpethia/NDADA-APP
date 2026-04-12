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
      console.log('\n4️⃣ Invoking razorpay-create-payment-link...');
      console.log('   URL: razorpay-create-payment-link');
      console.log('   Auth: Bearer ' + session.access_token.substring(0, 20) + '...');
      console.log('   Body: { token: ... }');

      const { data, error } = await supabase.functions.invoke('razorpay-create-payment-link', {
        body: {
          token: session.access_token,
        },
      });

      console.log('\n5️⃣ Response received:');
      console.log('   Data:', JSON.stringify(data));
      console.log('   Error:', error ? `${error.message}` : 'None');

      if (error) {
        console.error('❌ RAZORPAY FUNCTION ERROR:', error);
        throw new Error(`Function error: ${error.message}`);
      }

      if (!data) {
        console.error('❌ NO DATA IN RESPONSE');
        throw new Error('No data returned from function');
      }

      const url = String((data as any)?.payment_link_url || '');
      console.log('\n6️⃣ Extracted URL:', url ? `✅ ${url.substring(0, 50)}...` : '❌ MISSING');

      if (!url) {
        console.error('❌ NO PAYMENT LINK URL');
        throw new Error('Could not create payment link');
      }

      console.log('\n7️⃣ Attempting redirect...');
      console.log('   Platform:', Platform.OS);

      setPaymentLinkUrl(url);

      if (Platform.OS === 'web') {
        console.log('   Method: window.location');
        const location = (globalThis as any)?.location;
        console.log('   location object:', location ? '✅ Available' : '❌ Missing');
        console.log('   location.assign:', typeof location?.assign);
        console.log('   location.href:', typeof location?.href);

        if (typeof location?.assign === 'function') {
          console.log('   🔗 Using location.assign()');
          location.assign(url);
          console.log('   ✅ Navigate called');
        } else if (location && typeof location.href === 'string') {
          console.log('   🔗 Using location.href');
          location.href = url;
          console.log('   ✅ Navigate called');
        } else {
          console.error('   ❌ No navigation method available');
          Alert.alert('Success', 'Payment link created:\n' + url + '\n\nPlease visit manually');
        }
      } else {
        try {
          console.log('   Opening in WebBrowser...');
          await WebBrowser.openBrowserAsync(url);
          console.log('   ✅ Browser opened');
        } catch (e) {
          console.log('   WebBrowser failed, trying Linking:', e);
          await Linking.openURL(url);
          console.log('   ✅ Linking used');
        }
      }

      console.log('\n✅ === PAYMENT FLOW COMPLETE ===\n');
    } catch (err: any) {
      console.error('\n❌ === PAYMENT FLOW FAILED ===');
      console.error('Error:', err.message);
      console.error('Stack:', err.stack);
      Alert.alert('Error', err?.message || 'Failed to start payment');
    } finally {
      setPaymentLoading(false);
    }
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
