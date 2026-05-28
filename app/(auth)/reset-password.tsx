import { useState, useEffect } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Link, useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Button, Input } from '@/components/ui';
import { APP_NAME } from '@/constants';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    // Since detectSessionInUrl is false in our Supabase config, we must
    // manually extract the recovery tokens from the URL hash fragment.
    // Supabase reset links redirect to:
    //   /reset-password#access_token=...&refresh_token=...&type=recovery
    const handleRecoveryFromHash = async () => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const hash = window.location.hash.substring(1); // remove leading '#'
        console.log('ResetPassword: hash fragment is:', hash);
        if (!hash) {
          console.log('ResetPassword: no hash fragment found');
          return false;
        }

        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const type = params.get('type');
        console.log('ResetPassword: extracted params:', { accessToken: accessToken ? 'exists' : 'null', refreshToken: refreshToken ? 'exists' : 'null', type });

        if (accessToken && refreshToken && type === 'recovery') {
          console.log('ResetPassword: attempting to setSession...');
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            console.error('ResetPassword: setSession failed:', sessionError);
            setError(`Failed to verify reset link: ${sessionError.message}`);
            return false;
          }

          console.log('ResetPassword: setSession succeeded, updating history and setting sessionReady');
          // Clean up the hash from the URL
          window.history.replaceState(null, '', window.location.pathname);
          setSessionReady(true);
          return true;
        } else {
          console.log('ResetPassword: params did not match recovery criteria');
        }
      }
      return false;
    };

    // Listen for PASSWORD_RECOVERY event as a fallback
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          setSessionReady(true);
        }
      }
    );

    // Try to extract tokens from hash first
    handleRecoveryFromHash().then((handled) => {
      if (!handled) {
        // Fallback: check if there's already a valid session
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
            setSessionReady(true);
          }
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleUpdatePassword = async () => {
    if (!password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  if (success) {
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
            <View className="mb-8 items-center">
              <Text className="text-3xl font-bold text-primary-800">{APP_NAME}</Text>
            </View>

            <View className="rounded-2xl bg-white p-6 shadow-sm">
              <View className="mb-4 items-center">
                <Text className="text-5xl mb-4">✅</Text>
                <Text className="text-xl font-bold text-gray-800 text-center">
                  Password Updated!
                </Text>
              </View>

              <Text className="text-center text-gray-600 mb-6">
                Your password has been successfully reset. You can now sign in with your new password.
              </Text>

              <Button
                title="Go to Sign In"
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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-12"
        keyboardShouldPersistTaps="handled"
      >
        <View className="mx-auto w-full max-w-md">
          <View className="mb-8 items-center">
            <Text className="text-3xl font-bold text-primary-800">{APP_NAME}</Text>
            <Text className="mt-1 text-center text-gray-500">
              Enter your new password below.
            </Text>
          </View>

          <View className="rounded-2xl bg-white p-6 shadow-sm">
            {!sessionReady ? (
              <View className="mb-4 rounded-lg bg-yellow-50 p-3">
                <Text className="text-sm text-yellow-700">
                  Verifying your reset link… If this takes too long, try clicking the link in your email again.
                </Text>
              </View>
            ) : null}

            {error ? (
              <View className="mb-4 rounded-lg bg-red-50 p-3">
                <Text className="text-sm text-red-600">{error}</Text>
              </View>
            ) : null}

            <Input
              label="New Password"
              placeholder="Enter new password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <Input
              label="Confirm New Password"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />

            <Button
              title="Reset Password"
              onPress={handleUpdatePassword}
              loading={loading}
              disabled={!sessionReady}
              className="mt-2"
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
