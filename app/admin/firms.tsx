import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, TextInput, Platform, TouchableOpacity, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { Card, Button, StatusBadge, Select } from '@/components/ui';
import { useAdmin } from '@/hooks/useAdmin';
import { Account, DashboardStats } from '@/types';
import { formatDate } from '@/lib/utils';
import { maskAadhaar } from '@/lib/aadhaar';

import { Check, X, ChevronDown, ChevronUp, Edit2, Save, XCircle, FileText } from 'lucide-react-native';

const DISTRICT_OPTIONS = [
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
  { label: 'Bhiwapur', value: 'Bhiwapur' },
] as const;

const FIRM_TYPE_OPTIONS = [
  { label: 'Proprietorship', value: 'proprietorship' },
  { label: 'Partnership', value: 'partnership' },
  { label: 'Private Limited', value: 'private_limited' },
  { label: 'LLP', value: 'llp' },
  { label: 'Other', value: 'other' },
] as const;

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

// Editable field component
function EditableField({ label, value, displayValue, fieldKey, editMode, editData, onEditChange }: {
  label: string;
  value: string;
  displayValue?: string;
  fieldKey: string;
  editMode: boolean;
  editData: Record<string, any>;
  onEditChange: (key: string, val: string) => void;
}) {
  return (
    <View className="flex-row justify-between items-center py-0.5">
      <Text className="text-xs text-gray-500 flex-1">{label}</Text>
      {editMode ? (
        <TextInput
          className="flex-1 text-xs text-gray-900 font-semibold text-right border-b border-primary-200 py-0.5 px-1 bg-primary-50/30 rounded"
          value={editData[fieldKey] ?? value ?? ''}
          onChangeText={(val) => onEditChange(fieldKey, val)}
          placeholderTextColor="#9ca3af"
          placeholder={`Enter ${label.toLowerCase()}`}
        />
      ) : (
        <Text className="text-xs text-gray-700 flex-1 text-right">{(displayValue ?? value) || 'N/A'}</Text>
      )}
    </View>
  );
}

export default function AdminFirmsScreen() {
  const { callAdminAction } = useAdmin();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filteredAccounts, setFilteredAccounts] = useState<Account[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  // Filter states
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending_review' | 'approved' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'created_at' | 'updated_at'>('created_at');
  const [filterDistrict, setFilterDistrict] = useState('all');

  // Bulk action states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Expandable detail & edit states
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [saveLoading, setSaveLoading] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  const handleViewFile = async (path: string, bucket: string) => {
    if (!path) return;

    // If it's already a full HTTP URL, open it directly
    if (path.startsWith('http://') || path.startsWith('https://')) {
      try {
        await Linking.openURL(path);
      } catch (err: any) {
        showAlert('Error opening link', err.message || 'Failed to open link');
      }
      return;
    }

    setDownloadingFile(path);
    try {
      const { data: urlData, error: urlError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60);

      if (urlError || !urlData?.signedUrl) {
        throw new Error(urlError?.message || 'Could not generate signed URL.');
      }

      await Linking.openURL(urlData.signedUrl);
    } catch (err: any) {
      showAlert('Error opening file', err.message || 'Failed to open file');
    } finally {
      setDownloadingFile(null);
    }
  };

  // Fetch dashboard stats
  const fetchStats = useCallback(async () => {
    try {
      const [pendingReview, approved, rejected, total] = await Promise.all([
        supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
        supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('approval_status', 'approved'),
        supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('approval_status', 'rejected'),
        supabase.from('accounts').select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        pending_reviews: pendingReview.count || 0,
        pending_payments: 0,
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

  // Fetch accounts — now selects ALL fields for the detail view
  const fetchAccounts = useCallback(async () => {
    let query = supabase
      .from('accounts')
      .select('*')
      .order(sortBy, { ascending: false });

    // Apply status filter
    if (filterStatus === 'pending_review') {
      query = query.eq('approval_status', 'pending');
    } else if (filterStatus === 'approved') {
      query = query.eq('approval_status', 'approved');
    } else if (filterStatus === 'rejected') {
      query = query.eq('approval_status', 'rejected');
    }

    // Apply district filter
    if (filterDistrict !== 'all') {
      query = query.eq('district', filterDistrict);
    }

    const { data, error } = await query.limit(100);
    if (error) {
      console.error('Firms fetch error:', error);
      showAlert('Error', 'Failed to fetch firms: ' + error.message);
    }
    setAccounts((data || []) as Account[]);
  }, [filterStatus, sortBy, filterDistrict]);

  // Filter and search accounts in memory
  useEffect(() => {
    let filtered = accounts;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          (a.membership_id || '').toLowerCase().includes(q) ||
          (a.email || '').toLowerCase().includes(q) ||
          (a.firm_name || '').toLowerCase().includes(q) ||
          (a.full_name || '').toLowerCase().includes(q) ||
          (a.license_number || '').toLowerCase().includes(q) ||
          (a.registration_number || '').toLowerCase().includes(q)
      );
    }

    setFilteredAccounts(filtered);
  }, [accounts, searchQuery]);

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
    setActionLoading('bulk');
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(
        ids.map((id) => callAdminAction('approve-account', { account_id: id }))
      );
      setSelectedIds(new Set());
      await Promise.all([fetchAccounts(), fetchStats()]);
      showAlert('Success', `Approved ${ids.length} applications successfully.`);
    } catch (err: any) {
      showAlert('Error', err?.message || 'Failed to approve some applications');
      await Promise.all([fetchAccounts(), fetchStats()]);
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async (accountId: string) => {
    try {
      setActionLoading(accountId);
      await callAdminAction('approve-account', { account_id: accountId });
      await fetchAccounts();
      showAlert('Success', 'Application approved successfully.');
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
      await callAdminAction('reject-account', { account_id: accountId, reason: rejectReason });
      setRejectingId(null);
      setRejectReason('');
      await fetchAccounts();
    } catch (err: any) {
      showAlert('Error', err?.message || 'Failed to reject application');
    } finally {
      setActionLoading(null);
    }
  };

  // Edit handlers
  const startEditing = (account: Account) => {
    setEditingId(account.id);
    setEditData({
      firm_name: account.firm_name,
      firm_type: account.firm_type,
      license_number: account.license_number,
      registration_number: account.registration_number,
      gst_number: account.gst_number || '',
      firm_address: account.firm_address,
      contact_phone: account.contact_phone,
      contact_email: account.contact_email,
      firm_pin_code: account.firm_pin_code || '',
      district: account.district || '',
      partner_proprietor_name: account.partner_proprietor_name || '',
      whatsapp_number: account.whatsapp_number || '',
      aadhaar_card_number: account.aadhaar_card_number || '',
      ifms_number: account.ifms_number || '',
      seed_cotton_license_number: account.seed_cotton_license_number || '',
      seed_cotton_license_expiry: account.seed_cotton_license_expiry || '',
      sarthi_id_cotton: account.sarthi_id_cotton || '',
      seed_general_license_number: account.seed_general_license_number || '',
      seed_general_license_expiry: account.seed_general_license_expiry || '',
      sarthi_id_general: account.sarthi_id_general || '',
      pesticide_license_number: account.pesticide_license_number || '',
      pesticide_license_expiry: account.pesticide_license_expiry || '',
      fertilizer_license_number: account.fertilizer_license_number || '',
      fertilizer_license_expiry: account.fertilizer_license_expiry || '',
      residence_address: account.residence_address || '',
      residence_pin_code: account.residence_pin_code || '',
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditData({});
  };

  const handleEditChange = (key: string, value: string) => {
    setEditData(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveEdit = async (accountId: string) => {
    setSaveLoading(true);
    try {
      // Timestamp/date columns must receive null (not '') when empty,
      // but NOT NULL text columns (registration_number, license_number, etc.) must keep ''.
      const TIMESTAMP_FIELDS = new Set([
        'seed_cotton_license_expiry', 'seed_general_license_expiry',
        'pesticide_license_expiry', 'fertilizer_license_expiry',
      ]);
      const updatePayload: Record<string, any> = {};
      for (const [key, value] of Object.entries(editData)) {
        if (value !== undefined && value !== null) {
          updatePayload[key] = (value === '' && TIMESTAMP_FIELDS.has(key)) ? null : value;
        }
      }

      const { error } = await supabase
        .from('accounts')
        .update(updatePayload)
        .eq('id', accountId);

      if (error) throw error;

      showAlert('Success', 'Firm details updated successfully.');
      setEditingId(null);
      setEditData({});
      await fetchAccounts();
    } catch (err: any) {
      showAlert('Error', err?.message || 'Failed to save changes');
    } finally {
      setSaveLoading(false);
    }
  };

  const isEditing = (id: string) => editingId === id;
  const isExpanded = (id: string) => expandedId === id;

  return (
    <View className="flex-1 bg-gray-50">
      {/* Metrics Cards */}
      {stats && (
        <ScrollView
          horizontal
          contentContainerClassName="gap-3 px-4 py-3"
          showsHorizontalScrollIndicator={false}
        >
          <Card className="min-w-[120px]">
            <Text className="text-xs text-gray-500">Total Firms</Text>
            <Text className="mt-1 text-2xl font-bold text-gray-900">{stats.total_members}</Text>
          </Card>
          <Card className="min-w-[120px] border-red-200 bg-red-50">
            <Text className="text-xs text-red-600">Pending Review</Text>
            <Text className="mt-1 text-2xl font-bold text-red-700">{stats.pending_reviews}</Text>
          </Card>
          <Card className="min-w-[120px] border-green-200 bg-green-50">
            <Text className="text-xs text-green-600">Approved</Text>
            <Text className="mt-1 text-2xl font-bold text-green-700">{stats.approved_count}</Text>
          </Card>
          <Card className="min-w-[120px] border-yellow-200 bg-yellow-50">
            <Text className="text-xs text-yellow-600">Rejected</Text>
            <Text className="mt-1 text-2xl font-bold text-yellow-700">{stats.rejected_count}</Text>
          </Card>
        </ScrollView>
      )}

      {/* Filter & Sort Bar */}
      <View className="border-b border-gray-200 bg-white px-4 py-3">
        <View className="mb-3 flex-row items-center gap-2">
          <TextInput
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Search membership ID, email, firm, license..."
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Filter Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
          {[
            { key: 'all' as const, label: `All (${stats?.total_members || 0})` },
            { key: 'pending_review' as const, label: `Pending (${stats?.pending_reviews || 0})` },
            { key: 'approved' as const, label: `Approved (${stats?.approved_count || 0})` },
            { key: 'rejected' as const, label: `Rejected (${stats?.rejected_count || 0})` },
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

        {/* District Filter */}
        <Select
          label="District"
          options={DISTRICT_OPTIONS}
          value={filterDistrict}
          onValueChange={setFilterDistrict}
          placeholder="All Districts"
          className="mb-0"
        />

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
                size="sm"
                variant="primary"
                onPress={handleBulkApprove}
              />
              <Button
                title="Clear"
                size="sm"
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
          filteredAccounts.map((account) => {
            const expanded = isExpanded(account.id);
            const editing = isEditing(account.id);

            return (
              <Card
                key={account.id}
                className={`mb-3 ${
                  selectedIds.has(account.id) ? 'border-primary-500 border-2 bg-primary-50' : ''
                }`}
              >
                {/* Header Row */}
                <TouchableOpacity
                  onPress={() => {
                    if (filterStatus === 'pending_review') {
                      toggleSelect(account.id);
                    } else {
                      setExpandedId(expanded ? null : account.id);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View className="flex-row items-start gap-3">
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
                          <Text className="text-xs text-gray-500">by {account.full_name} • {account.membership_id}</Text>
                        </View>
                        <View className="flex-row items-center gap-2">
                          <StatusBadge status={account.approval_status} />
                          {filterStatus !== 'pending_review' && (
                            expanded ? <ChevronUp size={16} color="#6b7280" /> : <ChevronDown size={16} color="#6b7280" />
                          )}
                        </View>
                      </View>

                      {/* Summary fields always visible */}
                      <View className="mt-2 gap-1">
                        <View className="flex-row justify-between">
                          <Text className="text-xs text-gray-500">Type</Text>
                          <Text className="text-xs capitalize text-gray-700">{(account.firm_type || '').replace(/_/g, ' ')}</Text>
                        </View>
                        <View className="flex-row justify-between">
                          <Text className="text-xs text-gray-500">License #</Text>
                          <Text className="text-xs text-gray-700">{account.license_number || 'N/A'}</Text>
                        </View>
                        <View className="flex-row justify-between">
                          <Text className="text-xs text-gray-500">District</Text>
                          <Text className="text-xs text-gray-700">{account.district || 'N/A'}</Text>
                        </View>
                        <View className="flex-row justify-between">
                          <Text className="text-xs text-gray-500">Submitted</Text>
                          <Text className="text-xs text-gray-700">{formatDate(account.created_at)}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Expanded Detail Section */}
                {expanded && (
                  <View className="mt-3 border-t border-gray-100 pt-3">
                    {/* Edit/Save controls */}
                    <View className="flex-row justify-end gap-2 mb-3">
                      {editing ? (
                        <>
                          <Button
                            title="Cancel"
                            variant="outline"
                            size="sm"
                            onPress={cancelEditing}
                          />
                          <Button
                            title="Save Changes"
                            variant="primary"
                            size="sm"
                            onPress={() => handleSaveEdit(account.id)}
                            loading={saveLoading}
                          />
                        </>
                      ) : (
                        <Button
                          title="Edit Firm Details"
                          variant="outline"
                          size="sm"
                          onPress={() => startEditing(account)}
                        />
                      )}
                    </View>

                    {/* Firm Details Section */}
                    <View className="bg-gray-50 rounded-lg p-3 border border-gray-100 mb-3">
                      <Text className="text-[10px] font-bold text-gray-400 uppercase mb-2">Business Information</Text>
                      <View className="gap-1.5">
                        <EditableField label="Firm Name" value={account.firm_name} fieldKey="firm_name" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        {editing ? (
                          <View className="flex-row justify-between items-center py-0.5">
                            <Text className="text-xs text-gray-500 flex-1">Firm Type</Text>
                            <View className="flex-1">
                              <Select
                                value={editData.firm_type || account.firm_type}
                                options={FIRM_TYPE_OPTIONS as any}
                                onValueChange={(val) => handleEditChange('firm_type', val)}
                                className="mb-0"
                              />
                            </View>
                          </View>
                        ) : (
                          <EditableField label="Firm Type" value={(account.firm_type || '').replace(/_/g, ' ')} fieldKey="firm_type" editMode={false} editData={editData} onEditChange={handleEditChange} />
                        )}
                        <EditableField label="Partner/Proprietor" value={account.partner_proprietor_name || ''} fieldKey="partner_proprietor_name" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        <EditableField label="License Number" value={account.license_number} fieldKey="license_number" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        <EditableField label="Registration Number" value={account.registration_number} fieldKey="registration_number" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        <EditableField label="GSTIN" value={account.gst_number || ''} fieldKey="gst_number" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        <EditableField label="IFMS Number" value={account.ifms_number || ''} fieldKey="ifms_number" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                      </View>
                    </View>

                    {/* Contact Details */}
                    <View className="bg-gray-50 rounded-lg p-3 border border-gray-100 mb-3">
                      <Text className="text-[10px] font-bold text-gray-400 uppercase mb-2">Contact & Address</Text>
                      <View className="gap-1.5">
                        <EditableField label="Firm Address" value={account.firm_address || ''} fieldKey="firm_address" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        <EditableField label="Firm PIN Code" value={account.firm_pin_code || ''} fieldKey="firm_pin_code" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        <EditableField label="Contact Phone" value={account.contact_phone || ''} fieldKey="contact_phone" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        <EditableField label="Contact Email" value={account.contact_email || ''} fieldKey="contact_email" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        <EditableField label="WhatsApp" value={account.whatsapp_number || ''} fieldKey="whatsapp_number" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        <EditableField label="Aadhaar" value={account.aadhaar_card_number || ''} displayValue={maskAadhaar(account.aadhaar_card_number)} fieldKey="aadhaar_card_number" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        {editing ? (
                          <View className="flex-row justify-between items-center py-0.5">
                            <Text className="text-xs text-gray-500 flex-1">District</Text>
                            <View className="flex-1">
                              <Select
                                value={editData.district || account.district || 'all'}
                                options={DISTRICT_OPTIONS.filter(d => d.value !== 'all') as any}
                                onValueChange={(val) => handleEditChange('district', val)}
                                className="mb-0"
                              />
                            </View>
                          </View>
                        ) : (
                          <EditableField label="District" value={account.district || ''} fieldKey="district" editMode={false} editData={editData} onEditChange={handleEditChange} />
                        )}
                      </View>
                    </View>

                    {/* License Details */}
                    <View className="bg-gray-50 rounded-lg p-3 border border-gray-100 mb-3">
                      <Text className="text-[10px] font-bold text-gray-400 uppercase mb-2">License Details</Text>
                      <View className="gap-1.5">
                        <EditableField label="Seed Cotton License" value={account.seed_cotton_license_number || ''} fieldKey="seed_cotton_license_number" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        <EditableField label="Cotton License Expiry" value={account.seed_cotton_license_expiry || ''} fieldKey="seed_cotton_license_expiry" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        <EditableField label="Sarthi ID (Cotton)" value={account.sarthi_id_cotton || ''} fieldKey="sarthi_id_cotton" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        <EditableField label="Seed General License" value={account.seed_general_license_number || ''} fieldKey="seed_general_license_number" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        <EditableField label="General License Expiry" value={account.seed_general_license_expiry || ''} fieldKey="seed_general_license_expiry" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        <EditableField label="Sarthi ID (General)" value={account.sarthi_id_general || ''} fieldKey="sarthi_id_general" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        <EditableField label="Pesticide License" value={account.pesticide_license_number || ''} fieldKey="pesticide_license_number" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        <EditableField label="Pesticide Expiry" value={account.pesticide_license_expiry || ''} fieldKey="pesticide_license_expiry" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        <EditableField label="Fertilizer License" value={account.fertilizer_license_number || ''} fieldKey="fertilizer_license_number" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        <EditableField label="Fertilizer Expiry" value={account.fertilizer_license_expiry || ''} fieldKey="fertilizer_license_expiry" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                      </View>
                    </View>

                    {/* Residential Details */}
                    <View className="bg-gray-50 rounded-lg p-3 border border-gray-100 mb-3">
                      <Text className="text-[10px] font-bold text-gray-400 uppercase mb-2">Residential Details</Text>
                      <View className="gap-1.5">
                        <EditableField label="Residence Address" value={account.residence_address || ''} fieldKey="residence_address" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                        <EditableField label="Residence PIN" value={account.residence_pin_code || ''} fieldKey="residence_pin_code" editMode={editing} editData={editData} onEditChange={handleEditChange} />
                      </View>
                    </View>

                    {/* Documents */}
                    {account.documents_urls && account.documents_urls.length > 0 && (
                      <View className="bg-gray-50 rounded-lg p-3 border border-gray-100 mb-3">
                        <Text className="text-[10px] font-bold text-gray-400 uppercase mb-2">Uploaded Documents ({account.documents_urls.length})</Text>
                        {account.documents_urls.map((url, index) => (
                          <TouchableOpacity
                            key={index}
                            className="flex-row items-center py-1.5 px-3 mb-1 bg-white border border-gray-200 rounded-md"
                            onPress={() => handleViewFile(url, 'documents')}
                            disabled={downloadingFile !== null}
                          >
                            <FileText size={14} color="#15803d" />
                            <Text className="ml-2 text-xs font-semibold text-primary-900 flex-1">
                              {downloadingFile === url ? 'Loading...' : `Document #${index + 1}`}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}

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
              </Card>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
