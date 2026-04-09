import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, Image } from 'react-native';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, Button, StatusBadge } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { confirm } from '@/lib/confirm';
import {
  MEMBERSHIP_AMOUNT,
  MEMBERSHIP_PLAN_NAME,
  MEMBERSHIP_VALIDITY_LABEL,
  MEMBERSHIP_SUPPORT_EMAIL,
  STORAGE_BUCKETS,
} from '@/constants';
import { CheckCircle, Clock, XCircle } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';

export default function PaymentScreen() {
  const { member, refreshMember } = useAuth();
  const [proofUploading, setProofUploading] = useState(false);
  const [hasSubmittedProof, setHasSubmittedProof] = useState(false);

  useEffect(() => {
    const fetchProofState = async () => {
      if (!member) return;
      const { data } = await supabase
        .from('payments')
        .select('id, proof_url, status')
        .eq('member_id', member.id)
        .order('created_at', { ascending: false })
        .limit(1);
      const latest = data?.[0];
      setHasSubmittedProof(Boolean(latest?.status === 'pending' && latest?.proof_url));
    };

    fetchProofState();
  }, [member?.id, member?.payment_status]);

  if (!member) return null;

  const handleUploadProof = async () => {
    if (!member) return;
    const ok = await confirm(
      'Payment Confirmation',
      'Are you sure the transaction is done? Only upload after successful payment.',
      { confirmText: 'Yes, Upload', destructive: true }
    );
    if (!ok) return;

    setProofUploading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        multiple: false,
      });

      if (result.canceled || !result.assets?.[0]) {
        setProofUploading(false);
        return;
      }

      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const safeName = (asset.name || 'payment-proof.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${member.id}/${Date.now()}_${safeName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKETS.paymentProofs)
        .upload(filePath, blob, { contentType: blob.type || 'image/jpeg' });

      if (uploadError) throw new Error(uploadError.message);

      const { error: insertError } = await supabase.from('payments').insert({
        member_id: member.id,
        amount: MEMBERSHIP_AMOUNT * 100,
        currency: 'inr',
        status: 'pending',
        proof_url: uploadData?.path,
      });
      if (insertError) throw new Error(insertError.message);

      // Move the most recent firm back to pending review (if needed)
      const { data: latestFirm } = await supabase
        .from('firms')
        .select('id, approval_status')
        .eq('member_id', member.id)
        .order('created_at', { ascending: false })
        .limit(1);

      const firmRow = latestFirm?.[0];
      if (firmRow?.id) {
        await supabase
          .from('firms')
          .update({ approval_status: 'pending', rejection_reason: null, reviewed_by: null, reviewed_at: null })
          .eq('id', firmRow.id);
      }

      await refreshMember();
      setHasSubmittedProof(true);
      Alert.alert('Submitted', 'Payment proof submitted. Admin will review and confirm payment.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to upload payment proof.');
    }
    setProofUploading(false);
  };

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="p-4 pb-8">
      <View className="mx-auto w-full max-w-lg">
        {/* Payment Status Card */}
        <Card className="mb-4">
          <View className="items-center py-4">
            {member.payment_status === 'paid' ? (
              <>
                <View className="mb-3 rounded-full bg-green-100 p-4">
                  <CheckCircle size={48} color="#15803d" />
                </View>
                <Text className="text-xl font-bold text-green-700">Payment Complete</Text>
                <Text className="mt-1 text-gray-500">
                  Your membership is active
                </Text>
              </>
            ) : member.payment_status === 'failed' ? (
              <>
                <View className="mb-3 rounded-full bg-red-100 p-4">
                  <XCircle size={48} color="#dc2626" />
                </View>
                <Text className="text-xl font-bold text-red-700">Payment Failed</Text>
                <Text className="mt-1 text-gray-500">
                  Please try again
                </Text>
              </>
            ) : hasSubmittedProof ? (
              <>
                <View className="mb-3 rounded-full bg-yellow-100 p-4">
                  <Clock size={48} color="#ca8a04" />
                </View>
                <Text className="text-xl font-bold text-gray-900">Payment Under Review</Text>
                <Text className="mt-1 text-gray-500">
                  Your proof is submitted. Admin will verify and approve.
                </Text>
              </>
            ) : (
              <>
                <View className="mb-3 rounded-full bg-yellow-100 p-4">
                  <Clock size={48} color="#ca8a04" />
                </View>
                <Text className="text-xl font-bold text-gray-900">Payment Pending</Text>
                <Text className="mt-1 text-gray-500">
                  Scan the QR and pay, then upload screenshot
                </Text>
              </>
            )}
          </View>
        </Card>

        {/* Membership Details */}
        <Card className="mb-4">
          <CardHeader title="Membership Details" />
          <View className="gap-2">
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Plan</Text>
              <Text className="font-medium text-gray-900">{MEMBERSHIP_PLAN_NAME}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Membership ID</Text>
              <Text className="font-medium text-gray-900">{member.membership_id}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Amount</Text>
              <Text className="font-medium text-gray-900">{formatCurrency(MEMBERSHIP_AMOUNT)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Validity</Text>
              <Text className="font-medium text-gray-900">{MEMBERSHIP_VALIDITY_LABEL}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-500">Status</Text>
              <StatusBadge status={member.payment_status} />
            </View>
          </View>
        </Card>

        <Card className="mb-4 border-blue-100 bg-blue-50">
          <CardHeader title="After Payment" subtitle="What happens next" />
          <View className="gap-2">
            <Text className="text-sm text-blue-800">1. Your payment is confirmed securely.</Text>
            <Text className="text-sm text-blue-800">2. Your firm application moves into review.</Text>
            <Text className="text-sm text-blue-800">3. Your certificate becomes available after approval.</Text>
            <Text className="pt-1 text-xs text-blue-700">
              Need help? Contact {MEMBERSHIP_SUPPORT_EMAIL}.
            </Text>
          </View>
        </Card>

        {/* QR + Proof upload */}
        {member.payment_status !== 'paid' && !hasSubmittedProof && (
          <Card className="mb-4">
            <CardHeader title="Pay via QR" subtitle="Scan and pay, then upload proof" />
            <View className="items-center gap-3">
              <View className="w-full items-center rounded-xl bg-gray-50 p-4">
                   <Image
                     source={require('../../assets/payment-qr.jpeg')}
                  style={{ width: 220, height: 220 }}
                  resizeMode="contain"
                />
              </View>
              <Button
                title="I have paid — Upload Screenshot"
                onPress={handleUploadProof}
                loading={proofUploading}
                size="lg"
                className="w-full"
              />
              <Text className="text-center text-xs text-gray-500">
                Only upload after successful payment. Admin will verify before approval.
              </Text>
            </View>
          </Card>
        )}
      </View>
    </ScrollView>
  );
}
