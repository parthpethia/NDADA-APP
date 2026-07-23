import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, TextInput, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card, Button, Select } from '@/components/ui';
import { useAdmin } from '@/hooks/useAdmin';
import { confirm } from '@/lib/confirm';
import { formatDateTime } from '@/lib/utils';
import { Megaphone, Send, ShieldAlert, History, Users, Eye } from 'lucide-react-native';

interface CampaignHistoryRecord {
  id: string;
  title: string;
  message: string;
  target_type: string;
  target_value: string | null;
  recipient_count: number;
  created_at: string;
}

export default function AnnouncementCampaignScreen() {
  const { callAdminAction } = useAdmin();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recentCampaigns, setRecentCampaigns] = useState<CampaignHistoryRecord[]>([]);

  // Announcement Form States
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceMessage, setAnnounceMessage] = useState('');
  const [announceTarget, setAnnounceTarget] = useState<'all' | 'district'>('all');
  const [announceDistrict, setAnnounceDistrict] = useState('Nagpur');
  const [announceSending, setAnnounceSending] = useState(false);

  // Campaign Form States
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignMessage, setCampaignMessage] = useState('');
  const [campaignTarget, setCampaignTarget] = useState<'suspended' | 'expired_0_30' | 'expired_31_60' | 'expired_61_90' | 'expired'>('expired_0_30');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [campaignSending, setCampaignSending] = useState(false);

  const fetchCampaignHistory = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notification_campaigns')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setRecentCampaigns((data || []) as CampaignHistoryRecord[]);
    } catch (err: any) {
      Alert.alert('History Error', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaignHistory();
  }, [fetchCampaignHistory]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCampaignHistory();
    setRefreshing(false);
  };

  // Preview campaign audience size
  const handlePreviewAudience = async () => {
    setPreviewing(true);
    setPreviewCount(null);
    try {
      const result = await callAdminAction('preview-campaign', {
        target_type: campaignTarget
      });
      setPreviewCount(result?.recipient_count ?? 0);
    } catch (err: any) {
      Alert.alert('Preview Failed', err.message);
    } finally {
      setPreviewing(false);
    }
  };

  // Dispatch general announcement broadcast
  const handleSendAnnouncement = async () => {
    if (!announceTitle.trim() || !announceMessage.trim()) {
      Alert.alert('Input Error', 'Title and Message are required');
      return;
    }

    const ok = await confirm('Broadcast Announcement', 'Are you sure you want to broadcast this announcement? It will appear immediately in targeted member dashboards.', {
      confirmText: 'Broadcast'
    });
    if (!ok) return;

    setAnnounceSending(true);
    try {
      await callAdminAction('create-announcement', {
        title: announceTitle.trim(),
        message: announceMessage.trim(),
        target_type: announceTarget,
        target_value: announceTarget === 'district' ? announceDistrict : null
      });

      Alert.alert('Broadcast Successful', 'Your announcement has been broadcast successfully.');
      setAnnounceTitle('');
      setAnnounceMessage('');
      await fetchCampaignHistory();
    } catch (err: any) {
      Alert.alert('Broadcast Failed', err.message);
    } finally {
      setAnnounceSending(false);
    }
  };

  // Dispatch campaign
  const handleSendCampaign = async () => {
    if (!campaignTitle.trim() || !campaignMessage.trim()) {
      Alert.alert('Input Error', 'Title and message are required.');
      return;
    }

    const ok = await confirm('Send Notification Campaign', 'Are you sure you want to send this targeted notification campaign? Duplicate dispatches within 7 days are throttled.', {
      confirmText: 'Send Campaign'
    });
    if (!ok) return;

    setCampaignSending(true);
    try {
      const result = await callAdminAction('send-campaign', {
        target_type: campaignTarget,
        title: campaignTitle.trim(),
        message: campaignMessage.trim()
      });

      Alert.alert('Campaign Complete', result?.message || 'Campaign processed.');
      setCampaignTitle('');
      setCampaignMessage('');
      setPreviewCount(null);
      await fetchCampaignHistory();
    } catch (err: any) {
      Alert.alert('Campaign Failed', err.message);
    } finally {
      setCampaignSending(false);
    }
  };

  if (loading && recentCampaigns.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#15803d" />
        <Text className="mt-3 text-gray-500 font-medium">Opening Communication Center...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerClassName="p-4 pb-12"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text className="mb-4 text-xl font-bold text-gray-900">Communication & Campaigns</Text>

        {/* 1. Global Announcement Broadcaster */}
        <Card className="mb-4 border border-primary-50">
          <View className="flex-row items-center gap-2 border-b border-gray-100 pb-2 mb-3">
            <Megaphone size={16} color="#15803d" />
            <Text className="text-sm font-bold text-primary-900 uppercase">Broadcast General Announcement</Text>
          </View>

          <View className="gap-3">
            <View>
              <Text className="text-xs font-bold text-gray-500 mb-1.5">Announcement Title *</Text>
              <TextInput
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                placeholder="Important Announcement..."
                placeholderTextColor="#9ca3af"
                value={announceTitle}
                onChangeText={setAnnounceTitle}
              />
            </View>

            <View>
              <Text className="text-xs font-bold text-gray-500 mb-1.5">Broadcast Message *</Text>
              <TextInput
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                placeholder="Provide detailed announcement notes..."
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={3}
                value={announceMessage}
                onChangeText={setAnnounceMessage}
              />
            </View>

            <View className="flex-col sm:flex-row gap-2">
              <View className="flex-1">
                <Text className="text-xs font-bold text-gray-500 mb-1.5">Recipient Scope</Text>
                <Select
                  value={announceTarget}
                  options={[
                    { label: 'All Registered Members', value: 'all' },
                    { label: 'Specific Regional Zone', value: 'district' }
                  ]}
                  onValueChange={(val: any) => setAnnounceTarget(val)}
                />
              </View>

              {announceTarget === 'district' && (
                <View className="flex-1">
                  <Text className="text-xs font-bold text-gray-500 mb-1.5">District Zone</Text>
                  <Select
                    value={announceDistrict}
                    options={[
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
                    onValueChange={(val: any) => setAnnounceDistrict(val)}
                  />
                </View>
              )}
            </View>

            {announceSending ? (
              <ActivityIndicator size="small" color="#15803d" className="py-2" />
            ) : (
              <Button
                title="Broadcast Announcement"
                variant="primary"
                onPress={handleSendAnnouncement}
              />
            )}
          </View>
        </Card>

        {/* 2. Targeted Notification Campaigns */}
        <Card className="mb-4 border border-amber-50">
          <View className="flex-row items-center gap-2 border-b border-gray-100 pb-2 mb-3">
            <Send size={16} color="#d97706" />
            <Text className="text-sm font-bold text-amber-900 uppercase">Targeted Campaign Throttling</Text>
          </View>

          <View className="gap-3">
            <View className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex-row gap-2 items-start mb-1">
              <ShieldAlert size={16} color="#d97706" />
              <Text className="text-[10px] text-amber-800 leading-relaxed font-semibold flex-1">
                Reminders are throttled to a maximum of one reminder per member every 7 days. Audits will block duplicate sends.
              </Text>
            </View>

            <View>
              <Text className="text-xs font-bold text-gray-500 mb-1.5">Campaign Target Group *</Text>
              <Select
                value={campaignTarget}
                options={[
                  { label: 'Expiring memberships (0-30 days grace)', value: 'expired_0_30' },
                  { label: 'Expiring memberships (31-60 days grace)', value: 'expired_31_60' },
                  { label: 'Expiring memberships (61-90 days grace)', value: 'expired_61_90' },
                  { label: 'Expired memberships (> 365 days ago)', value: 'expired' },
                  { label: 'Suspended profiles', value: 'suspended' }
                ]}
                onValueChange={(val: any) => {
                  setCampaignTarget(val);
                  setPreviewCount(null);
                }}
              />
            </View>

            <View className="flex-row items-center gap-3 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
              <View className="flex-1">
                <Text className="text-[10px] uppercase font-bold text-gray-400">Audience preview size</Text>
                <Text className="text-lg font-extrabold text-gray-900">
                  {previewCount !== null ? `${previewCount} Members` : 'Not Queried'}
                </Text>
              </View>
              {previewing ? (
                <ActivityIndicator size="small" color="#15803d" />
              ) : (
                <Button
                  title="Check Count"
                  variant="outline"
                  size="sm"
                  onPress={handlePreviewAudience}
                />
              )}
            </View>

            <View>
              <Text className="text-xs font-bold text-gray-500 mb-1.5">Campaign Notification Title *</Text>
              <TextInput
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                placeholder="Membership Renewal Needed..."
                placeholderTextColor="#9ca3af"
                value={campaignTitle}
                onChangeText={setCampaignTitle}
              />
            </View>

            <View>
              <Text className="text-xs font-bold text-gray-500 mb-1.5">Campaign Message Body *</Text>
              <TextInput
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                placeholder="Alert text requesting quick action..."
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={3}
                value={campaignMessage}
                onChangeText={setCampaignMessage}
              />
            </View>

            {campaignSending ? (
              <ActivityIndicator size="small" color="#d97706" className="py-2" />
            ) : (
              <Button
                title="Dispatch Campaign"
                variant="primary"
                disabled={previewCount === 0}
                onPress={handleSendCampaign}
              />
            )}
          </View>
        </Card>

        {/* 3. Campaign History Registry */}
        <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Campaign Dispatch History</Text>
        <View className="gap-3">
          {recentCampaigns.map((c) => (
            <Card key={c.id}>
              <View className="flex-row justify-between items-start mb-2">
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-bold text-gray-900 uppercase">{c.title}</Text>
                  <Text className="text-[10px] text-gray-500 font-mono mt-0.5">Campaign ID: {c.id.slice(0, 18)}...</Text>
                </View>
                <View className="bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                  <Text className="text-[10px] font-bold text-gray-600">Sent: {c.recipient_count}</Text>
                </View>
              </View>

              <View className="bg-gray-50 p-2.5 rounded-lg border border-gray-100 mb-2">
                <Text className="text-xs text-gray-600 leading-relaxed font-semibold">{c.message}</Text>
              </View>

              <View className="flex-row justify-between border-t border-gray-100/50 pt-2 mt-1">
                <Text className="text-[10px] text-gray-400 font-bold uppercase">Target: {c.target_type}</Text>
                <Text className="text-[10px] text-gray-400">{formatDateTime(c.created_at)}</Text>
              </View>
            </Card>
          ))}

          {recentCampaigns.length === 0 && (
            <Text className="text-center text-gray-400 py-12">No campaigns dispatched yet.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
