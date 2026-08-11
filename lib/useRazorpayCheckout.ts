import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { getFunctionsErrorMessage } from '@/lib/utils';
import * as WebBrowser from 'expo-web-browser';

export interface UseRazorpayCheckoutReturn {
  paymentLoading: boolean;
  verifying: boolean;
  handlePayWithRazorpay: () => Promise<void>;
  reconcilePaymentStatus: () => Promise<void>;
}

export function useRazorpayCheckout(): UseRazorpayCheckoutReturn {
  const router = useRouter();
  const { member, refreshMember, session } = useAuth();
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const checkoutRef = useRef<any>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load Razorpay checkout.js script on Web
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if ((window as any).Razorpay) return;

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

  const reconcilePaymentStatus = useCallback(async () => {
    if (!member) return;
    try {
      await supabase.functions.invoke('payment-reconciliation', {
        body: { member_id: member.id, force: true },
      });
    } catch (e) {
      console.warn('Reconciliation call warning:', e);
    } finally {
      await refreshMember();
      if (session?.user?.id) {
        try {
          const { cacheInvalidate, cacheKey } = require('@/lib/queryCache');
          cacheInvalidate(cacheKey('dashboard', session.user.id));
        } catch (e) {
          console.warn('Failed to invalidate dashboard cache:', e);
        }
      }
    }
  }, [member, refreshMember, session]);

  const handlePaymentFailure = useCallback((error: any) => {
    if (__DEV__) {
      console.error('❌ Payment failed:', error);
    }
    if (isMountedRef.current) {
      setPaymentLoading(false);
    }
    const errorMessage = error?.description || error?.message || 'Payment was cancelled or failed.';
    router.push({
      pathname: '/(dashboard)/payment-failed',
      params: { reason: errorMessage },
    });
  }, [router]);

  const handlePaymentSuccess = useCallback(async (response: any) => {
    if (__DEV__) {
      console.log('3️⃣ Payment successful, verifying signature...');
    }
    if (isMountedRef.current) {
      setVerifying(true);
      setPaymentLoading(false);
    }

    try {
      let data: any = null;
      let lastError: any = null;
      const maxVerifyAttempts = 3;

      for (let attempt = 0; attempt < maxVerifyAttempts; attempt++) {
        try {
          const res = await supabase.functions.invoke('razorpay-verify-signature', {
            body: {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            },
          });
          if (!res.error) {
            data = res.data;
            lastError = null;
            break;
          }
          lastError = res.error;
        } catch (err: any) {
          lastError = err;
        }
        if (attempt < maxVerifyAttempts - 1) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }

      if (lastError) {
        const errMsg = await getFunctionsErrorMessage(lastError);
        throw new Error(errMsg);
      }

      if (!data?.verified) {
        router.push({
          pathname: '/(dashboard)/payment-failed',
          params: { reason: 'Payment signature verification failed. Please try again or contact support.' },
        });
        return;
      }

      if (__DEV__) {
        console.log('✅ Payment verified successfully');
      }

      // Reconcile status with Razorpay API to guarantee 'paid' state immediately
      await reconcilePaymentStatus();

      // Navigate to the Transaction Successful page
      router.replace('/(dashboard)/payment-success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      Alert.alert(
        'Verification Delay',
        `${message}\n\nDon't worry — your payment was recorded with Razorpay. If your status doesn't update within a few minutes, please tap refresh.`,
        [
          {
            text: 'Retry Verification',
            onPress: () => handlePaymentSuccess(response),
          },
          { text: 'OK', style: 'cancel' },
        ]
      );
    } finally {
      if (isMountedRef.current) {
        setVerifying(false);
      }
    }
  }, [member?.id, refreshMember, reconcilePaymentStatus, router, session]);

  const handlePayWithRazorpay = useCallback(async () => {
    if (!member) {
      Alert.alert('Error', 'Member data not found');
      return;
    }

    if (!session || !session.access_token) {
      Alert.alert('Error', 'Not authenticated');
      return;
    }

    setPaymentLoading(true);
    try {
      const { data: orderData, error: orderError } = await supabase.functions.invoke('razorpay-create-order', {
        body: { member_id: member.id },
      });

      if (orderError) {
        const errMsg = await getFunctionsErrorMessage(orderError);
        throw new Error(errMsg);
      }

      if (!orderData?.id) {
        throw new Error('Invalid order response');
      }

      const keyId = orderData.key_id || process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID;
      if (!keyId) {
        throw new Error('Razorpay configuration missing (EXPO_PUBLIC_RAZORPAY_KEY_ID)');
      }

      const checkoutOptions = {
        key: keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        order_id: orderData.id,
        name: 'NDADA Membership',
        description: 'Registration Fee',
        prefill: {
          name: member.full_name,
          email: member.email,
          contact: member.phone || '',
        },
        notes: {
          member_id: member.id,
          membership_id: member.membership_id || '',
        },
        theme: { color: '#15803d' },
        timeout: 600,
      };

      if (Platform.OS === 'web') {
        const Razorpay = (window as any).Razorpay;
        if (!Razorpay) {
          throw new Error('Razorpay SDK not loaded. Please refresh the page.');
        }

        checkoutRef.current = new Razorpay({
          ...checkoutOptions,
          handler: (response: any) => handlePaymentSuccess(response),
          modal: {
            ondismiss: () => {
              if (isMountedRef.current) setPaymentLoading(false);
              router.push({
                pathname: '/(dashboard)/payment-failed',
                params: { reason: 'Payment window was closed before completion.' },
              });
            },
          },
        });
        checkoutRef.current.on('payment.failed', (response: any) => {
          handlePaymentFailure(response.error);
        });
        checkoutRef.current.open();
      } else {
        let razorpayOpened = false;
        try {
          const RazorpayCheckoutModule = require('react-native-razorpay')?.default || require('react-native-razorpay');
          if (RazorpayCheckoutModule && typeof RazorpayCheckoutModule.open === 'function') {
            razorpayOpened = true;
            RazorpayCheckoutModule.open(checkoutOptions)
              .then((response: any) => handlePaymentSuccess(response))
              .catch((error: any) => handlePaymentFailure(error));
          }
        } catch (err: any) {
          if (__DEV__) {
            console.warn('⚠️ react-native-razorpay native module unavailable:', err?.message || err);
          }
        }

        if (!razorpayOpened) {
          await WebBrowser.openBrowserAsync(
            `https://checkout.razorpay.com/?key_id=${keyId}&order_id=${orderData.id}`
          );
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to start payment');
      if (isMountedRef.current) {
        setPaymentLoading(false);
      }
    }
  }, [member, session, handlePaymentSuccess, handlePaymentFailure, router]);

  return {
    paymentLoading,
    verifying,
    handlePayWithRazorpay,
    reconcilePaymentStatus,
  };
}
