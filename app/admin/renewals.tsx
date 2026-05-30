import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card, Button, StatusBadge, Select } from '@/components/ui';
import { useAdmin } from '@/hooks/useAdmin';
import { confirm } from '@/lib/confirm';
import { formatDate, formatDateTime } from '@/lib/utils';
import { Clock, ShieldAlert, Award, AlertTriangle, Send } from 'lucide-react-native';

interface RenewalCount {
  status: string;
  members_count: number;
}

interface RenewalMember {
  id: string;
  full_name: string;
  membership_id: string;
  email: string;
  phone: string;
  certificates: {
    issued_at: string;
    last_renewal_reminder_at: string | null;
    status: string;
  };
}

export default function RenewalsWorkflowScreen() {
  const { callAdminAction } = useAdmin();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({
    expired: 0,
    '0_30_days': 0,
    '31_60_days': 0,
    '61_90_days': 0,
  });

  const [selectedBucket, setSelectedBucket] = useState<'expired' | '0_30' | '31_60' | '61_90'>('expired');
  const [membersList, setMembersList] = useState<RenewalMember[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchRenewalsOverview = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_membership_renewal_status');
      if (error) throw error;

      const results = (data || []) as RenewalCount[];
      const countMap: Record<string, number> = {
        expired: 0,
        '0_30_days': 0,
        '31_60_days': 0,
        '61_90_days': 0,
      };

      results.forEach((r) => {
        if (r.status in countMap) {
          countMap[r.status] = Number(r.members_count);
        }
      });

      setCounts(countMap);
    } catch (err: any) {
      console.error('Failed to fetch renewals aggregates:', err);
    }
  }, []);

  const fetchBucketMembers = useCallback(async () => {
    setListLoading(true);
    try {
      let query = supabase
        .from('accounts')
        .select('id, full_name, membership_id, email, phone, certificates!inner(issued_at, last_renewal_reminder_at, status)')
        .eq('account_status', 'active')
        .eq('certificates.status', 'valid');

      const now = new Date();
      if (selectedBucket === 'expired') {
        const d365 = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
        query = query.lte('certificates.issued_at', d365);
      } else if (selectedBucket === '0_30') {
        const d365 = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
        const d335 = new Date(now.getTime() - 335 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gt('certificates.issued_at', d365).lte('certificates.issued_at', d335);
      } else if (selectedBucket === '31_60') {
        const d335 = new Date(now.getTime() - 335 * 24 * 60 * 60 * 1000).toISOString();
        const d305 = new Date(now.getTime() - 305 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gt('certificates.issued_at', d335).lte('certificates.issued_at', d305);
      } else if (selectedBucket === '61_90') {
        const d305 = new Date(now.getTime() - 305 * 24 * 60 * 60 * 1000).toISOString();
        const d275 = new Date(now.getTime() - 275 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gt('certificates.issued_at', d305).lte('certificates.issued_at', d275);
      }

      const { data, error } = await query.order('certificates(issued_at)', { ascending: true });
      if (error) throw error;

      setMembersList((data || []) as unknown as RenewalMember[]);
    } catch (err: any) {
      Alert.alert('Load Error', err.message);
    } finally {
      setListLoading(false);
    }
  }, [selectedBucket]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchRenewalsOverview(), fetchBucketMembers()]);
    setLoading(false);
  }, [fetchRenewalsOverview, fetchBucketMembers]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchRenewalsOverview(), fetchBucketMembers()]);
    setRefreshing(false);
  };

  // Bulk Dispatch campaign reminders for the selected bucket
  const handleBulkRemind = async () => {
    const label = selectedBucket === 'expired' ? 'Expired memberships' : `Members expiring soon (${selectedBucket.replace('_', '-')} days)`;
    const targetType = selectedBucket === 'expired' ? 'expired' : `expired_${selectedBucket}`;

    const ok = await confirm('Bulk Send Reminders', `Are you sure you want to send renewal reminders to all members inside ${label}? Duplicate dispatches within 7 days are automatically throttled per member.`, {
      confirmText: 'Send Reminders'
    });
    if (!ok) return;

    setActionLoading('bulk-remind');
    try {
      const result = await callAdminAction('send-campaign', {
        target_type: targetType,
        title: 'Membership Renewal Overdue',
        message: 'Your NDADA association membership is expiring or has expired. Please process your payment and submit your renewal request immediately to prevent suspension.'
      });

      Alert.alert('Campaign Sent', result?.message || 'Reminders dispatched.');
      await Promise.all([fetchRenewalsOverview(), fetchBucketMembers()]);
    } catch (err: any) {
      Alert.alert('Dispatch Failed', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Renew individual membership (enqueue certificate generation)
  const handleRenewMember = async (memberId: string) => {
    const ok = await confirm('Process Renewal', 'Confirm processing renewal? This will enqueue a new certificate generation job for this member.', {
      confirmText: 'Renew Member'
    });
    if (!ok) return;

    setActionLoading(memberId);
    try {
      await callAdminAction('bulk-regenerate', {
        account_ids: [memberId]
      });

      Alert.alert('Renewal Queued', 'A new certificate generation job has been enqueued. The member profile will update to active once complete.');
      await Promise.all([fetchRenewalsOverview(), fetchBucketMembers()]);
    } catch (err: any) {
      Alert.alert('Renewal Failed', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Suspend individual member (manual suspension)
  const handleSuspendMember = async (memberId: string) => {
    const ok = await confirm('Suspend Member', 'Are you sure you want to manually suspend this member? Suspensions are explicit administrative decisions.', {
      confirmText: 'Suspend Member',
      destructive: true
    });
    if (!ok) return;

    setActionLoading(memberId);
    try {
      await callAdminAction('suspend-member', {
        account_id: memberId
      });

      Alert.alert('Member Suspended', 'The member account status has been set to suspended.');
      await Promise.all([fetchRenewalsOverview(), fetchBucketMembers()]);
    } catch (err: any) {
      Alert.alert('Suspension Failed', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#15803d" />
        <Text className="mt-3 text-gray-500 font-medium">Loading Renewals workflow...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerClassName="p-4 pb-12"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text className="mb-4 text-xl font-bold text-gray-900">Renewals & Expiries Workflow</Text>

        {/* 1. Renewal Category Buckets Overview */}
        <View className="flex-row flex-wrap gap-2 mb-4">
          <TouchableOpacity 
            className={`flex-1 min-w-[45%] p-3 rounded-xl border shadow-sm ${
              selectedBucket === 'expired' ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'
            }`}
            onPress={() => setSelectedBucket('expired')}
          >
            <Text className="text-[10px] uppercase font-bold text-red-600 mb-1">Expired Members</Text>
            <Text className="text-xl font-extrabold text-gray-900">{counts.expired}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            className={`flex-1 min-w-[45%] p-3 rounded-xl border shadow-sm ${
              selectedBucket === '0_30' ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100'
            }`}
            onPress={() => setSelectedBucket('0_30')}
          >
            <Text className="text-[10px] uppercase font-bold text-orange-600 mb-1">Expiring (0-30 Days)</Text>
            <Text className="text-xl font-extrabold text-gray-900">{counts['0_30_days']}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            className={`flex-1 min-w-[45%] p-3 rounded-xl border shadow-sm ${
              selectedBucket === '31_60' ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-100'
            }`}
            onPress={() => setSelectedBucket('31_60')}
          >
            <Text className="text-[10px] uppercase font-bold text-yellow-600 mb-1">Expiring (31-60 Days)</Text>
            <Text className="text-xl font-extrabold text-gray-900">{counts['31_60_days']}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            className={`flex-1 min-w-[45%] p-3 rounded-xl border shadow-sm ${
              selectedBucket === '61_90' ? 'bg-primary-50 border-primary-200' : 'bg-white border-gray-100'
            }`}
            onPress={() => setSelectedBucket('61_90')}
          >
            <Text className="text-[10px] uppercase font-bold text-primary-600 mb-1">Expiring (61-90 Days)</Text>
            <Text className="text-xl font-extrabold text-gray-900">{counts['61_90_days']}</Text>
          </TouchableOpacity>
        </View>

        {/* 2. Bulk Reminders triggering */}
        {membersList.length > 0 && (
          <Card className="mb-4 border border-primary-50">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-xs font-bold text-gray-800">Regional Reminders</Text>
                <Text className="text-[10px] text-gray-400 mt-0.5">Send bulk reminders to this bucket</Text>
              </View>
              {actionLoading === 'bulk-remind' ? (
                <ActivityIndicator size="small" color="#15803d" />
              ) : (
                <Button
                  title="Bulk Remind"
                  variant="primary"
                  size="sm"
                  onPress={handleBulkRemind}
                />
              )}
            </View>
          </Card>
        )}

        {/* 3. Members List Grid */}
        <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          Target Registry ({membersList.length})
        </Text>

        {listLoading ? (
          <ActivityIndicator size="small" color="#15803d" className="py-12" />
        ) : (
          <View className="gap-3">
            {membersList.map((m) => {
              const issuedAt = new Date(m.certificates.issued_at);
              const daysAgo = Math.floor((new Date().getTime() - issuedAt.getTime()) / (1000 * 60 * 60 * 24));
              const remainingDays = 365 - daysAgo;

              return (
                <Card key={m.id}>
                  <View className="flex-row justify-between items-start mb-2">
                    <View className="flex-1 pr-2">
                      <Text className="text-sm font-bold text-gray-900">{m.full_name}</Text>
                      <Text className="text-[10px] text-gray-500 font-mono mt-0.5">{m.membership_id}</Text>
                    </View>
                    <StatusBadge status={m.certificates.status === 'valid' && remainingDays < 0 ? 'expired' : 'active'} />
                  </View>

                  <View className="bg-gray-50 p-2 rounded-lg border border-gray-100 mb-3 gap-1">
                    <View className="flex-row justify-between">
                      <Text className="text-[10px] text-gray-400 font-medium">Issued Date</Text>
                      <Text className="text-[10px] text-gray-600 font-semibold">{formatDate(m.certificates.issued_at)}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-[10px] text-gray-400 font-medium">Expiration status</Text>
                      <Text className={`text-[10px] font-bold ${remainingDays < 0 ? 'text-red-600' : remainingDays < 30 ? 'text-orange-600' : 'text-green-600'}`}>
                        {remainingDays < 0 ? `Expired ${Math.abs(remainingDays)}d ago` : `Expires in ${remainingDays}d`}
                      </Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-[10px] text-gray-400 font-medium">Last Reminded</Text>
                      <Text className="text-[10px] text-gray-600 font-semibold">
                        {m.certificates.last_renewal_reminder_at ? formatDateTime(m.certificates.last_renewal_reminder_at) : 'Never'}
                      </Text>
                    </View>
                  </View>

                  {/* Operational actions */}
                  {actionLoading === m.id ? (
                    <ActivityIndicator size="small" color="#15803d" />
                  ) : (
                    <View className="flex-row flex-wrap gap-2 border-t border-gray-100/50 pt-2.5">
                      <Button
                        title="Renew Member"
                        variant="primary"
                        size="sm"
                        onPress={() => handleRenewMember(m.id)}
                      />
                      
                      {remainingDays < 0 && (
                        <Button
                          title="Suspend"
                          variant="destructive"
                          size="sm"
                          onPress={() => handleSuspendMember(m.id)}
                        />
                      )}
                    </View>
                  )}
                </Card>
              );
            })}

            {membersList.length === 0 && (
              <Text className="text-center text-gray-400 py-12">No members match this renewal category.</Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
