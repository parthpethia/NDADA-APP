import { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { Button, Input } from '@/components/ui';
import { APP_NAME } from '@/constants';

export default function ForgotPasswordScreen() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleResetPassword = async () => {
    if (!email) {
      setError('Please enter your email address');
      return;
    }
    setLoading(true);
    setError('');
    const { error: err } = await resetPassword(email);
    if (err) {
      setError(err);
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  if (sent) {
    return (
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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

              <Text className="text-center text-gray-600 mb-2">
                We've sent a password reset link to:
              </Text>
              <Text className="text-center font-semibold text-primary-700 mb-4">
                {email}
              </Text>
              <Text className="text-center text-gray-500 text-sm mb-6">
                Click the link in the email to reset your password. If you don't see it, check your spam folder.
              </Text>

              <Button
                title="Resend Email"
                onPress={handleResetPassword}
                loading={loading}
                variant="outline"
              />
            </View>

            <View className="mt-6 flex-row items-center justify-center">
              <Link href="/(auth)/login">
                <Text className="font-semibold text-primary-700">← Back to Sign In</Text>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
              Enter your email address and we'll send you a link to reset your password.
            </Text>
          </View>

          <View className="rounded-2xl bg-white p-6 shadow-sm">
            {error ? (
              <View className="mb-4 rounded-lg bg-red-50 p-3">
                <Text className="text-sm text-red-600">{error}</Text>
              </View>
            ) : null}

            <Input
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
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
