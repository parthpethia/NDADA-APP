import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, RefreshControl, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, Button, Input, StatusBadge, LoadingScreen, EmptyState } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { MEMBERSHIP_PLAN_NAME, MEMBERSHIP_VALIDITY_LABEL } from '@/constants';
import { confirm } from '@/lib/confirm';

export default function ProfileScreen() {
  const { member, signOut, refreshMember, loading } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    full_name: member?.full_name || '',
    phone: member?.phone || '',
    address: member?.address || '',
  });
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingProfile, setRefreshingProfile] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    const ok = await confirm(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone. All your personal data will be anonymized, but payment references will be kept for financial audits.',
      {
        destructive: true,
        confirmText: 'Delete Account',
      }
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;
      
      Alert.alert('Success', 'Your account has been deleted.');
      await signOut();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to delete account. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!member || editing) return;
    setForm({
      full_name: member.full_name,
      phone: member.phone,
      address: member.address,
    });
  }, [member, editing]);

  const handleEmptyStateRefresh = async () => {
    setRefreshingProfile(true);
    try {
      await refreshMember();
    } finally {
      setRefreshingProfile(false);
    }
  };

  const handleEmptyStateSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  if (loading) return <LoadingScreen message="Loading profile..." />;

  if (!member) {
    return (
      <EmptyState
        title="Profile not found"
        message="We could not find your member profile. Try refreshing or sign out and log in again."
      >
        <View className="w-full gap-2">
          <Button
            title="Refresh"
            variant="outline"
            loading={refreshingProfile}
            disabled={signingOut}
            onPress={handleEmptyStateRefresh}
          />
          <Button
            title="Sign Out"
            variant="destructive"
            loading={signingOut}
            disabled={refreshingProfile}
            onPress={handleEmptyStateSignOut}
          />
        </View>
      </EmptyState>
    );
  }

  const update = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.phone.trim()) {
      Alert.alert('Validation', 'Full name and phone are required.');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('accounts')
      .update({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
      })
      .eq('id', member.id);

    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      await refreshMember();
      setEditing(false);
      Alert.alert('Success', 'Profile updated successfully.');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshMember();
    setRefreshing(false);
  };

  const handleSignOut = async () => {
    const ok = await confirm('Sign Out', 'Are you sure you want to sign out?', {
      destructive: true,
      confirmText: 'Sign Out',
    });
    if (!ok) return;
    await signOut();
  };

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerClassName="p-4 pb-8"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View className="mx-auto w-full max-w-lg">
        {/* Profile Info */}
        <Card className="mb-4">
          <CardHeader
            title="Profile Information"
            right={
              !editing ? (
                <Button
                  title="Edit"
                  variant="outline"
                  size="sm"
                  onPress={() => setEditing(true)}
                />
              ) : undefined
            }
          />

          {editing ? (
            <View>
              <Input
                label="Full Name"
                value={form.full_name}
                onChangeText={(v) => update('full_name', v)}
              />
              <Input
                label="Phone"
                value={form.phone}
                onChangeText={(v) => update('phone', v)}
                keyboardType="phone-pad"
              />
              <Input
                label="Address"
                value={form.address}
                onChangeText={(v) => update('address', v)}
                multiline
                numberOfLines={3}
              />
              <View className="flex-row gap-3">
                <Button
                  title="Cancel"
                  variant="outline"
                  onPress={() => {
                    setEditing(false);
                    setForm({
                      full_name: member.full_name,
                      phone: member.phone,
                      address: member.address,
                    });
                  }}
                  className="flex-1"
                />
                <Button
                  title="Save"
                  onPress={handleSave}
                  loading={saving}
                  className="flex-1"
                />
              </View>
            </View>
          ) : (
            <View className="gap-3">
              <View className="flex-row justify-between">
                <Text className="text-gray-500">Name</Text>
                <Text className="font-medium text-gray-900">{member.full_name}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-500">Email</Text>
                <Text className="font-medium text-gray-900">{member.email}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-500">Phone</Text>
                <Text className="font-medium text-gray-900">{member.phone}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-gray-500">Address</Text>
                <Text className="max-w-[200px] text-right font-medium text-gray-900">
                  {member.address || '—'}
                </Text>
              </View>
            </View>
          )}
        </Card>

        {/* Membership Info */}
        <Card className="mb-4">
          <CardHeader title="Membership" />
          <View className="gap-3">
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Plan</Text>
              <Text className="font-medium text-gray-900">{MEMBERSHIP_PLAN_NAME}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Membership ID</Text>
              <Text className="font-medium text-gray-900">{member.membership_id}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Validity</Text>
              <Text className="font-medium text-gray-900">{MEMBERSHIP_VALIDITY_LABEL}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Payment Status</Text>
              <StatusBadge status={member.payment_status} />
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Account Status</Text>
              <StatusBadge status={member.account_status} />
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Joined</Text>
              <Text className="font-medium text-gray-900">{formatDate(member.created_at)}</Text>
            </View>
          </View>
        </Card>

        {/* Legal Info */}
        <Card className="mb-4">
          <CardHeader title="Legal & Privacy" />
          <View className="gap-2 px-1">
            <TouchableOpacity
              onPress={() => router.push('/privacy-policy')}
              className="flex-row justify-between py-3 border-b border-gray-100"
            >
              <Text className="text-gray-700 font-medium">Privacy Policy</Text>
              <Text className="text-gray-400">View →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/terms')}
              className="flex-row justify-between py-3"
            >
              <Text className="text-gray-700 font-medium">Terms of Service</Text>
              <Text className="text-gray-400">View →</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Danger Zone */}
        <Card className="mb-4 border border-red-200">
          <CardHeader title="Danger Zone" />
          <View className="gap-3 px-1">
            <Text className="text-xs text-red-600 leading-4">
              Deleting your account is permanent and cannot be undone. Your personal details will be anonymized, and uploaded verification documents will be deleted.
            </Text>
            <Button
              title="Delete Account"
              variant="destructive"
              onPress={handleDeleteAccount}
              loading={deleting}
            />
          </View>
        </Card>

        <Button
          title="Sign Out"
          variant="outline"
          onPress={handleSignOut}
        />
      </View>
    </ScrollView>
  );
}
