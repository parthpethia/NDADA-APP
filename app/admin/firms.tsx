import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, TextInput, Platform, FlatList, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { Card, Button, StatusBadge } from '@/components/ui';
import { useAdmin } from '@/hooks/useAdmin';
import { Account, DashboardStats } from '@/types';
import { formatDate } from '@/lib/utils';
import { STORAGE_BUCKETS } from '@/constants';
import * as DocumentPicker from 'expo-document-picker';
import { Check, X } from 'lucide-react-native';

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    const webAlert = (globalThis as any)?.alert as ((text?: string) => void) | undefined;
    if (typeof webAlert === 'function') {
      webAlert(`${title}\n\n${message}`);
      return;
    }
  }

  Alert.alert(title, message);
}

export default function AdminFirmsScreen() {
  const { callAdminAction } = useAdmin();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filteredAccounts, setFilteredAccounts] = useState<Account[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  // Filter states
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending_payment' | 'pending_review' | 'approved' | 'rejected'>('pending_review');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'created_at' | 'updated_at'>('created_at');

  // Bulk action states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Fetch dashboard stats
  const fetchStats = useCallback(async () => {
    try {
      const [pendingPayment, pendingReview, approved, rejected, total] = await Promise.all([
        supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('payment_status', 'pending'),
        supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending').eq('payment_status', 'paid'),
        supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('approval_status', 'approved'),
        supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('approval_status', 'rejected'),
        supabase.from('accounts').select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        pending_reviews: pendingReview.count || 0,
        pending_payments: pendingPayment.count || 0,
        approved_count: approved.count || 0,
        rejected_count: rejected.count || 0,
        total_members: total.count || 0,
        total_firms: total.count || 0,
        payments_completed: 0,
        certificates_issued: 0,
        suspicious_accounts: 0,
      });
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  // Fetch accounts based on filter
  const fetchAccounts = useCallback(async () => {
    let query = supabase
      .from('accounts')
      .select('*')
      .order(sortBy, { ascending: false });

    // Apply status filter
    if (filterStatus === 'pending_payment') {
      query = query.eq('payment_status', 'pending');
    } else if (filterStatus === 'pending_review') {
      query = query.eq('approval_status', 'pending').eq('payment_status', 'paid');
    } else if (filterStatus === 'approved') {
      query = query.eq('approval_status', 'approved');
    } else if (filterStatus === 'rejected') {
      query = query.eq('approval_status', 'rejected');
    }

    const { data } = await query.limit(100);
    setAccounts(data || []);
  }, [filterStatus, sortBy]);

  // Filter and search accounts in memory
  useEffect(() => {
    let filtered = accounts;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.membership_id.toLowerCase().includes(q) ||
          a.email?.toLowerCase().includes(q) ||
          a.firm_name.toLowerCase().includes(q) ||
          a.full_name.toLowerCase().includes(q)
      );
    }

    setFilteredAccounts(filtered);
  }, [accounts, searchQuery]);

  useEffect(() => {
    fetchAccounts();
    fetchStats();
  }, [fetchAccounts, fetchStats]);

  useFocusEffect(
    useCallback(() => {
      fetchAccounts();
      fetchStats();
    }, [fetchAccounts, fetchStats])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchAccounts(), fetchStats()]);
    setRefreshing(false);
  };

  // Bulk actions
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAccounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAccounts.map((a) => a.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    try {
      for (const id of selectedIds) {
        await handleApprove(id);
      }
      setSelectedIds(new Set());
    } catch (err) {
      showAlert('Error', 'Failed to approve some applications');
    }
  };

  const handleApprove = async (accountId: string) => {
    try {
      // Always re-check payment status at click-time to avoid stale UI state.
      const { data: latest, error: latestError } = await supabase
        .from('accounts')
        .select('id, payment_status')
        .eq('id', accountId)
        .single();

      if (latestError) throw new Error(latestError.message);

      const latestPaymentStatus = (latest as any)?.payment_status;
      if (latestPaymentStatus !== 'paid') {
        showAlert('Cannot approve', 'Payment must be verified as paid before approving the application.');
        return;
      }

      setActionLoading(accountId);
      await callAdminAction('approve-firm', { firm_id: accountId });
      await fetchAccounts();
      showAlert('Success', "Application approved. Switch to 'All Applications' to upload the certificate.");
    } catch (err: any) {
      showAlert('Error', err?.message || 'Failed to approve application');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (accountId: string) => {
    if (!rejectReason.trim()) {
      showAlert('Error', 'Please provide a rejection reason');
      return;
    }
    try {
      setActionLoading(accountId);
      await callAdminAction('reject-firm', { firm_id: accountId, reason: rejectReason });
      setRejectingId(null);
      setRejectReason('');
      await fetchAccounts();
    } catch (err: any) {
      showAlert('Error', err?.message || 'Failed to reject application');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUploadCertificate = async (account: Account) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const safeName = (asset.name || 'certificate.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${account.id}/${account.id}_${Date.now()}_${safeName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKETS.certificates)
        .upload(filePath, blob, { contentType: blob.type || 'image/jpeg' });

      if (uploadError) throw new Error(uploadError.message);
      const certificatePath = uploadData?.path;
      if (!certificatePath) throw new Error('Upload failed');

      const { data: existing } = await supabase
        .from('certificates')
        .select('id')
        .eq('member_id', account.id)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from('certificates')
          .update({ certificate_url: certificatePath, status: 'valid', issued_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from('certificates')
          .insert({ member_id: account.id, certificate_url: certificatePath });
        if (error) throw new Error(error.message);
      }

      showAlert('Success', 'Certificate uploaded and linked to account.');
    } catch (err: any) {
      showAlert('Error', err?.message || 'Failed to upload certificate');
    }
  };

  return (
    <View className="flex-1 bg-gray-50">
      {/* Metrics Cards */}
      {stats && (
        <ScrollView
          horizontal
          contentContainerClassName="gap-3 px-4 py-3"
          showsHorizontalScrollIndicator={false}
        >
          <Card className="min-w-[140px]">
            <Text className="text-xs text-gray-500">Pending Payment</Text>
            <Text className="mt-1 text-2xl font-bold text-orange-600">{stats.pending_payments}</Text>
          </Card>
          <Card className="min-w-[140px] border-red-200 bg-red-50">
            <Text className="text-xs text-red-600">Pending Review</Text>
            <Text className="mt-1 text-2xl font-bold text-red-700">{stats.pending_reviews}</Text>
          </Card>
          <Card className="min-w-[140px]">
            <Text className="text-xs text-gray-500">Approved</Text>
            <Text className="mt-1 text-2xl font-bold text-green-600">{stats.approved_count}</Text>
          </Card>
          <Card className="min-w-[140px]">
            <Text className="text-xs text-gray-500">Rejected</Text>
            <Text className="mt-1 text-2xl font-bold text-red-600">{stats.rejected_count}</Text>
          </Card>
        </ScrollView>
      )}

      {/* Filter & Sort Bar */}
      <View className="border-b border-gray-200 bg-white px-4 py-3">
        <View className="mb-3 flex-row items-center gap-2">
          <TextInput
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Search membership ID, email, firm..."
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Filter Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
          {[
            { key: 'pending_review' as const, label: `Pending Review (${stats?.pending_reviews || 0})` },
            { key: 'pending_payment' as const, label: `Pending Payment (${stats?.pending_payments || 0})` },
            { key: 'approved' as const, label: `Approved (${stats?.approved_count || 0})` },
            { key: 'rejected' as const, label: `Rejected (${stats?.rejected_count || 0})` },
            { key: 'all' as const, label: `All (${stats?.total_members || 0})` },
          ].map((f) => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilterStatus(f.key)}
              className={`mr-2 rounded-full px-3 py-1.5 ${
                filterStatus === f.key ? 'bg-primary-700' : 'bg-gray-200'
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  filterStatus === f.key ? 'text-white' : 'text-gray-700'
                }`}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Sort & Bulk Actions */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            {filterStatus === 'pending_review' && (
              <>
                <TouchableOpacity onPress={toggleSelectAll} className="rounded p-1">
                  <View
                    className={`h-5 w-5 items-center justify-center rounded border-2 ${
                      selectedIds.size === filteredAccounts.length && filteredAccounts.length > 0
                        ? 'border-primary-700 bg-primary-700'
                        : 'border-gray-300'
                    }`}
                  >
                    {selectedIds.size === filteredAccounts.length && filteredAccounts.length > 0 && (
                      <Check size={14} color="#fff" />
                    )}
                  </View>
                </TouchableOpacity>
                {selectedIds.size > 0 && (
                  <Text className="text-xs font-medium text-gray-700">{selectedIds.size} selected</Text>
                )}
              </>
            )}
          </View>
          {selectedIds.size > 0 && (
            <View className="flex-row gap-2">
              <Button
                title="Bulk Approve"
                size="xs"
                variant="primary"
                onPress={handleBulkApprove}
              />
              <Button
                title="Clear"
                size="xs"
                variant="ghost"
                onPress={() => setSelectedIds(new Set())}
              />
            </View>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerClassName="p-4 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredAccounts.length === 0 ? (
          <Text className="py-12 text-center text-gray-500">
            {searchQuery ? 'No accounts matching your search' : 'No accounts in this category'}
          </Text>
        ) : (
          filteredAccounts.map((account) => (
            <TouchableOpacity
              key={account.id}
              onPress={() => filterStatus === 'pending_review' && toggleSelect(account.id)}
              activeOpacity={filterStatus === 'pending_review' ? 0.7 : 1}
            >
              <Card
                className={`mb-3 flex-row gap-3 ${
                  selectedIds.has(account.id) ? 'border-primary-500 border-2 bg-primary-50' : ''
                }`}
              >
                {filterStatus === 'pending_review' && (
                  <TouchableOpacity
                    onPress={() => toggleSelect(account.id)}
                    className="justify-center"
                  >
                    <View
                      className={`h-5 w-5 items-center justify-center rounded border-2 ${
                        selectedIds.has(account.id)
                          ? 'border-primary-700 bg-primary-700'
                          : 'border-gray-300'
                      }`}
                    >
                      {selectedIds.has(account.id) && <Check size={14} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                )}

                <View className="flex-1">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      <Text className="text-lg font-semibold text-gray-900">{account.firm_name}</Text>
                      <Text className="text-xs text-gray-500">by {account.full_name}</Text>
                    </View>
                    <StatusBadge status={account.approval_status} />
                  </View>

                  <View className="mt-3 gap-1">
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-500">Type</Text>
                      <Text className="text-xs capitalize text-gray-700">{account.firm_type.replace('_', ' ')}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-500">License #</Text>
                      <Text className="text-xs text-gray-700">{account.license_number}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-500">Registration #</Text>
                      <Text className="text-xs text-gray-700">{account.registration_number}</Text>
                    </View>
                    {account.gst_number && (
                      <View className="flex-row justify-between">
                        <Text className="text-xs text-gray-500">GST #</Text>
                        <Text className="text-xs text-gray-700">{account.gst_number}</Text>
                      </View>
                    )}
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-500">Submitted</Text>
                      <Text className="text-xs text-gray-700">{formatDate(account.created_at)}</Text>
                    </View>
                    {account.documents_urls.length > 0 && (
                      <View className="flex-row justify-between">
                        <Text className="text-xs text-gray-500">Documents</Text>
                        <Text className="text-xs text-primary-700">{account.documents_urls.length} files</Text>
                      </View>
                    )}
                  </View>

                  {/* Actions for pending applications */}
                  {account.approval_status === 'pending' && (
                    <View className="mt-3 border-t border-gray-100 pt-3">
                      {rejectingId === account.id ? (
                        <View>
                          <TextInput
                            className="mb-2 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            placeholder="Rejection reason..."
                            placeholderTextColor="#9ca3af"
                            value={rejectReason}
                            onChangeText={setRejectReason}
                          />
                          <View className="flex-row gap-2">
                            <Button
                              title="Cancel"
                              variant="ghost"
                              size="sm"
                              onPress={() => { setRejectingId(null); setRejectReason(''); }}
                              className="flex-1"
                            />
                            <Button
                              title="Confirm Reject"
                              variant="destructive"
                              size="sm"
                              onPress={() => handleReject(account.id)}
                              loading={actionLoading === account.id}
                              className="flex-1"
                            />
                          </View>
                        </View>
                      ) : (
                        <View className="flex-row gap-2">
                          <Button
                            title="Approve"
                            variant="primary"
                            size="sm"
                            onPress={() => handleApprove(account.id)}
                            loading={actionLoading === account.id}
                            className="flex-1"
                          />
                          <Button
                            title="Reject"
                            variant="destructive"
                            size="sm"
                            onPress={() => setRejectingId(account.id)}
                            className="flex-1"
                          />
                        </View>
                      )}
                    </View>
                  )}

                  {account.approval_status === 'approved' && (
                    <View className="mt-3 border-t border-gray-100 pt-3">
                      <Button
                        title="Upload Certificate (JPEG)"
                        variant="outline"
                        size="sm"
                        onPress={() => handleUploadCertificate(account)}
                      />
                    </View>
                  )}
                </View>
              </Card>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}
