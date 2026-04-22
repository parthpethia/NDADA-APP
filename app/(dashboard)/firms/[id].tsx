import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button, Card, CardHeader, EmptyState, LoadingScreen, StatusBadge } from '@/components/ui';
import { Account } from '@/types';
import { formatDate } from '@/lib/utils';
import { confirm } from '@/lib/confirm';

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

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View className="border-t border-gray-100 py-3">
      <Text className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</Text>
      <Text className="mt-1 text-sm text-gray-900">{value && value.trim() ? value : 'Not provided'}</Text>
    </View>
  );
}

export default function FirmDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { member } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const fetchAccount = async () => {
    if (!member?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', member.id)
      .single();

    if (error) {
      Alert.alert('Error', error.message);
      router.back();
      return;
    }

    setAccount(data ?? null);
    setLoading(false);
  };

  useEffect(() => {
    fetchAccount();
  }, [member?.id]);

  const handleDelete = async () => {
    if (!account) return;

    const ok = await confirm(
      'Delete Firm',
      `Delete ${account.firm_name}? This will remove the submitted firm record from your account.`,
      { destructive: true, confirmText: 'Delete' }
    );
    if (!ok) return;

    setDeleting(true);
    const { error } = await supabase
      .from('accounts')
      .update({
        firm_name: '',
        firm_type: 'other',
        license_number: '',
        registration_number: '',
        approval_status: 'pending',
      })
      .eq('id', account.id);

    setDeleting(false);

    if (error) {
      showAlert('Error', error.message);
      return;
    }

    router.replace('/(dashboard)/firms');
  };

  if (loading) return <LoadingScreen message="Loading firm details..." />;

  if (!account) {
    return (
      <EmptyState
        title="Firm not found"
        message="This firm could not be loaded or may already have been deleted."
      >
        <Button title="Back to Firms" onPress={() => router.replace('/(dashboard)/firms')} />
      </EmptyState>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="p-4 pb-8">
      <Card className="mb-4">
        <CardHeader
          title={account.firm_name}
          subtitle={`Submitted on ${formatDate(account.created_at)}`}
          right={<StatusBadge status={account.approval_status} />}
        />
        <DetailRow label="Firm Type" value={account.firm_type.replace('_', ' ')} />
        <DetailRow label="Firm Address" value={account.firm_address} />
        <DetailRow label="Firm PIN Code" value={account.firm_pin_code} />
        <DetailRow label="GST Number" value={account.gst_number} />
      </Card>

      <Card className="mb-4">
        <CardHeader
          title="Personal and Contact"
          subtitle="Details submitted in the membership form"
        />
        <DetailRow label="Partner or Proprietor Name" value={account.partner_proprietor_name} />
        <DetailRow label="Mobile Number" value={account.contact_phone} />
        <DetailRow label="WhatsApp Number" value={account.whatsapp_number} />
        <DetailRow label="Email ID" value={account.contact_email} />
        <DetailRow label="Aadhaar Card Number" value={account.aadhaar_card_number} />
        <DetailRow label="Residence Address" value={account.residence_address} />
        <DetailRow label="Residence PIN Code" value={account.residence_pin_code} />
      </Card>

      <Card className="mb-4">
        <CardHeader
          title="Registration and Licenses"
          subtitle="Business identifiers and submitted license details"
        />
        <DetailRow label="IFMS Number" value={account.ifms_number || account.registration_number} />
        <DetailRow label="Seed Cotton License Number" value={account.seed_cotton_license_number || account.license_number} />
        <DetailRow label="Seed Cotton License Expiry" value={account.seed_cotton_license_expiry} />
        <DetailRow label="Sarthi ID Cotton" value={account.sarthi_id_cotton} />
        <DetailRow label="Seed General License Number" value={account.seed_general_license_number} />
        <DetailRow label="Seed General License Expiry" value={account.seed_general_license_expiry} />
        <DetailRow label="Sarthi ID General" value={account.sarthi_id_general} />
        <DetailRow label="Pesticide License Number" value={account.pesticide_license_number} />
        <DetailRow label="Pesticide License Expiry" value={account.pesticide_license_expiry} />
        <DetailRow label="Fertilizer License Number" value={account.fertilizer_license_number} />
        <DetailRow label="Fertilizer License Expiry" value={account.fertilizer_license_expiry} />
      </Card>

      <Card className="mb-4">
        <CardHeader title="Uploads" subtitle="Files attached to this form" />
        <DetailRow
          label="Applicant Photo"
          value={account.applicant_photo_url ? 'Uploaded' : 'Not uploaded'}
        />
        <DetailRow
          label="Supporting Documents"
          value={account.documents_urls.length ? `${account.documents_urls.length} file(s) uploaded` : 'No documents uploaded'}
        />
        {account.documents_urls.map((documentPath, index) => (
          <View key={documentPath} className="border-t border-gray-100 py-3">
            <Text className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Document {index + 1}
            </Text>
            <Text className="mt-1 text-sm text-gray-900">{documentPath}</Text>
          </View>
        ))}
      </Card>

      {account.approval_status === 'rejected' && account.rejection_reason && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <CardHeader title="Rejection Reason" />
          <Text className="text-sm text-red-700">{account.rejection_reason}</Text>
        </Card>
      )}

      <Button
        title="Delete Firm"
        variant="destructive"
        loading={deleting}
        onPress={handleDelete}
      />
    </ScrollView>
  );
}