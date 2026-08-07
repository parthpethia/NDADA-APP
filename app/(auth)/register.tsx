import { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, Image } from 'react-native';
import { Link, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { Button, Input, Select } from '@/components/ui';
import {
  APP_NAME,
  MEMBERSHIP_AMOUNT,
  MEMBERSHIP_BENEFITS,
  MEMBERSHIP_PLAN_NAME,
  MEMBERSHIP_STEPS,
  MEMBERSHIP_VALIDITY_LABEL,
} from '@/constants';
import { formatCurrency } from '@/lib/utils';

const DISTRICTS = [
  'Nagpur',
  'Nagpur Gramin',
  'Hingna',
  'Kuhi',
  'Kalmeshwar',
  'Katol',
  'Narkhed',
  'Saoner',
  'Parshivani',
  'Kamthi',
  'Ramtek',
  'Mouda',
  'Umred',
  'Bhiwapur',
];

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    address: '',
    district: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);

  const update = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleRegister = async () => {
    if (!form.full_name || !form.email || !form.phone || !form.password) {
      setError('Please fill in all required fields');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!agreed) {
      setError('You must agree to the Privacy Policy and Terms of Service');
      return;
    }

    setLoading(true);
    setError('');
    const { error: err } = await signUp(form.email, form.password, {
      full_name: form.full_name,
      phone: form.phone,
      address: form.address,
      district: form.district,
      privacy_policy_accepted: true,
      terms_accepted: true,
    });
    if (err) {
      setError(err);
      setLoading(false);
    } else {
      // Do NOT navigate imperatively. On Android (async AsyncStorage), the auth state
      // isn't settled yet when signUp() returns. The AuthLayout declarative guard at
      // (auth)/_layout.tsx will redirect to /(dashboard) once session + profileReady
      // are resolved. Keep loading=true so the UI shows "Creating Account..." state.
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-4 sm:px-6 py-8 sm:py-12"
        keyboardShouldPersistTaps="handled"
      >
        <View className="mx-auto w-full max-w-md">
          <View className="mb-6 items-center">
            <Image
              source={require('@/assets/logo-ndada.png')}
              style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 12 }}
              resizeMode="contain"
            />
            <Text className="text-2xl sm:text-3xl font-bold text-primary-800 text-center">{APP_NAME}</Text>
            <Text className="mt-1 text-center text-sm text-gray-500">
              Join as a member, pay once, and receive your certificate after approval.
            </Text>
          </View>

          <View className="mb-4 rounded-2xl border border-primary-100 bg-primary-50 p-4 sm:p-5">
            <Text className="text-base sm:text-lg font-semibold text-primary-900">{MEMBERSHIP_PLAN_NAME}</Text>
            <Text className="mt-1 text-xs sm:text-sm text-primary-700">
              {formatCurrency(MEMBERSHIP_AMOUNT)} • {MEMBERSHIP_VALIDITY_LABEL}
            </Text>
            <View className="mt-3.5 gap-1.5">
              {MEMBERSHIP_STEPS.map((step, index) => (
                <Text key={step} className="text-xs sm:text-sm text-primary-800">
                  {index + 1}. {step}
                </Text>
              ))}
            </View>
            <View className="mt-3 gap-1.5">
              {MEMBERSHIP_BENEFITS.slice(0, 2).map((benefit) => (
                <Text key={benefit} className="text-xs sm:text-sm text-primary-700">
                  • {benefit}
                </Text>
              ))}
            </View>
          </View>

          <View className="rounded-2xl bg-white px-4 py-5 sm:p-6 shadow-sm">
            {error ? (
              <View className="mb-4 rounded-lg bg-red-50 p-3">
                <Text className="text-sm text-red-600">{error}</Text>
              </View>
            ) : null}

            <Input
              label="Full Name *"
              placeholder="John Doe"
              value={form.full_name}
              onChangeText={(v) => update('full_name', v)}
            />
            <Input
              label="Email *"
              placeholder="you@example.com"
              value={form.email}
              onChangeText={(v) => update('email', v)}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Input
              label="Phone Number *"
              placeholder="+91 9876543210"
              value={form.phone}
              onChangeText={(v) => update('phone', v)}
              keyboardType="phone-pad"
            />
            <Input
              label="Address"
              placeholder="Your address"
              value={form.address}
              onChangeText={(v) => update('address', v)}
              multiline
              numberOfLines={3}
            />

            <Select
              label="District (Optional)"
              options={DISTRICTS.map((d) => ({ label: d, value: d }))}
              value={form.district}
              onValueChange={(v) => update('district', v)}
              placeholder="Select district..."
            />

            <Input
              label="Password *"
              placeholder="Min 6 characters"
              value={form.password}
              onChangeText={(v) => update('password', v)}
              secureTextEntry
            />
            <Input
              label="Confirm Password *"
              placeholder="Re-enter password"
              value={form.confirmPassword}
              onChangeText={(v) => update('confirmPassword', v)}
              secureTextEntry
            />

            <View className="mb-5 mt-2 flex-row items-start gap-2.5">
              <TouchableOpacity
                onPress={() => setAgreed(!agreed)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                className={`w-5 h-5 rounded border items-center justify-center mt-0.5 ${
                  agreed ? 'bg-primary-600 border-primary-600' : 'border-gray-300 bg-white'
                }`}
                activeOpacity={0.8}
              >
                {agreed && <Text className="text-white text-[10px] font-bold">✓</Text>}
              </TouchableOpacity>
              <View className="flex-1 flex-row flex-wrap">
                <Text className="text-sm text-gray-600">I agree to the </Text>
                <TouchableOpacity onPress={() => router.push('/privacy-policy')}>
                  <Text className="text-sm font-semibold text-primary-700 underline">Privacy Policy</Text>
                </TouchableOpacity>
                <Text className="text-sm text-gray-600"> and </Text>
                <TouchableOpacity onPress={() => router.push('/terms')}>
                  <Text className="text-sm font-semibold text-primary-700 underline">Terms of Service</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Button
              title="Create Account"
              onPress={handleRegister}
              loading={loading}
              className="mt-2"
              disabled={!agreed}
            />
          </View>

          <View className="mt-6 flex-row items-center justify-center">
            <Text className="text-gray-500">Already have an account? </Text>
            <Link href="/(auth)/login">
              <Text className="font-semibold text-primary-700">Sign In</Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
