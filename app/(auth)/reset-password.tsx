import { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { Link, router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { Button, Input } from '@/components/ui';
import { APP_NAME } from '@/constants';

export default function ResetPasswordScreen() {
  const localParams = useLocalSearchParams<{
    token_hash?: string;
    token?: string;
    type?: string;
    code?: string;
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_code?: string;
    error_description?: string;
  }>();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [targetEmail, setTargetEmail] = useState('');
  const url = Linking.useURL();
  const processedUrlRef = useRef<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Helper to check if an active recovery session exists
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          if (session.user.email) {
            setTargetEmail(session.user.email);
          }
          setSessionReady(true);
          return true;
        }
      } catch (err) {
        console.warn('checkSession error:', err);
      }
      return false;
    };

    // Parse recovery tokens from URL (supporting query params, hash fragments, PKCE code exchange, and token hashes)
    const handleRecoveryUrl = async (urlString: string) => {
      try {
        const params = new URLSearchParams();

        // Extract params from query string (?)
        const queryIndex = urlString.indexOf('?');
        if (queryIndex !== -1) {
          const hashInQuery = urlString.indexOf('#', queryIndex);
          const rawQuery = hashInQuery !== -1 
            ? urlString.substring(queryIndex + 1, hashInQuery) 
            : urlString.substring(queryIndex + 1);
          new URLSearchParams(rawQuery).forEach((v, k) => params.set(k, v));
        }

        // Extract params from hash fragment (#)
        const hashIndex = urlString.indexOf('#');
        if (hashIndex !== -1) {
          const rawHash = urlString.substring(hashIndex + 1);
          new URLSearchParams(rawHash).forEach((v, k) => params.set(k, v));
        }

        // Merge local expo-router params as fallback
        if (localParams.token_hash && !params.has('token_hash')) params.set('token_hash', String(localParams.token_hash));
        if (localParams.token && !params.has('token')) params.set('token', String(localParams.token));
        if (localParams.code && !params.has('code')) params.set('code', String(localParams.code));
        if (localParams.type && !params.has('type')) params.set('type', String(localParams.type));
        if (localParams.access_token && !params.has('access_token')) params.set('access_token', String(localParams.access_token));
        if (localParams.refresh_token && !params.has('refresh_token')) params.set('refresh_token', String(localParams.refresh_token));
        if (localParams.error && !params.has('error')) params.set('error', String(localParams.error));
        if (localParams.error_description && !params.has('error_description')) params.set('error_description', String(localParams.error_description));

        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const code = params.get('code');
        const tokenHash = params.get('token_hash') || params.get('token');
        const type = params.get('type');
        const errorCode = params.get('error_code') || params.get('error');
        const errorDesc = params.get('error_description');

        if (errorCode || errorDesc) {
          const displayMsg = errorDesc
            ? decodeURIComponent(errorDesc.replace(/\+/g, ' '))
            : 'This reset link has expired or was already used';
          setError(`${displayMsg}. Please request a new password reset link.`);
          return false;
        }

        // 1. PKCE Code Exchange
        if (code) {
          try {
            await supabase.auth.signOut({ scope: 'local' });
          } catch {}

          const { data: codeData, error: codeError } = await supabase.auth.exchangeCodeForSession(code);
          if (codeError) {
            setError(`Failed to verify reset code: ${codeError.message}`);
            return false;
          }
          if (codeData?.user?.email) {
            setTargetEmail(codeData.user.email);
          }
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.replaceState(null, '', window.location.pathname);
          }
          setSessionReady(true);
          return true;
        }

        // 2. Access Token + Refresh Token (Implicit grant)
        if (accessToken && refreshToken) {
          try {
            await supabase.auth.signOut({ scope: 'local' });
          } catch {}

          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            setError(`Failed to verify reset link: ${sessionError.message}`);
            return false;
          }

          if (sessionData?.user?.email) {
            setTargetEmail(sessionData.user.email);
          }
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.replaceState(null, '', window.location.pathname);
          }
          setSessionReady(true);
          return true;
        }

        // 3. Token Hash OTP Verification
        if (tokenHash && (type === 'recovery' || !type)) {
          try {
            await supabase.auth.signOut({ scope: 'local' });
          } catch {}

          const { data: otpData, error: verifyErr } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });
          if (!verifyErr) {
            if (otpData?.user?.email) {
              setTargetEmail(otpData.user.email);
            }
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.history.replaceState(null, '', window.location.pathname);
            }
            setSessionReady(true);
            return true;
          } else {
            setError(`Failed to verify reset link: ${verifyErr.message}`);
            return false;
          }
        }
      } catch (err: any) {
        console.warn('Error parsing recovery URL:', err);
      }
      return false;
    };

    const processUrlOrSession = async () => {
      // Prioritize synchronous web URL for 0ms instantaneous extraction
      const effectiveUrl = (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : null) || url;

      if (effectiveUrl && processedUrlRef.current !== effectiveUrl) {
        processedUrlRef.current = effectiveUrl;
        const handled = await handleRecoveryUrl(effectiveUrl);
        if (handled) return;
      }

      const foundSession = await checkSession();
      if (foundSession) return;

      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(async () => {
        const ok = await checkSession();
        if (!ok) {
          setError(
            'Unable to verify your reset link. Please click the link in your email again, or request a new reset link.'
          );
        }
      }, 3000);
    };

    processUrlOrSession();

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, [url, localParams]);

  const handleUpdatePassword = async () => {
    // Prevent double-submission
    if (loading) return;

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

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

      let updateErrorMsg: string | null = null;

      if (accessToken && supabaseUrl && supabaseAnonKey) {
        // Direct zero-lock REST request to Supabase Auth endpoint
        const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ password }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          updateErrorMsg = errData.msg || errData.message || errData.error_description || `Failed to update password (${res.status})`;
        }
      } else {
        // Fallback to standard client updateUser
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) updateErrorMsg = updateError.message;
      }

      if (updateErrorMsg) {
        console.error('updateUser error:', updateErrorMsg);
        setError(updateErrorMsg);
        setLoading(false);
        return;
      }

      console.log('Password successfully updated in database!');
      setPassword('');
      setConfirmPassword('');

      // Sign out the temporary recovery session so the user can sign in cleanly with their new password
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (soErr) {
        console.warn('Sign out after reset warning:', soErr);
      }

      setSuccess(true);
    } catch (e: any) {
      console.error('handleUpdatePassword exception:', e);
      setError(e?.message || 'An unexpected error occurred. Please try again.');
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
                Your password has been successfully updated in the system. You can now sign in with your new password.
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
              Enter your new password below.
            </Text>
          </View>

          <View className="rounded-2xl bg-white p-6 shadow-sm">
            {targetEmail ? (
              <View className="mb-4 rounded-xl bg-primary-50 border border-primary-100 p-3 items-center">
                <Text className="text-xs font-semibold text-primary-700 uppercase tracking-wider">
                  Verified Account
                </Text>
                <Text className="text-sm font-bold text-primary-900 mt-0.5">
                  {targetEmail}
                </Text>
              </View>
            ) : null}

            {!sessionReady ? (
              <View className="mb-4 rounded-lg bg-yellow-50 p-3">
                <Text className="text-sm text-yellow-700">
                  Verifying your reset link… If this takes too long, try clicking the link in your email again.
                </Text>
              </View>
            ) : null}

            {error ? (
              <View className="mb-4 rounded-lg bg-red-50 p-3">
                <Text className="text-sm text-red-600 mb-2">{error}</Text>
                {error.includes('expired') || error.includes('invalid') || error.includes('used') ? (
                  <Button
                    title="Request New Reset Link →"
                    variant="outline"
                    onPress={() => router.replace('/(auth)/forgot-password')}
                    className="mt-1 border-red-200"
                  />
                ) : null}
              </View>
            ) : null}

            <Input
              label="New Password"
              placeholder="Enter new password (min. 6 chars)"
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

