import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, TextInput, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { Card, Button, StatusBadge } from '@/components/ui';
import { useAdmin } from '@/hooks/useAdmin';
import { Firm } from '@/types';
import { formatDate } from '@/lib/utils';
import { STORAGE_BUCKETS } from '@/constants';
import * as DocumentPicker from 'expo-document-picker';

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
  const [firms, setFirms] = useState<(Firm & { member_name: string; member_payment_status?: string | null })[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchFirms = useCallback(async () => {
    let query = supabase
      .from('firms')
      .select('*, members(full_name, payment_status)')
      .order('created_at', { ascending: false });

    if (filter === 'pending') {
      query = query.eq('approval_status', 'pending');
    }

    const { data } = await query.limit(50);
    setFirms(
      (data || []).map((f: any) => ({
        ...f,
        member_name: f.members?.full_name || 'Unknown',
        member_payment_status: f.members?.payment_status ?? null,
        members: undefined,
      }))
    );
  }, [filter]);

  useEffect(() => { fetchFirms(); }, [fetchFirms]);

  useFocusEffect(
    useCallback(() => {
      fetchFirms();
    }, [fetchFirms])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchFirms();
    setRefreshing(false);
  };

  const handleApprove = async (firmId: string) => {
    try {
      // Always re-check payment status at click-time to avoid stale UI state.
      const { data: latest, error: latestError } = await supabase
        .from('firms')
        .select('id, members(payment_status)')
        .eq('id', firmId)
        .single();

      if (latestError) throw new Error(latestError.message);

      const membersJoin = (latest as any)?.members;
      const memberRow = Array.isArray(membersJoin) ? membersJoin[0] : membersJoin;
      const latestPaymentStatus = memberRow?.payment_status as string | undefined;
      if (latestPaymentStatus !== 'paid') {
        showAlert('Cannot approve', 'Payment must be verified as paid before approving the firm.');
        return;
      }

      setActionLoading(firmId);
      await callAdminAction('approve-firm', { firm_id: firmId });
      await fetchFirms();
      showAlert('Success', "Firm approved. Switch to 'All Firms' to upload the certificate.");
    } catch (err: any) {
      showAlert('Error', err?.message || 'Failed to approve firm');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (firmId: string) => {
    if (!rejectReason.trim()) {
      showAlert('Error', 'Please provide a rejection reason');
      return;
    }
    try {
      setActionLoading(firmId);
      await callAdminAction('reject-firm', { firm_id: firmId, reason: rejectReason });
      setRejectingId(null);
      setRejectReason('');
      await fetchFirms();
    } catch (err: any) {
      showAlert('Error', err?.message || 'Failed to reject firm');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUploadCertificate = async (firm: Firm & { member_name: string }) => {
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
      const filePath = `${firm.member_id}/${firm.id}_${Date.now()}_${safeName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKETS.certificates)
        .upload(filePath, blob, { contentType: blob.type || 'image/jpeg' });

      if (uploadError) throw new Error(uploadError.message);
      const certificatePath = uploadData?.path;
      if (!certificatePath) throw new Error('Upload failed');

      const { data: existing } = await supabase
        .from('certificates')
        .select('id')
        .eq('member_id', firm.member_id)
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
          .insert({ member_id: firm.member_id, certificate_url: certificatePath });
        if (error) throw new Error(error.message);
      }

      showAlert('Success', 'Certificate uploaded and linked to member.');
    } catch (err: any) {
      showAlert('Error', err?.message || 'Failed to upload certificate');
    }
  };

  return (
    <View className="flex-1 bg-gray-50">
      {/* Filter Tabs */}
      <View className="flex-row border-b border-gray-200 bg-white">
        <Text
          className={`flex-1 py-3 text-center text-sm font-medium ${filter === 'pending' ? 'border-b-2 border-primary-700 text-primary-700' : 'text-gray-500'}`}
          onPress={() => setFilter('pending')}
        >
          Pending Review
        </Text>
        <Text
          className={`flex-1 py-3 text-center text-sm font-medium ${filter === 'all' ? 'border-b-2 border-primary-700 text-primary-700' : 'text-gray-500'}`}
          onPress={() => setFilter('all')}
        >
          All Firms
        </Text>
      </View>

      <ScrollView
        contentContainerClassName="p-4 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {firms.map((firm) => (
          <Card key={firm.id} className="mb-3">
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <Text className="text-lg font-semibold text-gray-900">{firm.firm_name}</Text>
                <Text className="text-xs text-gray-500">by {firm.member_name}</Text>
              </View>
              <StatusBadge status={firm.approval_status} />
            </View>

            <View className="mt-3 gap-1">
              <View className="flex-row justify-between">
                <Text className="text-xs text-gray-500">Type</Text>
                <Text className="text-xs capitalize text-gray-700">{firm.firm_type.replace('_', ' ')}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-xs text-gray-500">License #</Text>
                <Text className="text-xs text-gray-700">{firm.license_number}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-xs text-gray-500">Registration #</Text>
                <Text className="text-xs text-gray-700">{firm.registration_number}</Text>
              </View>
              {firm.gst_number && (
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-500">GST #</Text>
                  <Text className="text-xs text-gray-700">{firm.gst_number}</Text>
                </View>
              )}
              <View className="flex-row justify-between">
                <Text className="text-xs text-gray-500">Submitted</Text>
                <Text className="text-xs text-gray-700">{formatDate(firm.created_at)}</Text>
              </View>
              {firm.documents_urls.length > 0 && (
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-500">Documents</Text>
                  <Text className="text-xs text-primary-700">{firm.documents_urls.length} files</Text>
                </View>
              )}
            </View>

            {/* Actions for pending firms */}
            {firm.approval_status === 'pending' && (
              <View className="mt-3 border-t border-gray-100 pt-3">
                {rejectingId === firm.id ? (
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
                        onPress={() => handleReject(firm.id)}
                        loading={actionLoading === firm.id}
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
                      onPress={() => handleApprove(firm.id)}
                      loading={actionLoading === firm.id}
                      className="flex-1"
                    />
                    <Button
                      title="Reject"
                      variant="destructive"
                      size="sm"
                      onPress={() => setRejectingId(firm.id)}
                      className="flex-1"
                    />
                  </View>
                )}
              </View>
            )}

            {firm.approval_status === 'approved' && (
              <View className="mt-3 border-t border-gray-100 pt-3">
                <Button
                  title="Upload Certificate (JPEG)"
                  variant="outline"
                  size="sm"
                  onPress={() => handleUploadCertificate(firm)}
                />
              </View>
            )}
          </Card>
        ))}

        {firms.length === 0 && (
          <Text className="py-12 text-center text-gray-500">
            {filter === 'pending' ? 'No firms pending review' : 'No firms found'}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
