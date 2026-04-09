import { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card, Button, Badge } from '@/components/ui';
import { useAdmin } from '@/hooks/useAdmin';
import { FraudFlag } from '@/types';
import { formatDate } from '@/lib/utils';
import { AlertTriangle, CheckCircle } from 'lucide-react-native';

interface FraudFlagWithMember extends FraudFlag {
  member_name: string;
  member_email: string;
}

export default function AdminFraudScreen() {
  const { callAdminAction } = useAdmin();
  const [flags, setFlags] = useState<FraudFlagWithMember[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchFlags = async () => {
    let query = supabase
      .from('fraud_flags')
      .select('*, members(full_name, email)')
      .order('created_at', { ascending: false });

    if (!showResolved) {
      query = query.eq('resolved', false);
    }

    const { data } = await query.limit(50);
    setFlags(
      (data || []).map((f: any) => ({
        ...f,
        member_name: f.members?.full_name || 'Unknown',
        member_email: f.members?.email || '',
        members: undefined,
      }))
    );
  };

  useEffect(() => { fetchFlags(); }, [showResolved]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchFlags();
    setRefreshing(false);
  };

  const handleResolve = async (flagId: string) => {
    setActionLoading(flagId);
    try {
      await callAdminAction('resolve-fraud-flag', { flag_id: flagId });
      await fetchFlags();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
    setActionLoading(null);
  };

  const reasonLabels: Record<string, string> = {
    duplicate_phone: 'Duplicate Phone Number',
    duplicate_license: 'Duplicate License Number',
    duplicate_registration: 'Duplicate Registration Number',
    multiple_accounts_same_ip: 'Multiple Accounts from Same IP',
    repeated_failed_payments: 'Repeated Failed Payments',
  };

  return (
    <View className="flex-1 bg-gray-50">
      {/* Filter */}
      <View className="flex-row border-b border-gray-200 bg-white">
        <Text
          className={`flex-1 py-3 text-center text-sm font-medium ${!showResolved ? 'border-b-2 border-red-600 text-red-600' : 'text-gray-500'}`}
          onPress={() => setShowResolved(false)}
        >
          Unresolved
        </Text>
        <Text
          className={`flex-1 py-3 text-center text-sm font-medium ${showResolved ? 'border-b-2 border-red-600 text-red-600' : 'text-gray-500'}`}
          onPress={() => setShowResolved(true)}
        >
          All Flags
        </Text>
      </View>

      <ScrollView
        contentContainerClassName="p-4 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {flags.map((flag) => (
          <Card key={flag.id} className="mb-3">
            <View className="flex-row items-center gap-3">
              {flag.resolved ? (
                <View className="rounded-full bg-green-100 p-2">
                  <CheckCircle size={20} color="#15803d" />
                </View>
              ) : (
                <View className="rounded-full bg-red-100 p-2">
                  <AlertTriangle size={20} color="#dc2626" />
                </View>
              )}
              <View className="flex-1">
                <Text className="font-semibold text-gray-900">{flag.member_name}</Text>
                <Text className="text-xs text-gray-500">{flag.member_email}</Text>
              </View>
              <Badge
                label={flag.resolved ? 'Resolved' : 'Active'}
                variant={flag.resolved ? 'success' : 'error'}
              />
            </View>

            <View className="mt-3 rounded-lg bg-red-50 p-3">
              <Text className="text-sm font-medium text-red-800">
                {reasonLabels[flag.reason] || flag.reason}
              </Text>
              {flag.details && (
                <Text className="mt-1 text-xs text-red-600">{flag.details}</Text>
              )}
            </View>

            <Text className="mt-2 text-xs text-gray-400">{formatDate(flag.created_at)}</Text>

            {!flag.resolved && (
              <View className="mt-3 border-t border-gray-100 pt-3">
                <Button
                  title="Mark Resolved"
                  variant="outline"
                  size="sm"
                  onPress={() => handleResolve(flag.id)}
                  loading={actionLoading === flag.id}
                />
              </View>
            )}
          </Card>
        ))}

        {flags.length === 0 && (
          <Text className="py-12 text-center text-gray-500">
            {showResolved ? 'No fraud flags' : 'No unresolved flags'}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
