import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card, Button, StatusBadge, Badge } from '@/components/ui';
import { useAdmin } from '@/hooks/useAdmin';
import { confirm } from '@/lib/confirm';
import { formatDateTime } from '@/lib/utils';
import { 
  Award, Play, XCircle, RotateCcw, Activity, 
  Clock, AlertTriangle, CheckCircle, ShieldAlert 
} from 'lucide-react-native';

interface QueueJob {
  id: string;
  account_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
  processing_started_at: string | null;
  completed_at: string | null;
  retry_count: number;
  accounts: {
    full_name: string;
    membership_id: string;
  } | null;
}

export default function CertificateQueueScreen() {
  const { callAdminAction, role } = useAdmin();
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Statistics
  const [pendingCount, setPendingCount] = useState(0);
  const [processingCount, setProcessingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [avgProcessingTime, setAvgProcessingTime] = useState<string>('N/A');
  const [avgProcessingTimeSec, setAvgProcessingTimeSec] = useState<number>(0);

  const fetchQueueData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Queue jobs
      const { data, error } = await supabase
        .from('certificate_generation_queue')
        .select('*, accounts(full_name, membership_id)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const jobList = (data || []) as QueueJob[];
      setJobs(jobList);

      // 2. Aggregate stats
      let p = 0, pr = 0, c = 0, f = 0;
      let totalMs = 0;
      let calculatedCount = 0;

      jobList.forEach(j => {
        if (j.status === 'pending') p++;
        else if (j.status === 'processing') pr++;
        else if (j.status === 'completed') c++;
        else if (j.status === 'failed') f++;

        if (j.processing_started_at && j.completed_at && j.status === 'completed') {
          const duration = new Date(j.completed_at).getTime() - new Date(j.processing_started_at).getTime();
          totalMs += duration;
          calculatedCount++;
        }
      });

      setPendingCount(p);
      setProcessingCount(pr);
      setCompletedCount(c);
      setFailedCount(f);

      if (calculatedCount > 0) {
        const avgSec = totalMs / calculatedCount / 1000;
        setAvgProcessingTimeSec(avgSec);
        setAvgProcessingTime(`${avgSec.toFixed(1)}s`);
      } else {
        setAvgProcessingTimeSec(0);
        setAvgProcessingTime('N/A');
      }

    } catch (err: any) {
      Alert.alert('Error loading queue', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueueData();
  }, [fetchQueueData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchQueueData();
    setRefreshing(false);
  };

  const handleQueueAction = async (jobId: string, jobAction: 'retry' | 'requeue' | 'cancel' | 'force', label: string) => {
    const ok = await confirm('Confirm Queue Action', `Are you sure you want to ${label}?`, {
      confirmText: 'Execute',
      destructive: jobAction === 'cancel',
    });
    if (!ok) return;

    setActionLoading(jobId);
    try {
      await callAdminAction('queue-job-action', { job_id: jobId, job_action: jobAction });
      Alert.alert('Success', `Action "${label}" executed.`);
      await fetchQueueData();
    } catch (err: any) {
      Alert.alert('Action Failed', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#15803d" />
        <Text className="mt-3 text-gray-500 font-medium">Scanning Pipeline...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerClassName="p-4 pb-12"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text className="mb-4 text-xl font-bold text-gray-900">Certificate Generation Queue</Text>

        {/* System Health Warning Threshold Banners */}
        {(failedCount > 10 || avgProcessingTimeSec > 60 || pendingCount > 100) && (
          <Card className="mb-4 border border-red-200 bg-red-50 p-3">
            <View className="flex-row items-center gap-2 mb-2">
              <ShieldAlert size={18} color="#ef4444" />
              <Text className="text-sm font-bold text-red-800 uppercase tracking-wider">Queue Health Warning Alert</Text>
            </View>
            <View className="gap-1.5 pl-6">
              {failedCount > 10 && (
                <Text className="text-xs text-red-700 font-semibold">• High Failure Rate: {failedCount} failed jobs today (Threshold: 10). Please investigate logs below.</Text>
              )}
              {avgProcessingTimeSec > 60 && (
                <Text className="text-xs text-red-700 font-semibold">• High Latency Alert: Average compile time is {avgProcessingTimeSec.toFixed(1)}s (Threshold: 60s). High server workload.</Text>
              )}
              {pendingCount > 100 && (
                <Text className="text-xs text-red-700 font-semibold">• Queue Backlog Warning: Queue depth is {pendingCount} jobs (Threshold: 100). Background generation is lagging.</Text>
              )}
            </View>
          </Card>
        )}

        {/* Aggregated Statistics Panel */}
        <View className="flex-row flex-wrap gap-2 mb-4">
          <View className="flex-1 min-w-[45%] bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-[10px] uppercase font-bold text-gray-400">Avg Compile Time</Text>
              <Clock size={14} color="#6b7280" />
            </View>
            <Text className="text-lg font-extrabold text-gray-900">{avgProcessingTime}</Text>
          </View>

          <View className="flex-1 min-w-[45%] bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-[10px] uppercase font-bold text-gray-400">Pending Queue</Text>
              <Activity size={14} color="#16a34a" />
            </View>
            <Text className="text-lg font-extrabold text-primary-600">{pendingCount}</Text>
          </View>

          <View className="flex-1 min-w-[45%] bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-[10px] uppercase font-bold text-gray-400">Processing Rate</Text>
              <Play size={14} color="#f59e0b" />
            </View>
            <Text className="text-lg font-extrabold text-amber-500">{processingCount}</Text>
          </View>

          <View className="flex-1 min-w-[45%] bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-[10px] uppercase font-bold text-gray-400">Failures Today</Text>
              <AlertTriangle size={14} color="#ef4444" />
            </View>
            <Text className="text-lg font-extrabold text-red-500">{failedCount}</Text>
          </View>
        </View>

        {/* Recent Failures Panel */}
        {failedCount > 0 && (
          <Card className="mb-4 border border-red-100 bg-red-50/20">
            <View className="flex-row items-center gap-2 mb-2">
              <ShieldAlert size={16} color="#ef4444" />
              <Text className="text-xs font-bold text-red-800 uppercase tracking-wider">Recent failure logs console</Text>
            </View>
            <ScrollView className="max-h-[120] bg-gray-900 rounded-lg p-2.5">
              {jobs.filter(j => j.status === 'failed').slice(0, 5).map((job) => (
                <View key={job.id} className="mb-2 border-b border-gray-800 pb-1.5">
                  <Text className="text-[10px] font-bold text-red-400">
                    Job ID: {job.id} | Account: {job.accounts?.full_name || 'N/A'}
                  </Text>
                  <Text className="text-[10px] text-gray-300 leading-relaxed font-mono">
                    {job.error_message || 'Pipeline aborted without log details'}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </Card>
        )}

        {/* Data Grid list of queue items */}
        <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Active Registry Jobs</Text>
        
        <View className="gap-3">
          {jobs.map((job) => (
            <Card key={job.id}>
              <View className="flex-row justify-between items-start mb-2">
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-bold text-gray-900">
                    {job.accounts?.full_name || 'Legacy Account'}
                  </Text>
                  <Text className="text-[10px] font-semibold text-gray-500">
                    {job.accounts?.membership_id || 'ID N/A'}
                  </Text>
                </View>
                <View className="items-end gap-1">
                  <StatusBadge status={job.status} />
                  <Badge label={`Retries: ${job.retry_count}`} variant={job.retry_count > 0 ? 'warning' : 'default'} />
                </View>
              </View>

              <View className="gap-1 border-t border-gray-100 pt-2 mb-3">
                <View className="flex-row justify-between">
                  <Text className="text-[10px] text-gray-400 font-medium">Job Enqueued</Text>
                  <Text className="text-[10px] text-gray-600 font-semibold">{formatDateTime(job.created_at)}</Text>
                </View>
                {job.processing_started_at && (
                  <View className="flex-row justify-between">
                    <Text className="text-[10px] text-gray-400 font-medium">Processing Start</Text>
                    <Text className="text-[10px] text-gray-600 font-semibold">{formatDateTime(job.processing_started_at)}</Text>
                  </View>
                )}
                {job.completed_at && (
                  <View className="flex-row justify-between">
                    <Text className="text-[10px] text-gray-400 font-medium">Lifecycle Complete</Text>
                    <Text className="text-[10px] text-gray-600 font-semibold">{formatDateTime(job.completed_at)}</Text>
                  </View>
                )}
              </View>

              {/* Actions panel */}
              {actionLoading === job.id ? (
                <ActivityIndicator size="small" color="#15803d" />
              ) : (
                <View className="flex-row flex-wrap gap-2 border-t border-gray-100/50 pt-2.5">
                  {job.status === 'failed' && (
                    <Button 
                      title="Retry" 
                      variant="primary" 
                      size="sm"
                      onPress={() => handleQueueAction(job.id, 'retry', 'retry failed job')}
                    />
                  )}
                  
                  {['failed', 'processing', 'completed'].includes(job.status) && (
                    <Button 
                      title="Requeue" 
                      variant="outline" 
                      size="sm"
                      onPress={() => handleQueueAction(job.id, 'requeue', 'requeue job')}
                    />
                  )}

                  {['pending', 'processing'].includes(job.status) && (
                    <Button 
                      title="Cancel" 
                      variant="destructive" 
                      size="sm"
                      onPress={() => handleQueueAction(job.id, 'cancel', 'cancel job')}
                    />
                  )}

                  {role === 'super_admin' && (
                    <Button 
                      title="Force Run" 
                      variant="primary" 
                      size="sm"
                      onPress={() => handleQueueAction(job.id, 'force', 'force process immediately')}
                    />
                  )}
                </View>
              )}
            </Card>
          ))}

          {jobs.length === 0 && (
            <Text className="text-center text-gray-400 py-12">No jobs enqueued.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
