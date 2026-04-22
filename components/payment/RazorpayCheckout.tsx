import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Alert, Platform } from 'react-native';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button, Card, CardHeader } from '@/components/ui';
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

// Razorpay types
interface RazorpayOrderResponse {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  attempts: number;
  notes: Record<string, unknown>;
  created_at: number;
}

interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface VerifySignatureResponse {
  verified: boolean;
  order_id?: string;
  payment_id?: string;
  message?: string;
  error?: string;
}

// ============================================================
// Razorpay Checkout Component
// ============================================================

export function RazorpayCheckout() {
  const { member, session, refreshMember } = useAuth();
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const checkoutRef = useRef<any>(null);

  // Initialize Razorpay script (Web only)
  useEffect(() => {
    if (Platform.OS !== 'web') return;

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

  if (!member || !session) {
    return null;
  }

  // ============================================================
  // STEP 1: Create Order
  // ============================================================
  const handleCreateOrder = async () => {
    console.log('1️⃣ Creating Razorpay order...');
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('razorpay-create-order', {
        body: { member_id: member.id },
      });

      if (error) {
        console.error('❌ Order creation failed:', error);
        Alert.alert('Error', 'Failed to create order. Please try again.');
        return;
      }

      if (!data || !data.id) {
        console.error('❌ Invalid response from order creation');
        Alert.alert('Error', 'Invalid order response');
        return;
      }

      console.log('✅ Order created:', data.id);
      console.log('   Amount:', data.amount, 'paise');

      // Proceed to checkout
      await handleCheckout(data);
    } catch (err: any) {
      console.error('❌ Order creation error:', err.message);
      Alert.alert('Error', err?.message || 'Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // STEP 2: Open Checkout
  // ============================================================
  const handleCheckout = async (order: RazorpayOrderResponse) => {
    console.log('2️⃣ Opening Razorpay checkout...');

    const keyId = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID;
    if (!keyId) {
      Alert.alert('Error', 'Razorpay configuration missing');
      return;
    }

    const checkoutOptions = {
      key: keyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.id,
      name: 'NDADA Membership',
      description: 'Registration Fee',
      prefill: {
        name: member.full_name,
        email: member.email,
        contact: member.phone || '',
      },
      notes: {
        member_id: member.id,
        membership_id: member.membership_id,
      },
      theme: {
        color: '#3399cc',
      },
      timeout: 600,
    };

    if (Platform.OS === 'web') {
      // Web: Use Razorpay object
      const Razorpay = (window as any).Razorpay;
      if (!Razorpay) {
        Alert.alert('Error', 'Razorpay SDK not loaded');
        return;
      }

      checkoutRef.current = new Razorpay({
        ...checkoutOptions,
        handler: (response: RazorpaySuccessResponse) =>
          handlePaymentSuccess(response),
      });
      checkoutRef.current.open();
    } else {
      // React Native: Use react-native-razorpay
      try {
        const RazorpayCheckout = require('react-native-razorpay').default;
        RazorpayCheckout.open(checkoutOptions)
          .then((response: RazorpaySuccessResponse) =>
            handlePaymentSuccess(response)
          )
          .catch((error: any) => handlePaymentFailure(error));
      } catch (err: any) {
        console.error('❌ Razorpay module not available:', err.message);
        // Fallback: Open in WebBrowser
        await WebBrowser.openBrowserAsync(
          `https://checkout.razorpay.com/?key_id=${keyId}&order_id=${order.id}`
        );
      }
    }
  };

  // ============================================================
  // STEP 3: Payment Success
  // ============================================================
  const handlePaymentSuccess = async (response: RazorpaySuccessResponse) => {
    console.log('3️⃣ Payment successful, verifying signature...');
    console.log('   Order ID:', response.razorpay_order_id);
    console.log('   Payment ID:', response.razorpay_payment_id);

    setVerifying(true);

    try {
      // STEP 4: Verify Signature (CRITICAL)
      const verifyResponse = await verifyPaymentSignature(response);

      if (!verifyResponse.verified) {
        console.error('❌ Signature verification failed');
        Alert.alert(
          'Security Alert',
          'Payment signature verification failed. This payment has not been processed for security reasons.'
        );
        return;
      }

      console.log('✅ Signature verified successfully');

      // Show success message
      Alert.alert(
        'Success',
        'Payment verified! We are confirming your payment. Please wait...',
        [
          {
            text: 'OK',
            onPress: () => refreshMember(),
          },
        ]
      );

      // Refresh member status
      setTimeout(() => refreshMember(), 2000);
    } catch (err: any) {
      console.error('❌ Verification error:', err.message);
      Alert.alert(
        'Verification Error',
        err?.message || 'Failed to verify payment'
      );
    } finally {
      setVerifying(false);
    }
  };

  // ============================================================
  // STEP 4: Verify Signature
  // ============================================================
  const verifyPaymentSignature = async (
    response: RazorpaySuccessResponse
  ): Promise<VerifySignatureResponse> => {
    console.log('📝 Verifying payment signature (HMAC-SHA256)...');

    try {
      const { data, error } = await supabase.functions.invoke(
        'razorpay-verify-signature',
        {
          body: {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          },
        }
      );

      if (error) {
        console.error('❌ Verification failed:', error);
        throw new Error(error.message || 'Verification failed');
      }

      if (!data) {
        throw new Error('No response from verification');
      }

      console.log('✅ Verification response:', {
        verified: data.verified,
        order_id: data.order_id,
        payment_id: data.payment_id,
      });

      return data;
    } catch (err: any) {
      console.error('❌ Verification error:', err.message);
      throw err;
    }
  };

  // ============================================================
  // STEP 5: Payment Failure
  // ============================================================
  const handlePaymentFailure = (error: any) => {
    console.error('❌ Payment failed:', error);

    const errorMessage = error?.description || error?.message || 'Payment failed';
    Alert.alert(
      'Payment Failed',
      errorMessage,
      [
        {
          text: 'Retry',
          onPress: () => handleCreateOrder(),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  return (
    <Card>
      <CardHeader
        title="Pay Registration Fee"
        subtitle="Complete your membership registration"
      />
      <View className="gap-3">
        <View className="gap-2">
          <Text className="text-sm font-medium text-gray-700">Fee Amount</Text>
          <Text className="text-2xl font-bold text-gray-900">₹{member.payment_status === 'paid' ? 'Paid' : '300'}</Text>
        </View>

        {member.payment_status === 'paid' ? (
          <View className="rounded-lg bg-green-50 p-3">
            <Text className="text-sm font-medium text-green-800">
              ✅ Payment completed
            </Text>
          </View>
        ) : (
          <>
            <Button
              title={verifying ? 'Verifying Payment...' : 'Pay with Razorpay'}
              onPress={handleCreateOrder}
              loading={loading || verifying}
              size="lg"
              className="w-full"
            />
            <Text className="text-center text-xs text-gray-500">
              Secure payment powered by Razorpay
            </Text>
          </>
        )}
      </View>
    </Card>
  );
}
