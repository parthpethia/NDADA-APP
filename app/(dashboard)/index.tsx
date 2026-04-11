import { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, StatusBadge, Button, LoadingScreen, EmptyState } from '@/components/ui';
import { Firm, Certificate } from '@/types';
import {
  APP_NAME,
  MEMBERSHIP_AMOUNT,
  MEMBERSHIP_PLAN_NAME,
  MEMBERSHIP_VALIDITY_LABEL,
} from '@/constants';
import { formatCurrency } from '@/lib/utils';
import { getMembershipStage, getMembershipStageMeta } from '@/lib/membership';
import {
  Building2,
  CreditCard,
  Award,
  CheckCircle,
  Circle,
  FileText,
  ShoppingCart,
} from 'lucide-react-native';

export default function DashboardHome() {
  const { member, refreshMember, signOut, loading } = useAuth();
  const [firms, setFirms] = useState<Firm[]>([]);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    if (!member) return;
    const [firmsRes, certRes] = await Promise.all([
      supabase.from('firms').select('*').eq('member_id', member.id),
      supabase.from('certificates').select('*').eq('member_id', member.id).single(),
    ]);
    setFirms(firmsRes.data || []);
    setCertificate(certRes.data);
  };

  useEffect(() => {
    fetchData();
  }, [member]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshMember();
    await fetchData();
    setRefreshing(false);
  };

  if (loading) return <LoadingScreen message="Loading dashboard..." />;

  if (!member) {
    return (
      <EmptyState
        title="Dashboard is not ready"
        message="Your member profile is still being prepared. Pull to refresh or try again in a moment."
      >
        <View className="w-full gap-2">
          <Button title="Refresh" variant="outline" onPress={() => refreshMember()} />
          <Button title="Sign Out" variant="destructive" onPress={() => signOut()} />
        </View>
      </EmptyState>
    );
  }

  const hasFirms = firms.length > 0;
  const isPaid = member.payment_status === 'paid';
  const approvedFirms = firms.filter((f) => f.approval_status === 'approved');
  const hasCertificate = !!certificate;
  const stage = getMembershipStage(member, firms, certificate);
  const stageMeta = getMembershipStageMeta(stage);

  const currentStep =
    stage === 'application' ? 1 : stage === 'payment' ? 2 : stage === 'review' ? 3 : 4;

  const steps = [
    { label: 'Submit Application', icon: FileText, done: hasFirms },
    { label: 'Pay Registration Fee', icon: ShoppingCart, done: isPaid },
    { label: 'Approval Review', icon: CheckCircle, done: approvedFirms.length > 0 },
    { label: 'Get Certificate', icon: Award, done: hasCertificate },
  ];

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerClassName="p-4 pb-8"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Welcome Header */}
      <Text className="mb-1 text-2xl font-bold text-gray-900">
        Welcome, {member.full_name}
      </Text>
      <Text className="mb-5 text-sm text-gray-500">
        Membership ID: {member.membership_id}
      </Text>

      {/* Hero Card — Register Now CTA (shown when no firms registered yet) */}
      <Card className="mb-5 border-primary-100 bg-primary-50">
        <CardHeader title={stageMeta.title} subtitle={stageMeta.message} />
        <View className="flex-row flex-wrap gap-3">
          <View className="min-w-[140px] flex-1 rounded-xl bg-white px-4 py-3">
            <Text className="text-xs uppercase tracking-wide text-gray-500">Plan</Text>
            <Text className="mt-1 font-semibold text-gray-900">{MEMBERSHIP_PLAN_NAME}</Text>
          </View>
          <View className="min-w-[140px] flex-1 rounded-xl bg-white px-4 py-3">
            <Text className="text-xs uppercase tracking-wide text-gray-500">Fee</Text>
            <Text className="mt-1 font-semibold text-gray-900">{formatCurrency(MEMBERSHIP_AMOUNT)}</Text>
          </View>
          <View className="min-w-[140px] flex-1 rounded-xl bg-white px-4 py-3">
            <Text className="text-xs uppercase tracking-wide text-gray-500">Validity</Text>
            <Text className="mt-1 font-semibold text-gray-900">{MEMBERSHIP_VALIDITY_LABEL}</Text>
          </View>
        </View>
      </Card>

      {!hasFirms && (
        <Card className="mb-5 overflow-hidden border-primary-200 bg-primary-50">
          <View className="items-center py-4">
            <View className="mb-3 rounded-full bg-primary-100 p-4">
              <Building2 size={40} color="#1d4ed8" />
            </View>
            <Text className="mb-1 text-xl font-bold text-primary-900">
              Apply for {APP_NAME} membership
            </Text>
            <Text className="mb-5 max-w-[280px] text-center text-sm text-primary-700">
              Submit your firm profile, pay the registration fee, and unlock certificate issuance after approval.
            </Text>
            <Button title="Start Application" size="lg" onPress={() => router.push('/(dashboard)/firms/new')} />
          </View>
        </Card>
      )}

      {/* Progress Tracker */}
      <Card className="mb-5">
        <CardHeader title="Membership Progress" />
        <View className="gap-1">
          {steps.map((step, i) => {
            const isActive = i + 1 === currentStep;
            return (
              <View key={i} className="flex-row items-center gap-3 py-2">
                {step.done ? (
                  <CheckCircle size={22} color="#16a34a" />
                ) : isActive ? (
                  <View className="h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-primary-600">
                    <View className="h-2.5 w-2.5 rounded-full bg-primary-600" />
                  </View>
                ) : (
                  <Circle size={22} color="#d1d5db" />
                )}
                <Text
                  className={
                    step.done
                      ? 'flex-1 text-sm font-medium text-green-700 line-through'
                      : isActive
                        ? 'flex-1 text-sm font-semibold text-primary-700'
                        : 'flex-1 text-sm text-gray-400'
                  }
                >
                  {step.label}
                </Text>
                {step.done && (
                  <Text className="text-xs text-green-600">Done</Text>
                )}
              </View>
            );
          })}
        </View>
      </Card>

      {/* Action based on current step */}
      {hasFirms && !isPaid && (
        <Card className="mb-5 border-yellow-200 bg-yellow-50">
          <View className="items-center py-3">
            <View className="mb-2 rounded-full bg-yellow-100 p-3">
              <CreditCard size={32} color="#ca8a04" />
            </View>
            <Text className="mb-1 text-lg font-bold text-yellow-900">
              Complete Your Payment
            </Text>
            <Text className="mb-4 max-w-[260px] text-center text-sm text-yellow-700">
              Your application is saved. Pay {formatCurrency(MEMBERSHIP_AMOUNT)} to move your membership into review.
            </Text>
            <Button title="Go to Cart" size="lg" onPress={() => router.push('/cart')} />
          </View>
        </Card>
      )}

      {isPaid && approvedFirms.length === 0 && (
        <Card className="mb-5 border-blue-200 bg-blue-50">
          <View className="items-center py-3">
            <View className="mb-2 rounded-full bg-blue-100 p-3">
              <CheckCircle size={32} color="#2563eb" />
            </View>
            <Text className="mb-1 text-lg font-bold text-blue-900">
              Review in Progress
            </Text>
            <Text className="mb-4 max-w-[280px] text-center text-sm text-blue-700">
              Payment received. Your application is waiting for approval before the certificate is issued.
            </Text>
            <Button title="View Applications" size="lg" variant="outline" onPress={() => router.push('/(dashboard)/firms')} />
          </View>
        </Card>
      )}

      {isPaid && !hasCertificate && approvedFirms.length > 0 && (
        <Card className="mb-5 border-green-200 bg-green-50">
          <View className="items-center py-3">
            <View className="mb-2 rounded-full bg-green-100 p-3">
              <Award size={32} color="#16a34a" />
            </View>
            <Text className="mb-1 text-lg font-bold text-green-900">
              Get Your Certificate
            </Text>
            <Text className="mb-4 max-w-[260px] text-center text-sm text-green-700">
              Payment complete and application approved. Your membership certificate is ready to open.
            </Text>
            <Button title="View Certificate" size="lg" onPress={() => router.push('/(dashboard)/certificate')} />
          </View>
        </Card>
      )}

      {hasCertificate && (
        <Card className="mb-5 border-green-200 bg-green-50">
          <View className="items-center py-3">
            <View className="mb-2 rounded-full bg-green-100 p-3">
              <Award size={32} color="#16a34a" />
            </View>
            <Text className="mb-1 text-lg font-bold text-green-900">
              Membership Active
            </Text>
            <Text className="mb-4 text-center text-sm text-green-700">
              Your {APP_NAME} membership is fully active.
            </Text>
            <Button title="Download Certificate" variant="outline" onPress={() => router.push('/(dashboard)/certificate')} />
          </View>
        </Card>
      )}

      {/* Quick Stats */}
      <View className="flex-row flex-wrap gap-3">
        <Card className="min-w-[160px] flex-1">
          <View className="flex-row items-center gap-3">
            <View className="rounded-lg bg-blue-100 p-2">
              <Building2 size={20} color="#1d4ed8" />
            </View>
            <View>
              <Text className="text-2xl font-bold text-gray-900">{firms.length}</Text>
              <Text className="text-xs text-gray-500">Applications</Text>
            </View>
          </View>
        </Card>
        <Card className="min-w-[160px] flex-1">
          <View className="flex-row items-center gap-3">
            <View className="rounded-lg bg-green-100 p-2">
              <CreditCard size={20} color="#15803d" />
            </View>
            <View>
              <StatusBadge status={member.payment_status} />
              <Text className="mt-1 text-xs text-gray-500">Payment</Text>
            </View>
          </View>
        </Card>
      </View>

      {/* Your Firms List */}
      {firms.length > 0 && (
        <Card className="mt-4">
          <CardHeader
            title="Your Applications"
            right={
              <TouchableOpacity onPress={() => router.push('/(dashboard)/firms')}>
                <Text className="text-sm font-medium text-primary-700">View All</Text>
              </TouchableOpacity>
            }
          />
          {firms.slice(0, 3).map((firm) => (
            <View key={firm.id} className="flex-row items-center justify-between border-t border-gray-100 py-3">
              <View className="flex-1">
                <Text className="font-medium text-gray-900">{firm.firm_name}</Text>
                <Text className="text-xs text-gray-500">Lic: {firm.license_number}</Text>
              </View>
              <StatusBadge status={firm.approval_status} />
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}
