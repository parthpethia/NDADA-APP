import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, Button, StatusBadge, LoadingScreen, EmptyState } from '@/components/ui';
import { Certificate } from '@/types';
import { formatDateTime } from '@/lib/utils';
import { APP_NAME, MEMBERSHIP_PLAN_NAME } from '@/constants';
import { Award } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Poll interval for checking certificate readiness (ms)
const POLL_INTERVAL = 3000;
// Maximum poll duration before giving up (ms)
const MAX_POLL_DURATION = 120000; // 2 minutes

type QueueStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed';

export default function CertificateScreen() {
  const { member, session } = useAuth();
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [queueStatus, setQueueStatus] = useState<QueueStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  // Check if a certificate exists in the DB
  const checkCertificate = useCallback(async (): Promise<Certificate | null> => {
    if (!member) return null;
    const { data } = await supabase
      .from('certificates')
      .select('id, member_id, certificate_id, certificate_url, status, issued_at')
      .eq('member_id', member.id)
      .maybeSingle();

    // Only treat it as a valid certificate if it has a URL and ID
    if (data && data.certificate_url && data.certificate_id) {
      return data as Certificate;
    }
    return null;
  }, [member]);

  // Check queue status for this member
  const checkQueueStatus = useCallback(async (): Promise<QueueStatus> => {
    if (!member) return 'idle';
    const { data } = await supabase
      .from('certificate_generation_queue')
      .select('status')
      .eq('account_id', member.id)
      .maybeSingle();

    if (!data) return 'idle';
    if (data.status === 'pending') return 'queued';
    if (data.status === 'processing') return 'processing';
    if (data.status === 'completed') return 'completed';
    if (data.status === 'failed') return 'failed';
    return 'idle';
  }, [member]);

  // Start polling for certificate readiness
  const startPolling = useCallback(() => {
    // Don't start if already polling
    if (pollTimerRef.current) return;

    pollStartRef.current = Date.now();
    setQueueStatus('queued');

    pollTimerRef.current = setInterval(async () => {
      // Check timeout
      if (Date.now() - pollStartRef.current > MAX_POLL_DURATION) {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        setQueueStatus('idle');
        setError('Certificate generation is taking longer than expected. Please check back later.');
        return;
      }

      // Check if certificate is ready
      const cert = await checkCertificate();
      if (cert) {
        setCertificate(cert);
        setQueueStatus('idle');
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        return;
      }

      // Update queue status for UI feedback
      const status = await checkQueueStatus();
      setQueueStatus(status === 'completed' ? 'processing' : status); // Completed in queue but no cert yet = still processing
      if (status === 'failed') {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        setError('Certificate generation failed. Please try again.');
      }
    }, POLL_INTERVAL);
  }, [checkCertificate, checkQueueStatus]);

  // Enqueue certificate generation
  const triggerGeneration = useCallback(async () => {
    if (!member) return;
    setError(null);
    setQueueStatus('queued');

    try {
      if (!session) {
        setError('You must be logged in.');
        setQueueStatus('idle');
        return;
      }

      // First try direct generation (handles idempotency — returns existing cert instantly)
      const { data, error: fnError } = await supabase.functions.invoke('generate-certificate', {
        body: { member_id: member.id },
      });

      if (fnError) {
        console.error('Certificate generation error:', fnError);
        // If rate-limited, the generation was queued — start polling
        if (fnError.message?.includes('429') || fnError.message?.includes('busy')) {
          startPolling();
          return;
        }
        setError(fnError.message || 'Failed to generate certificate. Please try again.');
        setQueueStatus('idle');
      } else if (data?.status === 'queued' || data?.retry_after) {
        // Server returned 429 — generation is queued, start polling
        startPolling();
      } else if (data?.error) {
        setError(data.error);
        setQueueStatus('idle');
      } else if (data?.certificate) {
        setCertificate(data.certificate);
        setQueueStatus('idle');
      } else {
        // Generation started but hasn't completed yet — poll
        startPolling();
      }
    } catch (err: any) {
      console.error('Certificate generation error:', err);
      setError(err.message || 'An unexpected error occurred.');
      setQueueStatus('idle');
    }
  }, [member, session, startPolling]);

  // Initial load — check for existing certificate or queue status
  const fetchCertificate = useCallback(async () => {
    if (!member) {
      setLoading(false);
      return;
    }

    // Check for existing certificate first
    const cert = await checkCertificate();
    if (cert) {
      setCertificate(cert);
      setLoading(false);
      return;
    }

    // No certificate — check if there's a pending/processing queue entry
    const status = await checkQueueStatus();
    if (status === 'queued' || status === 'processing') {
      setQueueStatus(status);
      setLoading(false);
      startPolling();
      return;
    }

    setCertificate(null);
    setLoading(false);
  }, [member, checkCertificate, checkQueueStatus, startPolling]);

  useEffect(() => {
    fetchCertificate();
  }, [fetchCertificate]);

  // Auto-trigger generation if eligible and no certificate exists
  // Certificate depends only on payment — no approval check needed
  useEffect(() => {
    if (
      !loading &&
      !certificate &&
      queueStatus === 'idle' &&
      !error &&
      member?.payment_status === 'paid'
    ) {
      triggerGeneration();
    }
  }, [loading, certificate, member, queueStatus, error, triggerGeneration]);

  const handleDownload = async () => {
    if (!certificate || !member) return;
    setDownloading(true);

    try {
      // Track download
      await supabase.from('certificate_downloads').insert({
        certificate_id: certificate.id,
        member_id: member.id,
      });

      // Get signed URL
      const { data: urlData } = await supabase.storage
        .from('certificates')
        .createSignedUrl(certificate.certificate_url, 60);

      if (!urlData?.signedUrl) {
        setDownloading(false);
        return;
      }

      if (Platform.OS === 'web') {
        window.open(urlData.signedUrl, '_blank');
      } else {
        const formattedId = member?.membership_id 
          ? `NDADA-MAH-NAG-${String(member.membership_id).padStart(4, '0')}` 
          : certificate.certificate_id;
        const outputFile = new FileSystem.File(
          FileSystem.Paths.document,
          `${formattedId}.pdf`
        );
        const downloadedFile = await FileSystem.File.downloadFileAsync(
          urlData.signedUrl,
          outputFile
        );
        await Sharing.shareAsync(downloadedFile.uri, { mimeType: 'application/pdf' });
      }
    } catch (err) {
      console.error('Download error:', err);
    }

    setDownloading(false);
  };

  if (loading) return <LoadingScreen />;

  // Generation in progress — show queue status
  if (queueStatus === 'queued' || queueStatus === 'processing') {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 p-8">
        <ActivityIndicator size="large" color="#15803d" />
        <Text className="mt-4 text-lg font-semibold text-gray-900">
          {queueStatus === 'queued'
            ? 'Certificate Queued...'
            : 'Generating Your Certificate...'}
        </Text>
        <Text className="mt-2 text-center text-sm text-gray-500">
          {queueStatus === 'queued'
            ? 'Your certificate is in the queue and will be generated shortly.'
            : 'Your certificate is being generated. This usually takes a few seconds.'}
        </Text>
        <Text className="mt-4 text-center text-xs text-gray-400">
          You can navigate away — your certificate will be ready when you return.
        </Text>
      </View>
    );
  }

  if (!certificate) {
    const isEligible = member?.payment_status === 'paid';

    return (
      <EmptyState
        title={error ? 'Certificate Generation Failed' : 'No Certificate Yet'}
        message={
          error
            ? error
            : member?.payment_status !== 'paid' && !member?.cash_payment_verified
            ? 'Complete your registration fee payment first.'
            : 'Your certificate is being prepared. Tap below to generate it now.'
        }
      >
        {isEligible && (
          <Button
            title={error ? 'Retry Generation' : 'Generate Certificate Now'}
            onPress={triggerGeneration}
            size="lg"
          />
        )}
      </EmptyState>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="p-4 pb-8">
      <View className="mx-auto w-full max-w-lg">
        <Card className="mb-4">
          <View className="items-center py-6">
            <View className="mb-4 rounded-full bg-primary-100 p-4">
              <Award size={48} color="#15803d" />
            </View>
            <Text className="text-xl font-bold text-gray-900">
              Certificate of Membership
            </Text>
            <Text className="mt-1 text-sm text-gray-500">
              {APP_NAME} | {MEMBERSHIP_PLAN_NAME}
            </Text>
            <View className="mt-3">
              <StatusBadge status={certificate.status} />
            </View>
          </View>
        </Card>

        <Card className="mb-4">
          <CardHeader title="Certificate Details" />
          <View className="gap-2">
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Certificate ID</Text>
              <Text className="font-medium text-gray-900">
                {member?.membership_id ? `NDADA/MAH/NAG/${String(member.membership_id).padStart(4, '0')}` : certificate.certificate_id}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Member</Text>
              <Text className="font-medium text-gray-900">{member?.full_name}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Membership ID</Text>
              <Text className="font-medium text-gray-900">{member?.membership_id}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Issued</Text>
              <Text className="font-medium text-gray-900">
                {formatDateTime(certificate.issued_at)}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Status</Text>
              <StatusBadge status={certificate.status} />
            </View>
          </View>
        </Card>

        {certificate.status === 'valid' && (
          <Button
            title="Download Certificate"
            onPress={handleDownload}
            loading={downloading}
            size="lg"
          />
        )}

        {certificate.status === 'revoked' && (
          <View className="rounded-lg bg-red-50 p-4">
            <Text className="text-center text-red-700">
              This certificate has been revoked by the authority.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
