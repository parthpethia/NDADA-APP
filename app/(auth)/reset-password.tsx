import { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { Link, router } from 'expo-router';
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
  // Guard against the effect running twice (React Strict Mode / fast refresh)
  const initRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    // Since detectSessionInUrl is false in our Supabase config, we must
    // manually extract the recovery tokens from the URL hash fragment.
    // Supabase reset links redirect to:
    //   /reset-password#access_token=...&refresh_token=...&type=recovery
    //
    // IMPORTANT: We intentionally do NOT register a second onAuthStateChange
    // listener here — the AuthProvider already has one, and having two
    // competing listeners causes GoTrue lock contention (the "lock not
    // released within 5000ms" + AbortError seen in the console).
    const handleRecoveryFromHash = async () => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const hash = window.location.hash.substring(1); // remove leading '#'
        if (!hash) {
          return false;
        }

        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const type = params.get('type');

        if (accessToken && refreshToken && type === 'recovery') {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            setError(`Failed to verify reset link: ${sessionError.message}`);
            return false;
          }

          // Clean up the hash from the URL so it's not reused on refresh
          window.history.replaceState(null, '', window.location.pathname);
          setSessionReady(true);
          return true;
        }
      }
      return false;
    };

    // Try to extract tokens from hash first
    handleRecoveryFromHash().then((handled) => {
      if (!handled) {
        // Fallback: the user may have already been redirected and has a
        // valid recovery session (e.g. page refresh after initial load).
        // Poll briefly because the AuthProvider's onAuthStateChange may
        // still be processing the session concurrently.
        const checkSession = async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            setSessionReady(true);
            return true;
          }
          return false;
        };

        checkSession().then((found) => {
          if (!found) {
            // Retry once more after a short delay — the AuthProvider's
            // initializeAuth may still be establishing the session.
            const retryTimer = setTimeout(async () => {
              const ok = await checkSession();
              if (!ok) {
                setError(
                  'Unable to verify your reset link. Please click the link in your email again, or request a new reset link.'
                );
              }
            }, 3000);
            retryTimerRef.current = retryTimer;
          }
        });
      }
    });

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  const handleUpdatePassword = async () => {
    // Prevent double-submission
    if (loading) return;

    if (!password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      // Sign out the recovery session so the user can sign in cleanly
      // with their new password. Without this, the _layout.tsx auth guard
      // would redirect them away from the login page immediately.
      await supabase.auth.signOut({ scope: 'local' });
      setSuccess(true);
    } catch (e) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
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
          <View className="mb-6 items-center">
            <Image
              source={require('@/assets/logo-ndada.png')}
              style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 12 }}
              resizeMode="contain"
            />
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
              disabled={!sessionReady || loading}
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
