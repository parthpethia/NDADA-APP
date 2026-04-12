import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, TextInput, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card, Button, StatusBadge } from '@/components/ui';
import { useAdmin } from '@/hooks/useAdmin';
import { confirm } from '@/lib/confirm';
import { Member } from '@/types';
import { formatDate } from '@/lib/utils';
import { Search } from 'lucide-react-native';

export default function AdminMembersScreen() {
  const { callAdminAction, role } = useAdmin();
  const [members, setMembers] = useState<(Member & { firms_count: number })[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createFullName, setCreateFullName] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createAddress, setCreateAddress] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const fetchMembers = useCallback(async () => {
    let query = supabase.from('members').select('*, firms(id)').order('created_at', { ascending: false });

    if (search.trim()) {
      query = query.or(
        `full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,membership_id.ilike.%${search}%`
      );
    }

    const { data } = await query.limit(50);
    setMembers(
      (data || []).map((m: any) => ({
        ...m,
        firms_count: m.firms?.length || 0,
        firms: undefined,
      }))
    );
  }, [search]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMembers();
    setRefreshing(false);
  };

  const handleAction = async (action: string, memberId: string, label: string) => {
    const ok = await confirm('Confirm', `Are you sure you want to ${label}?`, {
      confirmText: 'Confirm',
      destructive: true,
    });
    if (!ok) return;

    setActionLoading(memberId);
    try {
      await callAdminAction(action, { member_id: memberId });
      await fetchMembers();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
    setActionLoading(null);
  };

  const handleSetPaymentStatus = async (memberId: string, status: 'pending' | 'paid' | 'failed') => {
    try {
      const label = status === 'paid' ? 'mark as PAID' : status === 'pending' ? 'mark as NOT PAID' : 'mark as FAILED';
      console.log('💬 Requesting confirmation for:', label);

      const ok = await confirm('Confirm', `Are you sure you want to ${label}?`, {
        confirmText: 'Confirm',
        destructive: status !== 'paid',
      });

      console.log('✏️ Confirmation result:', ok);
      if (!ok) {
        console.log('User cancelled the action');
        return;
      }

      console.log('📍 Setting action loading for member:', memberId);
      setActionLoading(memberId);

      try {
        console.log('🔄 Calling admin action with:', { member_id: memberId, status });
        const result = await callAdminAction('set-member-payment-status', { member_id: memberId, status });
        console.log('✅ Admin action result:', result);

        console.log('🔄 Fetching updated members list...');
        await fetchMembers();
        console.log('✅ Members list updated');

        Alert.alert('Success', `Payment status updated to ${label}`);
      } catch (err: any) {
        console.error('❌ Action failed:', err);
        const errorMsg = err.message || 'Failed to update payment status';
        Alert.alert('Error', errorMsg);
      } finally {
        console.log('🏁 Clearing action loading');
        setActionLoading(null);
      }
    } catch (err: any) {
      console.error('❌ Outer catch error:', err);
      Alert.alert('Error', String(err.message || 'An error occurred'));
    }
  };

  const handleCreateMember = async () => {
    const email = createEmail.trim().toLowerCase();
    if (!email || !createPassword.trim()) {
      Alert.alert('Error', 'Email and password are required');
      return;
    }

    setCreateLoading(true);
    try {
      await callAdminAction('create-member', {
        email,
        password: createPassword,
        full_name: createFullName,
        phone: createPhone,
        address: createAddress,
      });

      setCreateEmail('');
      setCreatePassword('');
      setCreateFullName('');
      setCreatePhone('');
      setCreateAddress('');
      await fetchMembers();
      Alert.alert('Success', 'Member created');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
    setCreateLoading(false);
  };

  return (
    <View className="flex-1 bg-gray-50">
      {/* Search Bar */}
      <View className="border-b border-gray-200 bg-white px-4 py-3">
        <View className="flex-row items-center rounded-lg border border-gray-300 bg-gray-50 px-3">
          <Search size={18} color="#9ca3af" />
          <TextInput
            className="ml-2 flex-1 py-2 text-base text-gray-900"
            placeholder="Search by name, email, phone, membership ID..."
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={fetchMembers}
          />
        </View>
      </View>

      <ScrollView
        contentContainerClassName="p-4 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Create Member */}
        <Card className="mb-4">
          <Text className="mb-3 text-base font-semibold text-gray-900">Add Member</Text>
          <View className="gap-2">
            <TextInput
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              placeholder="Full name (optional)"
              placeholderTextColor="#9ca3af"
              value={createFullName}
              onChangeText={setCreateFullName}
            />
            <TextInput
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              placeholder="Email *"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              keyboardType="email-address"
              value={createEmail}
              onChangeText={setCreateEmail}
            />
            <TextInput
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              placeholder="Password * (min 6 chars)"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              value={createPassword}
              onChangeText={setCreatePassword}
            />
            <TextInput
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              placeholder="Phone (optional)"
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
              value={createPhone}
              onChangeText={setCreatePhone}
            />
            <TextInput
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              placeholder="Address (optional)"
              placeholderTextColor="#9ca3af"
              value={createAddress}
              onChangeText={setCreateAddress}
            />
            <Button
              title="Create Member"
              variant="primary"
              onPress={handleCreateMember}
              loading={createLoading}
            />
          </View>
        </Card>

        {members.map((m) => (
          <Card key={m.id} className="mb-3">
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <Text className="text-lg font-semibold text-gray-900">{m.full_name}</Text>
                <Text className="text-xs text-gray-500">{m.membership_id}</Text>
              </View>
              <StatusBadge status={m.account_status} />
            </View>

            <View className="mt-3 gap-1">
              <View className="flex-row justify-between">
                <Text className="text-xs text-gray-500">Email</Text>
                <Text className="text-xs text-gray-700">{m.email}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-xs text-gray-500">Phone</Text>
                <Text className="text-xs text-gray-700">{m.phone}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-xs text-gray-500">Firms</Text>
                <Text className="text-xs text-gray-700">{m.firms_count}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-xs text-gray-500">Payment</Text>
                <StatusBadge status={m.payment_status} />
              </View>
              <View className="flex-row justify-between">
                <Text className="text-xs text-gray-500">Joined</Text>
                <Text className="text-xs text-gray-700">{formatDate(m.created_at)}</Text>
              </View>
            </View>

            <View className="mt-3 flex-row flex-wrap gap-2 border-t border-gray-100 pt-3">
              {m.account_status === 'active' ? (
                <Button
                  title="Suspend"
                  variant="destructive"
                  size="sm"
                  onPress={() => handleAction('suspend-member', m.id, 'suspend this account')}
                  loading={actionLoading === m.id}
                />
              ) : m.account_status === 'suspended' ? (
                <Button
                  title="Activate"
                  variant="primary"
                  size="sm"
                  onPress={() => handleAction('activate-member', m.id, 'activate this account')}
                  loading={actionLoading === m.id}
                />
              ) : null}

              {m.payment_status === 'paid' ? (
                <Button
                  title="Mark Not Paid"
                  variant="outline"
                  size="sm"
                  onPress={() => handleSetPaymentStatus(m.id, 'pending')}
                  loading={actionLoading === m.id}
                />
              ) : (
                <Button
                  title="Mark Paid"
                  variant="primary"
                  size="sm"
                  onPress={() => handleSetPaymentStatus(m.id, 'paid')}
                  loading={actionLoading === m.id}
                />
              )}

              <Button
                title="Revoke Cert"
                variant="outline"
                size="sm"
                onPress={() => handleAction('revoke-certificate', m.id, 'revoke the certificate')}
              />

              {role === 'super_admin' && (
                <Button
                  title="Delete"
                  variant="destructive"
                  size="sm"
                  onPress={() => handleAction('delete-member', m.id, 'delete this member')}
                  loading={actionLoading === m.id}
                />
              )}
            </View>
          </Card>
        ))}

        {members.length === 0 && (
          <Text className="py-12 text-center text-gray-500">No members found</Text>
        )}
      </ScrollView>
    </View>
  );
}
