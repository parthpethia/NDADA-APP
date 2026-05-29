import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, ActivityIndicator, TouchableOpacity, Linking } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card, Button, StatusBadge, Select } from '@/components/ui';
import { useAdmin } from '@/hooks/useAdmin';
import { confirm } from '@/lib/confirm';
import { formatDateTime } from '@/lib/utils';
import { 
  Download, Calendar, AlertTriangle, CheckCircle, 
  Trash2, RefreshCw, FileText, Filter, Clock 
} from 'lucide-react-native';

interface ExportJob {
  id: string;
  admin_id: string;
  export_type: 'members' | 'firms' | 'payments' | 'certificates' | 'audit_logs';
  filters: Record<string, any>;
  format: 'CSV' | 'XLSX';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  file_url: string | null;
  error_message: string | null;
  created_at: string;
  expires_at: string;
}

const getExpirationText = (expiresAtStr: string): { text: string; urgent: boolean; expired: boolean } => {
  const expiresAt = new Date(expiresAtStr).getTime();
  const now = new Date().getTime();
  const diff = expiresAt - now;

  if (diff <= 0) {
    return { text: 'Expired', urgent: true, expired: true };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days === 0) {
    return { text: `Expires in ${hours}h`, urgent: true, expired: false };
  }
  return { text: `Expires in ${days}d ${hours}h`, urgent: days <= 1, expired: false };
};

export default function ExportCenterScreen() {
  const { callAdminAction } = useAdmin();
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Form States
  const [exportType, setExportType] = useState<'members' | 'payments' | 'certificates' | 'audit_logs'>('members');
  const [format, setFormat] = useState<'CSV' | 'XLSX'>('CSV');
  const [filterDistrict, setFilterDistrict] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const [triggerLoading, setTriggerLoading] = useState(false);

  const fetchExportData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('export_jobs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setJobs((data || []) as ExportJob[]);
    } catch (err: any) {
      Alert.alert('Load Error', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Self-Healing Trigger: automatic purge of expired files on open
  const runSelfHealingCleanup = useCallback(async () => {
    try {
      await callAdminAction('cleanup-exports');
    } catch (e) {
      console.warn('Silently failed self-healing storage cleanup:', e);
    }
  }, [callAdminAction]);

  useEffect(() => {
    const initialize = async () => {
      await runSelfHealingCleanup();
      await fetchExportData();
    };
    initialize();
  }, [runSelfHealingCleanup, fetchExportData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchExportData();
    setRefreshing(false);
  };

  const handleGenerateExport = async () => {
    setTriggerLoading(true);
    try {
      const filters: Record<string, any> = {};
      if (filterDistrict !== 'all') filters.district = filterDistrict;
      
      if (filterStatus !== 'all') {
        if (exportType === 'members') filters.account_status = filterStatus;
        else if (exportType === 'payments' || exportType === 'certificates') filters.status = filterStatus;
      }

      await callAdminAction('generate-export', {
        type: exportType,
        format,
        filters
      });

      Alert.alert('Job Enqueued', 'Your background export compiler has started. Refresh the history in a few seconds.');
      await fetchExportData();
    } catch (err: any) {
      Alert.alert('Compilation Failed', err.message);
    } finally {
      setTriggerLoading(false);
    }
  };

  // Secure download trigger using private signed URL API
  const handleDownloadFile = async (jobId: string) => {
    try {
      const result = await callAdminAction('get-export-download', { job_id: jobId });
      if (result?.download_url) {
        Linking.openURL(result.download_url);
      } else {
        throw new Error('Download URL token expired or unreachable');
      }
    } catch (err: any) {
      Alert.alert('Download Error', err.message);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#1e3a8a" />
        <Text className="mt-3 text-gray-500 font-medium">Scanning Export Archives...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerClassName="p-4 pb-12"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text className="mb-4 text-xl font-bold text-gray-900">Export Center</Text>

        {/* Generate Export Configuration panel */}
        <Card className="mb-4 border border-blue-50">
          <View className="flex-row items-center gap-2 border-b border-gray-100 pb-2 mb-3">
            <Filter size={16} color="#1e3a8a" />
            <Text className="text-sm font-bold text-blue-900 uppercase">Export Configuration</Text>
          </View>

          <View className="gap-3">
            <View>
              <Text className="text-xs font-bold text-gray-500 mb-1.5">Category Target</Text>
              <Select
                value={exportType}
                options={[
                  { label: 'Members / Accounts', value: 'members' },
                  { label: 'Payments logs', value: 'payments' },
                  { label: 'Certificates issued', value: 'certificates' },
                  { label: 'Audit Logs trails', value: 'audit_logs' }
                ]}
                onValueChange={(val: any) => {
                  setExportType(val);
                  setFilterStatus('all');
                }}
              />
            </View>

            <View className="flex-row gap-2">
              <View className="flex-1">
                <Text className="text-xs font-bold text-gray-500 mb-1.5">Format</Text>
                <Select
                  value={format}
                  options={[
                    { label: 'CSV format', value: 'CSV' },
                    { label: 'XLSX Spreadsheet', value: 'XLSX' }
                  ]}
                  onValueChange={(val: any) => setFormat(val)}
                />
              </View>

              {exportType === 'members' && (
                <View className="flex-1">
                  <Text className="text-xs font-bold text-gray-500 mb-1.5">District Filter</Text>
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
                    onValueChange={(val: any) => setFilterDistrict(val)}
                  />
                </View>
              )}
            </View>

            {triggerLoading ? (
              <ActivityIndicator size="small" color="#1e3a8a" className="py-2" />
            ) : (
              <Button 
                title="Trigger Background Compile" 
                variant="primary" 
                onPress={handleGenerateExport}
              />
            )}
          </View>
        </Card>

        {/* History / Status queue panel */}
        <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Export Compilation logs</Text>
        
        <View className="gap-3">
          {jobs.map((job) => {
            const exp = getExpirationText(job.expires_at);

            return (
              <Card key={job.id}>
                <View className="flex-row justify-between items-start mb-2">
                  <View className="flex-1 pr-2">
                    <Text className="text-sm font-bold text-gray-900 uppercase">
                      {job.export_type.replace('_', ' ')} export
                    </Text>
                    <Text className="text-[10px] text-gray-400 font-mono mt-0.5">
                      Job ID: {job.id.slice(0, 18)}...
                    </Text>
                  </View>
                  <StatusBadge status={job.status} />
                </View>

                {/* Filters details */}
                <View className="bg-gray-50 p-2 rounded-lg border border-gray-100 mb-3 gap-1">
                  <View className="flex-row justify-between">
                    <Text className="text-[10px] text-gray-400 font-medium">Format</Text>
                    <Text className="text-[10px] text-gray-700 font-bold">{job.format}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-[10px] text-gray-400 font-medium">Compiled At</Text>
                    <Text className="text-[10px] text-gray-600 font-semibold">{formatDateTime(job.created_at)}</Text>
                  </View>
                  
                  {job.status === 'completed' && job.file_url && (
                    <View className="flex-row justify-between border-t border-gray-100 pt-1 mt-1">
                      <Text className="text-[10px] text-gray-400 font-medium">Retention status</Text>
                      <Text className={`text-[10px] font-bold ${exp.urgent ? 'text-red-500' : 'text-green-600'}`}>
                        {exp.text}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Download trigger actions */}
                {job.status === 'completed' && job.file_url ? (
                  <Button 
                    title="Download Export File" 
                    variant="primary" 
                    size="sm"
                    onPress={() => handleDownloadFile(job.id)}
                  />
                ) : job.status === 'failed' ? (
                  <View className="flex-row items-center gap-2 bg-red-50 p-2.5 rounded-lg border border-red-100">
                    <AlertTriangle size={14} color="#ef4444" />
                    <Text className="text-[10px] text-red-700 font-semibold flex-1">
                      {job.error_message || 'Compilation aborted by host.'}
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row items-center justify-center gap-2 py-2">
                    <ActivityIndicator size="small" color="#f59e0b" />
                    <Text className="text-xs font-semibold text-amber-500">Compiling Excel / CSV file...</Text>
                  </View>
                )}
              </Card>
            );
          })}

          {jobs.length === 0 && (
            <Text className="text-center text-gray-400 py-12">No exports triggered yet.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
