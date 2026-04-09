import { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Link, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { Button, Input } from '@/components/ui';
import {
  APP_NAME,
  MEMBERSHIP_AMOUNT,
  MEMBERSHIP_BENEFITS,
  MEMBERSHIP_PLAN_NAME,
  MEMBERSHIP_STEPS,
  MEMBERSHIP_VALIDITY_LABEL,
} from '@/constants';
import { formatCurrency } from '@/lib/utils';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    address: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

    setLoading(true);
    setError('');
    const { error: err } = await signUp(form.email, form.password, {
      full_name: form.full_name,
      phone: form.phone,
      address: form.address,
    });
    if (err) {
      setError(err);
      setLoading(false);
    } else {
      router.replace('/(dashboard)');
    }
  };

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
              Join as a member, pay once, and receive your certificate after approval.
            </Text>
          </View>

          <View className="mb-4 rounded-2xl border border-primary-100 bg-primary-50 p-5">
            <Text className="text-lg font-semibold text-primary-900">{MEMBERSHIP_PLAN_NAME}</Text>
            <Text className="mt-1 text-sm text-primary-700">
              {formatCurrency(MEMBERSHIP_AMOUNT)} for {MEMBERSHIP_VALIDITY_LABEL}
            </Text>
            <View className="mt-4 gap-2">
              {MEMBERSHIP_STEPS.map((step, index) => (
                <Text key={step} className="text-sm text-primary-800">
                  {index + 1}. {step}
                </Text>
              ))}
            </View>
            <View className="mt-4 gap-2">
              {MEMBERSHIP_BENEFITS.slice(0, 2).map((benefit) => (
                <Text key={benefit} className="text-sm text-primary-700">
                  • {benefit}
                </Text>
              ))}
            </View>
          </View>

          <View className="rounded-2xl bg-white p-6 shadow-sm">
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

            <Button
              title="Create Membership Account"
              onPress={handleRegister}
              loading={loading}
              className="mt-2"
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
