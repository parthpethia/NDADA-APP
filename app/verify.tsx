import { useState, useEffect } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Button, Input, Card, CardHeader, StatusBadge } from '@/components/ui';
import { CertificateVerification } from '@/types';
import { formatDateTime } from '@/lib/utils';
import { ShieldCheck, ShieldX, Search } from 'lucide-react-native';

export default function VerifyScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [certId, setCertId] = useState(id || '');
  const [result, setResult] = useState<CertificateVerification | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (id) handleVerify(id);
  }, [id]);

  const handleVerify = async (searchId?: string) => {
    const searchFor = searchId || certId.trim();
    if (!searchFor) return;

    setLoading(true);
    setNotFound(false);
    setResult(null);

    const { data, error } = await supabase
      .from('certificates')
      .select(`
        certificate_id,
        issued_at,
        status,
        members (
          full_name,
          membership_id
        )
      `)
      .eq('certificate_id', searchFor.toUpperCase())
      .single();

    setLoading(false);

    if (error || !data) {
      setNotFound(true);
      return;
    }

    const member = Array.isArray(data.members) ? data.members[0] : data.members;
    setResult({
      certificate_id: data.certificate_id,
      member_name: (member as any)?.full_name || 'Unknown',
      membership_id: (member as any)?.membership_id || 'Unknown',
      issued_at: data.issued_at,
      status: data.status,
    });
  };

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="flex-grow justify-center p-6">
      <View className="mx-auto w-full max-w-md">
        {/* Header */}
        <View className="mb-8 items-center">
          <Text className="text-3xl font-bold text-primary-800">NDADA</Text>
          <Text className="mt-1 text-gray-500">Certificate Verification</Text>
        </View>

        {/* Search */}
        <Card className="mb-6">
          <CardHeader title="Verify a Certificate" subtitle="Enter the Certificate ID to verify its authenticity" />
          <Input
            placeholder="CERT-2026-000001"
            value={certId}
            onChangeText={setCertId}
            autoCapitalize="characters"
          />
          <Button
            title="Verify"
            onPress={() => handleVerify()}
            loading={loading}
          />
        </Card>

        {/* Result */}
        {result && (
          <Card>
            <View className="items-center py-4">
              {result.status === 'valid' ? (
                <View className="mb-3 rounded-full bg-green-100 p-4">
                  <ShieldCheck size={48} color="#15803d" />
                </View>
              ) : (
                <View className="mb-3 rounded-full bg-red-100 p-4">
                  <ShieldX size={48} color="#dc2626" />
                </View>
              )}

              {result.status === 'valid' ? (
                <Text className="text-lg font-bold text-green-700">
                  Certificate is Valid
                </Text>
              ) : result.status === 'revoked' ? (
                <Text className="text-lg font-bold text-red-700">
                  Certificate Revoked by Authority
                </Text>
              ) : (
                <Text className="text-lg font-bold text-yellow-700">
                  Certificate Suspended
                </Text>
              )}
            </View>

            <View className="mt-2 border-t border-gray-100 pt-4">
              <View className="gap-3">
                <View className="flex-row justify-between">
                  <Text className="text-gray-500">Member Name</Text>
                  <Text className="font-medium text-gray-900">{result.member_name}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-gray-500">Membership ID</Text>
                  <Text className="font-medium text-gray-900">{result.membership_id}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-gray-500">Certificate ID</Text>
                  <Text className="font-medium text-gray-900">{result.certificate_id}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-gray-500">Issued</Text>
                  <Text className="font-medium text-gray-900">
                    {formatDateTime(result.issued_at)}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-gray-500">Status</Text>
                  <StatusBadge status={result.status} />
                </View>
              </View>
            </View>
          </Card>
        )}

        {/* Not Found */}
        {notFound && (
          <Card>
            <View className="items-center py-6">
              <View className="mb-3 rounded-full bg-gray-100 p-4">
                <Search size={48} color="#6b7280" />
              </View>
              <Text className="text-lg font-bold text-gray-700">
                Certificate Not Found
              </Text>
              <Text className="mt-1 text-center text-gray-500">
                No certificate matches the ID you entered. Please check and try again.
              </Text>
            </View>
          </Card>
        )}
      </View>
    </ScrollView>
  );
}
