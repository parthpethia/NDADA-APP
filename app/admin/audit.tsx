import { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui';
import { AuditLog } from '@/types';
import { formatDateTime } from '@/lib/utils';
import { FileText } from 'lucide-react-native';

interface AuditLogWithAdmin extends AuditLog {
  admin_email: string;
}

const actionLabels: Record<string, { label: string; color: string }> = {
  firm_approved: { label: 'Firm Approved', color: 'text-green-700' },
  firm_rejected: { label: 'Firm Rejected', color: 'text-red-700' },
  account_suspended: { label: 'Account Suspended', color: 'text-red-700' },
  account_activated: { label: 'Account Activated', color: 'text-green-700' },
  account_deleted: { label: 'Account Deleted', color: 'text-red-700' },
  certificate_revoked: { label: 'Certificate Revoked', color: 'text-red-700' },
  certificate_regenerated: { label: 'Certificate Regenerated', color: 'text-blue-700' },
  payment_verified: { label: 'Payment Verified', color: 'text-green-700' },
  fraud_flag_resolved: { label: 'Fraud Flag Resolved', color: 'text-gray-700' },
};

export default function AdminAuditScreen() {
  const [logs, setLogs] = useState<AuditLogWithAdmin[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLogs = async () => {
    const { data } = await supabase
      .from('audit_logs')
      .select('*, admin:admin_id(email)')
      .order('created_at', { ascending: false })
      .limit(100);

    setLogs(
      (data || []).map((l: any) => ({
        ...l,
        admin_email: (l.admin as any)?.email || 'Unknown',
        admin: undefined,
      }))
    );
  };

  useEffect(() => { fetchLogs(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLogs();
    setRefreshing(false);
  };

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerClassName="p-4 pb-8"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text className="mb-4 text-xl font-bold text-gray-900">Audit Logs</Text>

      {logs.map((log) => {
        const actionInfo = actionLabels[log.action] || { label: log.action, color: 'text-gray-700' };
        return (
          <Card key={log.id} className="mb-2">
            <View className="flex-row items-center gap-3">
              <View className="rounded-lg bg-gray-100 p-2">
                <FileText size={16} color="#6b7280" />
              </View>
              <View className="flex-1">
                <Text className={`font-medium ${actionInfo.color}`}>
                  {actionInfo.label}
                </Text>
                <Text className="text-xs text-gray-500">
                  by {log.admin_email}
                </Text>
                {log.details && (
                  <Text className="mt-0.5 text-xs text-gray-400">{log.details}</Text>
                )}
              </View>
              <Text className="text-xs text-gray-400">
                {formatDateTime(log.created_at)}
              </Text>
            </View>
          </Card>
        );
      })}

      {logs.length === 0 && (
        <Text className="py-12 text-center text-gray-500">No audit logs yet</Text>
      )}
    </ScrollView>
  );
}
