import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, Button, StatusBadge, LoadingScreen, EmptyState } from '@/components/ui';
import { Certificate } from '@/types';
import { formatDateTime } from '@/lib/utils';
import { APP_NAME, MEMBERSHIP_PLAN_NAME } from '@/constants';
import { Award } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export default function CertificateScreen() {
  const { member } = useAuth();
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchCertificate();
  }, [member]);

  const fetchCertificate = async () => {
    if (!member) return;
    const { data } = await supabase
      .from('certificates')
      .select('*')
      .eq('member_id', member.id)
      .maybeSingle();
    setCertificate(data ?? null);
    setLoading(false);
  };

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
        const outputFile = new FileSystem.File(
          FileSystem.Paths.document,
          `${certificate.certificate_id}.jpg`
        );
        const downloadedFile = await FileSystem.File.downloadFileAsync(
          urlData.signedUrl,
          outputFile
        );
        await Sharing.shareAsync(downloadedFile.uri, { mimeType: 'image/jpeg' });
      }
    } catch (err) {
      console.error('Download error:', err);
    }

    setDownloading(false);
  };

  if (loading) return <LoadingScreen />;

  if (!certificate) {
    return (
      <EmptyState
        title="No Certificate Yet"
        message={
          member?.payment_status !== 'paid'
            ? 'Complete your registration fee payment first.'
            : 'Your firm must be approved before a certificate is issued.'
        }
      />
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="p-4 pb-8">
      <View className="mx-auto w-full max-w-lg">
        <Card className="mb-4">
          <View className="items-center py-6">
            <View className="mb-4 rounded-full bg-primary-100 p-4">
              <Award size={48} color="#1d4ed8" />
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
              <Text className="font-medium text-gray-900">{certificate.certificate_id}</Text>
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
