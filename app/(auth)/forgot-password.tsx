import { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { Link, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button, Input } from '@/components/ui';
import { APP_NAME } from '@/constants';

export default function ForgotPasswordScreen() {
  const { resetPassword } = useAuth();
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successEmail, setSuccessEmail] = useState('');

  const handleResetPassword = async () => {
    const inputStr = inputVal.trim();
    if (!inputStr) {
      setError('Please enter your email address or phone number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let targetEmail = inputStr;

      if (!inputStr.includes('@')) {
        // Look up registered email by phone number
        const { data: lookedUpEmail, error: rpcErr } = await supabase
          .rpc('lookup_email_by_phone', { p_phone: inputStr });

        if (rpcErr) {
          console.warn('Phone lookup error during password reset:', rpcErr);
          const msg = String(rpcErr.message || '').toLowerCase();
          if (
            msg.includes('failed to fetch') ||
            msg.includes('network request failed') ||
            msg.includes('fetcherror') ||
            msg.includes('typeerror') ||
            msg.includes('network error')
          ) {
            setError('Network error while looking up phone number. Please check your internet connection.');
          } else {
            setError('Unable to find account matching phone number. Please enter your registered email.');
          }
          setLoading(false);
          return;
        }

        if (lookedUpEmail) {
          targetEmail = lookedUpEmail;
        } else {
          setError(`No account found matching phone number "${inputStr}". Please check your phone number or enter your registered email.`);
          setLoading(false);
          return;
        }
      } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(inputStr)) {
          setError('Please enter a valid email address');
          setLoading(false);
          return;
        }
        targetEmail = inputStr.toLowerCase();
      }

      const { error: resetErr } = await resetPassword(targetEmail);
      if (resetErr) {
        setError(resetErr);
      } else {
        setSuccessEmail(targetEmail);
      }
    } catch (e: any) {
      setError(e?.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (successEmail) {
    return (
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-12"
          keyboardShouldPersistTaps="handled"
        >
          <View className="mx-auto w-full max-w-md">
            <View className="mb-6 items-center">
              <Image
                source={require('@/assets/logo-ndada.png')}
                style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 12 }}
                resizeMode="contain"
              />
              <Text className="text-3xl font-bold text-primary-800">{APP_NAME}</Text>
            </View>

            <View className="rounded-2xl bg-white p-6 shadow-sm">
              <View className="mb-4 items-center">
                <Text className="text-5xl mb-4">📧</Text>
                <Text className="text-xl font-bold text-gray-800 text-center">
                  Check Your Email
                </Text>
              </View>

              <Text className="text-center text-gray-600 mb-6 leading-5">
                We've sent a password reset link to <Text className="font-semibold text-gray-900">{successEmail}</Text>. Tap the link in the email to set your new password.
              </Text>

              <Button
                title="Return to Sign In"
                onPress={() => router.replace('/(auth)/login')}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        <View className="mx-auto w-full max-w-md">
          <View className="mb-6 items-center">
            <Image
              source={require('@/assets/logo-ndada.png')}
              style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 12 }}
              resizeMode="contain"
            />
            <Text className="text-3xl font-bold text-primary-800">{APP_NAME}</Text>
            <Text className="mt-1 text-center text-gray-500">
              Enter your registered email address or phone number to receive a password reset link.
            </Text>
          </View>

          <View className="rounded-2xl bg-white p-6 shadow-sm">
            {error ? (
              <View className="mb-4 rounded-lg bg-red-50 p-3">
                <Text className="text-sm text-red-600">{error}</Text>
              </View>
            ) : null}

            <Input
              label="Email or Phone Number"
              placeholder="you@example.com or 9876543210"
              value={inputVal}
              onChangeText={setInputVal}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Button
              title="Send Reset Link"
              onPress={handleResetPassword}
              loading={loading}
              className="mt-2"
            />
          </View>

          <View className="mt-6 flex-row items-center justify-center">
            <Text className="text-gray-500">Remember your password? </Text>
            <Link href="/(auth)/login">
              <Text className="font-semibold text-primary-700">Sign In</Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
