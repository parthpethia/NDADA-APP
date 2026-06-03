import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, TextInput, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Card, Button, StatusBadge, Select } from '@/components/ui';
import { useAdmin } from '@/hooks/useAdmin';
import { confirm } from '@/lib/confirm';
import { Account } from '@/types';
import { formatDate } from '@/lib/utils';
import { Search, Bookmark, BookmarkPlus, Trash2 } from 'lucide-react-native';

export default function AdminMembersScreen() {
  const { callAdminAction, role } = useAdmin();
  const [members, setMembers] = useState<Account[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createFullName, setCreateFullName] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createAddress, setCreateAddress] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Bulk Selection States
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState(false);
  const [reviewers, setReviewers] = useState<any[]>([]);
  const [bulkReviewerId, setBulkReviewerId] = useState('unassigned');
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Saved Filters and View Presets States
  const [savedFilters, setSavedFilters] = useState<any[]>([]);
  const [activeFilterId, setActiveFilterId] = useState<string>('all');
  const [filterApproval, setFilterApproval] = useState<string>('all');
  const [filterPayment, setFilterPayment] = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [filterDistrict, setFilterDistrict] = useState<string>('all');

  const [showSaveFilterForm, setShowSaveFilterForm] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const [newFilterShared, setNewFilterShared] = useState(false);
  const [saveFilterLoading, setSaveFilterLoading] = useState(false);

  const fetchMembers = useCallback(async () => {
    let query = supabase
      .from('accounts')
      .select('id, full_name, membership_id, account_status, email, phone, approval_status, payment_status, district, created_at')
      .order('created_at', { ascending: false });

    if (search.trim()) {
      query = query.or(
        `full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,membership_id.ilike.%${search}%`
      );
    }

    if (filterApproval !== 'all') {
      query = query.eq('approval_status', filterApproval);
    }
    if (filterPayment !== 'all') {
      query = query.eq('payment_status', filterPayment);
    }
    if (filterAccount !== 'all') {
      query = query.eq('account_status', filterAccount);
    }
    if (filterDistrict !== 'all') {
      query = query.eq('district', filterDistrict);
    }

    const { data } = await query.limit(50);
    setMembers((data || []) as Account[]);
  }, [search, filterApproval, filterPayment, filterAccount, filterDistrict]);

  const fetchSavedFilters = useCallback(async () => {
    try {
      const result = await callAdminAction('get-saved-filters', {});
      if (result && result.filters) {
        setSavedFilters(result.filters);
      }
    } catch (err: any) {
      console.error('Failed to fetch saved filters:', err.message);
    }
  }, [callAdminAction]);

  useEffect(() => {
    fetchSavedFilters();
  }, [fetchSavedFilters]);

  const applyFilterPreset = (id: string, presetFilters: Record<string, any>) => {
    setActiveFilterId(id);
    setFilterApproval(presetFilters.approval_status || 'all');
    setFilterPayment(presetFilters.payment_status || 'all');
    setFilterAccount(presetFilters.account_status || 'all');
    setFilterDistrict(presetFilters.district || 'all');
    if (presetFilters.search !== undefined) {
      setSearch(presetFilters.search || '');
    }
  };

  const handleSaveFilter = async () => {
    const name = newFilterName.trim();
    if (!name) {
      Alert.alert('Error', 'Please provide a name for this saved filter.');
      return;
    }

    setSaveFilterLoading(true);
    try {
      const currentFilters = {
        approval_status: filterApproval !== 'all' ? filterApproval : undefined,
        payment_status: filterPayment !== 'all' ? filterPayment : undefined,
        account_status: filterAccount !== 'all' ? filterAccount : undefined,
        district: filterDistrict !== 'all' ? filterDistrict : undefined,
        search: search.trim() ? search.trim() : undefined,
      };

      const result = await callAdminAction('save-filter', {
        name,
        filters: currentFilters,
        is_shared: newFilterShared
      });

      Alert.alert('Success', 'View preset bookmarked successfully!');
      setNewFilterName('');
      setNewFilterShared(false);
      setShowSaveFilterForm(false);
      await fetchSavedFilters();
      if (result && result.filter_id) {
        setActiveFilterId(result.filter_id);
      }
    } catch (err: any) {
      Alert.alert('Save Failed', err.message);
    } finally {
      setSaveFilterLoading(false);
    }
  };

  const handleDeleteFilter = async (filterId: string, name: string) => {
    const ok = await confirm('Delete Saved View', `Are you sure you want to delete the view preset "${name}"?`, {
      confirmText: 'Delete Preset',
      destructive: true
    });
    if (!ok) return;

    try {
      await callAdminAction('delete-filter', { filter_id: filterId });
      Alert.alert('Success', 'Saved view preset deleted.');
      if (activeFilterId === filterId) {
        applyFilterPreset('all', {});
      }
      await fetchSavedFilters();
    } catch (err: any) {
      Alert.alert('Delete Failed', err.message);
    }
  };

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  useEffect(() => {
    const fetchReviewers = async () => {
      const { data } = await supabase.from('admin_users').select('id, email, role');
      setReviewers(data || []);
    };
    fetchReviewers();
  }, []);

  const handleBulkAction = async (action: 'bulk-suspend' | 'bulk-activate' | 'bulk-reject' | 'bulk-assign-reviewer' | 'bulk-revoke' | 'bulk-regenerate', label: string) => {
    if (selectedIds.length === 0) {
      Alert.alert('Selection Empty', 'Select at least one member to execute bulk actions.');
      return;
    }

    const ok = await confirm('Confirm Bulk Action', `Are you sure you want to execute "${label}" on ${selectedIds.length} members?`, {
      confirmText: 'Execute',
      destructive: ['bulk-suspend', 'bulk-reject', 'bulk-revoke'].includes(action),
    });
    if (!ok) return;

    setBulkProcessing(true);
    try {
      const payload: Record<string, any> = { account_ids: selectedIds };
      if (action === 'bulk-reject') {
        // Alert.prompt is iOS-only; use cross-platform approach
        let reason = 'Requirements not met';
        if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
          const input = window.prompt('Bulk Rejection Reason:\nProvide feedback to rejected candidates:', reason);
          if (input === null) {
            setBulkProcessing(false);
            return;
          }
          reason = input || reason;
        }
        try {
          await callAdminAction('bulk-reject', { account_ids: selectedIds, reason });
          Alert.alert('Success', `Bulk action "${label}" completed.`);
          setSelectedIds([]);
          await fetchMembers();
        } catch (err: any) {
          Alert.alert('Bulk Operation Failed', err.message);
        } finally {
          setBulkProcessing(false);
        }
        return;
      } else if (action === 'bulk-assign-reviewer') {
        if (bulkReviewerId === 'unassigned') {
          Alert.alert('Error', 'Please select a reviewer to assign.');
          setBulkProcessing(false);
          return;
        }
        payload.reviewer_id = bulkReviewerId;
      }

      await callAdminAction(action, payload);
      Alert.alert('Success', `Bulk action "${label}" completed on ${selectedIds.length} members.`);
      setSelectedIds([]);
      await fetchMembers();
    } catch (err: any) {
      Alert.alert('Bulk Operation Failed', err.message);
    } finally {
      setBulkProcessing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMembers();
    setRefreshing(false);
  };

  const handleAction = async (action: string, accountId: string, label: string) => {
    const ok = await confirm('Confirm', `Are you sure you want to ${label}?`, {
      confirmText: 'Confirm',
      destructive: true,
    });
    if (!ok) return;

    setActionLoading(accountId);
    try {
      await callAdminAction(action, { account_id: accountId });
      await fetchMembers();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
    setActionLoading(null);
  };

  const handleSetPaymentStatus = async (accountId: string, status: 'pending' | 'paid' | 'failed') => {
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

      console.log('📍 Setting action loading for account:', accountId);
      setActionLoading(accountId);

      try {
        console.log('🔄 Calling admin action with:', { account_id: accountId, status });
        const result = await callAdminAction('set-payment-status', { account_id: accountId, status });
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
    if (!email) {
      Alert.alert('Error', 'Email is required');
      return;
    }

    setCreateLoading(true);
    try {
      await callAdminAction('create-member', {
        email,
        password: createPassword.trim() || '123456',
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
      {/* Search Bar, Saved Filters & Manual Selectors Header */}
      <View className="border-b border-gray-200 bg-white px-4 py-3 gap-2">
        <View className="flex-row items-center gap-2">
          <View className="flex-1 flex-row items-center rounded-lg border border-gray-300 bg-gray-50 px-3">
            <Search size={18} color="#9ca3af" />
            <TextInput
              className="ml-2 flex-1 py-1.5 text-base text-gray-900"
              placeholder="Search members..."
              placeholderTextColor="#9ca3af"
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={fetchMembers}
            />
          </View>
          
          <TouchableOpacity
            className={`p-2.5 rounded-lg border ${
              showSaveFilterForm ? 'bg-primary-900 border-primary-900' : 'bg-white border-gray-300'
            }`}
            onPress={() => setShowSaveFilterForm(!showSaveFilterForm)}
          >
            <BookmarkPlus size={16} color={showSaveFilterForm ? '#fff' : '#374151'} />
          </TouchableOpacity>

          <TouchableOpacity
            className={`px-3 py-2.5 rounded-lg border ${
              bulkMode ? 'bg-primary-900 border-primary-900' : 'bg-white border-gray-300'
            }`}
            onPress={() => {
              setBulkMode(!bulkMode);
              setSelectedIds([]);
            }}
          >
            <Text className={`text-xs font-bold ${bulkMode ? 'text-white' : 'text-gray-700'}`}>
              {bulkMode ? 'Cancel Bulk' : 'Bulk Mode'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Manual Selection Dropdown Filters */}
        <View className="flex-row gap-2 mt-1">
          <View className="flex-1">
            <Select
              value={filterApproval}
              options={[
                { label: 'All Approvals', value: 'all' },
                { label: 'Approved', value: 'approved' },
                { label: 'Pending Rev', value: 'pending' },
                { label: 'Rejected', value: 'rejected' }
              ]}
              onValueChange={(val: any) => {
                setFilterApproval(val);
                setActiveFilterId('custom');
              }}
            />
          </View>
          <View className="flex-1">
            <Select
              value={filterPayment}
              options={[
                { label: 'All Payments', value: 'all' },
                { label: 'Paid', value: 'paid' },
                { label: 'Pending Pay', value: 'pending' },
                { label: 'Failed Pay', value: 'failed' }
              ]}
              onValueChange={(val: any) => {
                setFilterPayment(val);
                setActiveFilterId('custom');
              }}
            />
          </View>
          <View className="flex-1">
            <Select
              value={filterDistrict}
              options={[
                { label: 'All Districts', value: 'all' },
                { label: 'Nagpur', value: 'Nagpur' },
                { label: 'Nagpur Gramin', value: 'Nagpur Gramin' },
                { label: 'Hingna', value: 'Hingna' },
                { label: 'Kuhi', value: 'Kuhi' },
                { label: 'Kalmeshwar', value: 'Kalmeshwar' },
                { label: 'Katol', value: 'Katol' },
                { label: 'Narkhed', value: 'Narkhed' },
                { label: 'Saoner', value: 'Saoner' },
                { label: 'Parshivani', value: 'Parshivani' },
                { label: 'Kamthi', value: 'Kamthi' },
                { label: 'Ramtek', value: 'Ramtek' },
                { label: 'Mouda', value: 'Mouda' },
                { label: 'Umred', value: 'Umred' },
                { label: 'Bhiwapur', value: 'Bhiwapur' }
              ]}
              onValueChange={(val: any) => {
                setFilterDistrict(val);
                setActiveFilterId('custom');
              }}
            />
          </View>
        </View>
      </View>

      {/* Bookmarker Presets Collapsible Form */}
      {showSaveFilterForm && (
        <Card className="m-4 mb-2 border border-primary-100">
          <Text className="mb-2 text-xs font-bold text-gray-800 uppercase tracking-wider">Save Current View Filter</Text>
          
          <View className="gap-2">
            <View>
              <Text className="text-[10px] font-bold text-gray-500 mb-1">Filter Preset Name *</Text>
              <TextInput
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                placeholder="e.g., Nagpur Cash Backlog"
                placeholderTextColor="#9ca3af"
                value={newFilterName}
                onChangeText={setNewFilterName}
              />
            </View>

            <View className="flex-row items-center justify-between py-1">
              <View>
                <Text className="text-xs font-bold text-gray-700">Share preset with other admins</Text>
                <Text className="text-[9px] text-gray-400">Allows other admins to view this preset</Text>
              </View>
              <TouchableOpacity
                className={`px-3 py-1.5 rounded border ${
                  newFilterShared ? 'bg-purple-100 border-purple-300' : 'bg-gray-100 border-gray-300'
                }`}
                onPress={() => setNewFilterShared(!newFilterShared)}
              >
                <Text className={`text-[10px] font-bold ${newFilterShared ? 'text-purple-800' : 'text-gray-600'}`}>
                  {newFilterShared ? 'SHARED' : 'PRIVATE'}
                </Text>
              </TouchableOpacity>
            </View>

            <View className="bg-gray-50 p-2 rounded-lg border border-gray-200">
              <Text className="text-[10px] font-bold text-gray-400 uppercase">Active filter criteria to save</Text>
              <Text className="text-[10px] text-gray-600 font-semibold mt-1">
                • Search: {search.trim() ? `"${search}"` : 'None'}{'\n'}
                • Approval: {filterApproval}{'\n'}
                • Payment: {filterPayment}{'\n'}
                • District: {filterDistrict}
              </Text>
            </View>

            <View className="flex-row gap-2 mt-1">
              <View className="flex-1">
                <Button
                  title="Save Filter"
                  variant="primary"
                  size="sm"
                  onPress={handleSaveFilter}
                  loading={saveFilterLoading}
                />
              </View>
              <View className="flex-1">
                <Button
                  title="Cancel"
                  variant="outline"
                  size="sm"
                  onPress={() => setShowSaveFilterForm(false)}
                />
              </View>
            </View>
          </View>
        </Card>
      )}

      {/* Fast-Toggle Saved Filter View Pills horizontal list */}
      <View className="bg-white border-b border-gray-100/50 py-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="px-4 gap-2"
        >
          {/* Default Preset Pills */}
          <TouchableOpacity
            className={`px-3 py-1.5 rounded-full border ${
              activeFilterId === 'all' ? 'bg-primary-50 border-primary-200' : 'bg-gray-50 border-gray-200'
            }`}
            onPress={() => applyFilterPreset('all', {})}
          >
            <Text className={`text-xs font-bold ${activeFilterId === 'all' ? 'text-primary-800' : 'text-gray-600'}`}>
              All Members
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`px-3 py-1.5 rounded-full border ${
              activeFilterId === 'pending_reviews' ? 'bg-primary-50 border-primary-200' : 'bg-gray-50 border-gray-200'
            }`}
            onPress={() => applyFilterPreset('pending_reviews', { approval_status: 'pending' })}
          >
            <Text className={`text-xs font-bold ${activeFilterId === 'pending_reviews' ? 'text-primary-800' : 'text-gray-600'}`}>
              Pending Reviews
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`px-3 py-1.5 rounded-full border ${
              activeFilterId === 'cash_backlog' ? 'bg-primary-50 border-primary-200' : 'bg-gray-50 border-gray-200'
            }`}
            onPress={() => applyFilterPreset('cash_backlog', { payment_status: 'pending' })}
          >
            <Text className={`text-xs font-bold ${activeFilterId === 'cash_backlog' ? 'text-primary-800' : 'text-gray-600'}`}>
              Cash Backlog
            </Text>
          </TouchableOpacity>

          {/* Custom Bookmarked Pills */}
          {savedFilters.map((f) => (
            <View key={f.id} className="flex-row items-center gap-1">
              <TouchableOpacity
                className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1.5 ${
                  activeFilterId === f.id ? 'bg-primary-50 border-primary-200' : 'bg-gray-50 border-gray-200'
                }`}
                onPress={() => applyFilterPreset(f.id, f.filters)}
              >
                <Bookmark size={10} color={activeFilterId === f.id ? '#15803d' : '#4b5563'} />
                <Text className={`text-xs font-bold ${activeFilterId === f.id ? 'text-primary-800' : 'text-gray-600'}`}>
                  {f.name}
                </Text>
                {f.is_shared && (
                  <Text className="text-[8px] bg-purple-100 text-purple-700 px-1 rounded font-bold uppercase">Shared</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                className="p-1 rounded bg-gray-50 border border-gray-200 active:bg-red-50"
                onPress={() => handleDeleteFilter(f.id, f.name)}
              >
                <Trash2 size={10} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
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
              placeholder="Password (optional, defaults to 123456)"
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
              {bulkMode && (
                <TouchableOpacity 
                  className={`w-5 h-5 rounded border mr-2 items-center justify-center ${
                    selectedIds.includes(m.id) ? 'bg-primary-900 border-primary-900' : 'bg-white border-gray-300'
                  }`}
                  onPress={() => {
                    setSelectedIds(prev => 
                      prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id]
                    );
                  }}
                >
                  {selectedIds.includes(m.id) && (
                    <Text className="text-[10px] font-bold text-white">✓</Text>
                  )}
                </TouchableOpacity>
              )}
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
                <Text className="text-xs text-gray-500">Approval</Text>
                <StatusBadge status={m.approval_status} />
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
              <Button
                title="View 360°"
                variant="primary"
                size="sm"
                onPress={() => router.push(`/admin/members/${m.id}` as any)}
              />

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
                loading={actionLoading === m.id}
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

      {/* Floating Bulk Operations Controls Panel */}
      {bulkMode && selectedIds.length > 0 && (
        <View className="bg-white border-t border-gray-200 p-4 shadow-lg gap-2">
          <View className="flex-row justify-between items-center mb-1">
            <Text className="text-xs font-extrabold text-primary-900 uppercase">
              {selectedIds.length} Members Selected
            </Text>
            {bulkProcessing && <ActivityIndicator size="small" color="#15803d" />}
          </View>

          <View className="flex-row flex-wrap gap-2">
            <Button
              title="Suspend"
              variant="destructive"
              size="sm"
              onPress={() => handleBulkAction('bulk-suspend', 'bulk suspend')}
              disabled={bulkProcessing}
            />
            <Button
              title="Activate"
              variant="primary"
              size="sm"
              onPress={() => handleBulkAction('bulk-activate', 'bulk activate')}
              disabled={bulkProcessing}
            />
            <Button
              title="Reject"
              variant="destructive"
              size="sm"
              onPress={() => handleBulkAction('bulk-reject', 'bulk reject')}
              disabled={bulkProcessing}
            />
            <Button
              title="Regenerate"
              variant="outline"
              size="sm"
              onPress={() => handleBulkAction('bulk-regenerate', 'bulk regenerate')}
              disabled={bulkProcessing}
            />
            <Button
              title="Revoke"
              variant="destructive"
              size="sm"
              onPress={() => handleBulkAction('bulk-revoke', 'bulk revoke')}
              disabled={bulkProcessing}
            />
          </View>

          <View className="flex-row items-center gap-2 border-t border-gray-100 pt-2 mt-1">
            <View className="flex-1">
              <Select
                value={bulkReviewerId}
                options={[
                  { label: 'Choose Reviewer to Assign...', value: 'unassigned' },
                  ...reviewers.map(r => ({ label: `${r.email} (${r.role})`, value: r.id }))
                ]}
                onValueChange={(val: any) => setBulkReviewerId(val)}
              />
            </View>
            <Button
              title="Assign Selected"
              variant="primary"
              size="sm"
              onPress={() => handleBulkAction('bulk-assign-reviewer', 'bulk assign reviewer')}
              disabled={bulkProcessing}
            />
          </View>
        </View>
      )}
    </View>
  );
}
