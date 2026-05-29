import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, TextInput, Alert, Platform, TouchableOpacity } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card, Button, StatusBadge } from '@/components/ui';
import { useAdmin } from '@/hooks/useAdmin';
import { confirm } from '@/lib/confirm';
import { Certificate } from '@/types';
import { formatDateTime } from '@/lib/utils';
import { Award, Search, Trash2, RefreshCw, Download } from 'lucide-react-native';

interface CertificateWithMember extends Certificate {
  member_name: string;
  member_email: string;
  membership_id: string;
}

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

export default function AdminCertificatesScreen() {
  const { callAdminAction } = useAdmin();
  const [certificates, setCertificates] = useState<CertificateWithMember[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'valid' | 'revoked' | 'suspended'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, valid: 0, revoked: 0, suspended: 0 });

  const fetchCertificates = useCallback(async () => {
    // Fetch stats
    const [totalRes, validRes, revokedRes, suspendedRes] = await Promise.all([
      supabase.from('certificates').select('id', { count: 'exact', head: true }),
      supabase.from('certificates').select('id', { count: 'exact', head: true }).eq('status', 'valid'),
      supabase.from('certificates').select('id', { count: 'exact', head: true }).eq('status', 'revoked'),
      supabase.from('certificates').select('id', { count: 'exact', head: true }).eq('status', 'suspended'),
    ]);

    setStats({
      total: totalRes.count || 0,
      valid: validRes.count || 0,
      revoked: revokedRes.count || 0,
      suspended: suspendedRes.count || 0,
    });

    // Fetch certificates with member info
    let query = supabase
      .from('certificates')
      .select('id, status, certificate_id, issued_at, member_id, accounts:member_id(full_name, email, membership_id)')
      .order('issued_at', { ascending: false });

    if (filterStatus !== 'all') {
      query = query.eq('status', filterStatus);
    }

    const { data } = await query.limit(100);

    let mapped = (data || []).map((c: any) => ({
      ...c,
      member_name: c.accounts?.full_name || 'Unknown',
      member_email: c.accounts?.email || '',
      membership_id: c.accounts?.membership_id || '',
      accounts: undefined,
    }));

    // Client-side search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      mapped = mapped.filter(
        (c: CertificateWithMember) =>
          c.certificate_id.toLowerCase().includes(q) ||
          c.member_name.toLowerCase().includes(q) ||
          c.member_email.toLowerCase().includes(q) ||
          c.membership_id.toLowerCase().includes(q)
      );
    }

    setCertificates(mapped);
  }, [filterStatus, search]);

  useEffect(() => {
    fetchCertificates();
  }, [fetchCertificates]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCertificates();
    setRefreshing(false);
  };

  const handleRevoke = async (cert: CertificateWithMember) => {
    const ok = await confirm('Revoke Certificate', `Are you sure you want to revoke the certificate for ${cert.member_name}?`, {
      confirmText: 'Revoke',
      destructive: true,
    });
    if (!ok) return;

    setActionLoading(cert.id);
    try {
      await callAdminAction('revoke-certificate', { account_id: cert.member_id });
      await fetchCertificates();
      showAlert('Success', 'Certificate revoked successfully.');
    } catch (err: any) {
      showAlert('Error', err?.message || 'Failed to revoke certificate');
    }
    setActionLoading(null);
  };

  const handleDelete = async (cert: CertificateWithMember) => {
    const ok = await confirm(
      'Delete Certificate',
      `This will permanently delete the certificate for ${cert.member_name} (${cert.certificate_id}).\n\nThis cannot be undone. The member will need to go through re-generation.`,
      {
        confirmText: 'Delete Permanently',
        destructive: true,
      }
    );
    if (!ok) return;

    setActionLoading(cert.id);
    try {
      await callAdminAction('delete-certificate', { account_id: cert.member_id });
      await fetchCertificates();
      showAlert('Success', 'Certificate deleted successfully.');
    } catch (err: any) {
      showAlert('Error', err?.message || 'Failed to delete certificate');
    }
    setActionLoading(null);
  };

  const handleRegenerate = async (cert: CertificateWithMember) => {
    const ok = await confirm(
      'Regenerate Certificate',
      `This will delete the existing certificate for ${cert.member_name} and generate a new one. Continue?`,
      { confirmText: 'Regenerate', destructive: false }
    );
    if (!ok) return;

    setActionLoading(cert.id);
    try {
      // Delete existing certificate first
      await callAdminAction('delete-certificate', { account_id: cert.member_id });

      // Trigger new generation
      const { error } = await supabase.functions.invoke('generate-certificate', {
        body: { member_id: cert.member_id },
      });

      if (error) throw new Error(error.message || 'Failed to trigger generation');

      await fetchCertificates();
      showAlert('Success', 'Certificate regenerated successfully.');
    } catch (err: any) {
      showAlert('Error', err?.message || 'Failed to regenerate certificate');
    }
    setActionLoading(null);
  };

  return (
    <View className="flex-1 bg-gray-50">
      {/* Stats */}
      <ScrollView
        horizontal
        contentContainerClassName="gap-3 px-4 py-3"
        showsHorizontalScrollIndicator={false}
      >
        <Card className="min-w-[120px]">
          <Text className="text-xs text-gray-500">Total</Text>
          <Text className="mt-1 text-2xl font-bold text-gray-900">{stats.total}</Text>
        </Card>
        <Card className="min-w-[120px] border-green-200 bg-green-50">
          <Text className="text-xs text-green-600">Valid</Text>
          <Text className="mt-1 text-2xl font-bold text-green-700">{stats.valid}</Text>
        </Card>
        <Card className="min-w-[120px] border-red-200 bg-red-50">
          <Text className="text-xs text-red-600">Revoked</Text>
          <Text className="mt-1 text-2xl font-bold text-red-700">{stats.revoked}</Text>
        </Card>
        <Card className="min-w-[120px] border-yellow-200 bg-yellow-50">
          <Text className="text-xs text-yellow-600">Suspended</Text>
          <Text className="mt-1 text-2xl font-bold text-yellow-700">{stats.suspended}</Text>
        </Card>
      </ScrollView>

      {/* Search & Filter */}
      <View className="border-b border-gray-200 bg-white px-4 py-3">
        <View className="mb-3 flex-row items-center rounded-lg border border-gray-300 bg-gray-50 px-3">
          <Search size={18} color="#9ca3af" />
          <TextInput
            className="ml-2 flex-1 py-2 text-base text-gray-900"
            placeholder="Search certificate ID, member name, email..."
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[
            { key: 'all' as const, label: `All (${stats.total})` },
            { key: 'valid' as const, label: `Valid (${stats.valid})` },
            { key: 'revoked' as const, label: `Revoked (${stats.revoked})` },
            { key: 'suspended' as const, label: `Suspended (${stats.suspended})` },
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
      </View>

      {/* Certificate List */}
      <ScrollView
        contentContainerClassName="p-4 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {certificates.length === 0 ? (
          <Text className="py-12 text-center text-gray-500">
            {search ? 'No certificates matching your search' : 'No certificates in this category'}
          </Text>
        ) : (
          certificates.map((cert) => (
            <Card key={cert.id} className="mb-3">
              <View className="flex-row items-start justify-between">
                <View className="flex-row items-center gap-3">
                  <View className={`rounded-lg p-2 ${
                    cert.status === 'valid' ? 'bg-green-100' :
                    cert.status === 'revoked' ? 'bg-red-100' : 'bg-yellow-100'
                  }`}>
                    <Award
                      size={20}
                      color={
                        cert.status === 'valid' ? '#15803d' :
                        cert.status === 'revoked' ? '#dc2626' : '#ca8a04'
                      }
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold text-gray-900">{cert.member_name}</Text>
                    <Text className="text-xs text-gray-500">{cert.member_email}</Text>
                  </View>
                </View>
                <StatusBadge status={cert.status} />
              </View>

              <View className="mt-3 gap-1">
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-500">Certificate ID</Text>
                  <Text className="text-xs font-medium text-gray-700">{cert.certificate_id}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-500">Membership ID</Text>
                  <Text className="text-xs text-gray-700">{cert.membership_id}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-500">Issued</Text>
                  <Text className="text-xs text-gray-700">{formatDateTime(cert.issued_at)}</Text>
                </View>
              </View>

              {/* Actions */}
              <View className="mt-3 flex-row flex-wrap gap-2 border-t border-gray-100 pt-3">
                {cert.status === 'valid' && (
                  <Button
                    title="Revoke"
                    variant="destructive"
                    size="sm"
                    onPress={() => handleRevoke(cert)}
                    loading={actionLoading === cert.id}
                  />
                )}

                <Button
                  title="Regenerate"
                  variant="outline"
                  size="sm"
                  onPress={() => handleRegenerate(cert)}
                  loading={actionLoading === cert.id}
                />

                <Button
                  title="Delete"
                  variant="destructive"
                  size="sm"
                  onPress={() => handleDelete(cert)}
                  loading={actionLoading === cert.id}
                />
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}
