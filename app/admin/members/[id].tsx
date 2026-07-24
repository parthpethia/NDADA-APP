import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, TextInput, Alert, TouchableOpacity, Linking, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Card, Button, Badge, StatusBadge, Select } from '@/components/ui';
import { useAdmin } from '@/hooks/useAdmin';
import { confirm } from '@/lib/confirm';
import { Account, Payment, Certificate, AdminUser } from '@/types';
import { formatDate, formatDateTime } from '@/lib/utils';
import { maskAadhaar } from '@/lib/aadhaar';
import { 
  User, Building2, CreditCard, Award, FileText, Clock, 
  ArrowLeft, Send, CheckCircle, XCircle, 
  UserCheck, AlertTriangle, Play, Edit2, Trash2
} from 'lucide-react-native';

// Local UI Types
interface ExtendedNote {
  id: string;
  note: string;
  created_at: string;
  admin_id: string;
  admin_email: string;
  admin_role: string;
}

export default function Member360Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { callAdminAction, role } = useAdmin();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'payments' | 'certificates' | 'timeline' | 'audit'>('profile');
  
  // Data State
  const [member, setMember] = useState<Account | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [notes, setNotes] = useState<ExtendedNote[]>([]);
  const [assignment, setAssignment] = useState<any>(null);
  const [reviewers, setReviewers] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Action states
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  
  // Extra metrics
  const [lastLogin, setLastLogin] = useState<string | null>(null);
  const [lastActivity, setLastActivity] = useState<string | null>(null);
  const [lastPaymentAttempt, setLastPaymentAttempt] = useState<string | null>(null);
  const [lastCertDownload, setLastCertDownload] = useState<string | null>(null);

  const fetch360Data = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // 1. Fetch Member Account Details
      const { data: memberData, error: memberErr } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', id)
        .single();

      if (memberErr || !memberData) {
        throw new Error(memberErr?.message || 'Member account not found');
      }
      setMember(memberData as Account);

      // 2. Fetch Payments History
      const { data: payData } = await supabase
        .from('payments')
        .select('*')
        .eq('member_id', id)
        .order('created_at', { ascending: false });
      setPayments((payData || []) as Payment[]);

      // 3. Fetch Certificates History
      const { data: certData } = await supabase
        .from('certificates')
        .select('*')
        .eq('member_id', id)
        .order('issued_at', { ascending: false });
      setCertificates((certData || []) as Certificate[]);

      // 4. Fetch Active Internal Notes (soft-delete filtered automatically by RLS)
      const { data: noteData } = await supabase
        .from('admin_notes')
        .select('*, admin_users(email, role)')
        .eq('member_id', id)
        .order('created_at', { ascending: false });

      setNotes(
        (noteData || []).map((n: any) => ({
          id: n.id,
          note: n.note,
          created_at: n.created_at,
          admin_id: n.admin_id,
          admin_email: n.admin_users?.email || 'System',
          admin_role: n.admin_users?.role || 'admin',
        }))
      );

      // 5. Fetch Review Assignment
      const { data: assignData } = await supabase
        .from('review_assignments')
        .select('*, admin_users(email, role)')
        .eq('account_id', id)
        .maybeSingle();
      setAssignment(assignData);

      // 6. Fetch Reviewers List (admins & reviewers available for assignments)
      const { data: revList } = await supabase
        .from('admin_users')
        .select('*')
        .order('email', { ascending: true });
      setReviewers(revList || []);

      // 7. Fetch Audit Logs Related to Target Member
      const { data: auditData } = await supabase
        .from('audit_logs')
        .select('*, admin_users(email)')
        .eq('target_user', memberData.user_id)
        .order('created_at', { ascending: false });
      setAuditLogs(auditData || []);

      // 8. Fetch Last Login and Metadata from Auth Users through Edge RPC
      const { data: userProfile } = await supabase.rpc('get_user_profile', { p_user_id: memberData.user_id });
      if (userProfile?.auth_user) {
        setLastLogin(userProfile.auth_user.last_sign_in_at || null);
        setLastActivity(userProfile.auth_user.updated_at || null);
      }

      // 9. Fetch Last Payment Attempt
      if (payData && payData.length > 0) {
        setLastPaymentAttempt(payData[0].created_at);
      }

      // 10. Fetch Last Certificate Download
      const { data: downloadData } = await supabase
        .from('certificate_downloads')
        .select('downloaded_at')
        .eq('member_id', id)
        .order('downloaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (downloadData) {
        setLastCertDownload(downloadData.downloaded_at);
      }

    } catch (err: any) {
      Alert.alert('Error loading profile', err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const handleViewFile = async (path: string, bucket: string, trackCert?: Certificate) => {
    if (!path) return;
    
    // If it's already a full HTTP URL, open it directly
    if (path.startsWith('http://') || path.startsWith('https://')) {
      try {
        await Linking.openURL(path);
      } catch (err: any) {
        Alert.alert('Error opening link', err.message || 'Failed to open link');
      }
      return;
    }

    setDownloadingFile(path);
    try {
      const { data: urlData, error: urlError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60);

      if (urlError || !urlData?.signedUrl) {
        throw new Error(urlError?.message || 'Could not generate signed URL.');
      }

      if (trackCert) {
        // Track certificate download
        await supabase.from('certificate_downloads').insert({
          certificate_id: trackCert.id,
          member_id: trackCert.member_id,
        });
        
        // Update last certificate download timestamp in local state
        setLastCertDownload(new Date().toISOString());
      }

      await Linking.openURL(urlData.signedUrl);
    } catch (err: any) {
      Alert.alert('Error opening file', err.message || 'Failed to open file');
    } finally {
      setDownloadingFile(null);
    }
  };

  useEffect(() => {
    fetch360Data();
  }, [fetch360Data]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetch360Data();
    setRefreshing(false);
  };

  // Quick Action Handler
  const handleQuickAction = async (actionName: string, payload: Record<string, any>, label: string) => {
    const ok = await confirm('Confirm Action', `Are you sure you want to ${label}?`, {
      confirmText: 'Execute',
      destructive: actionName.includes('reject') || actionName.includes('suspend') || actionName.includes('revoke'),
    });
    if (!ok) return;

    setActionLoading(true);
    try {
      await callAdminAction(actionName, { account_id: id, ...payload });
      Alert.alert('Success', `Action "${label}" executed.`);
      await fetch360Data();
    } catch (err: any) {
      Alert.alert('Action Failed', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Notes Handler
  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setActionLoading(true);
    try {
      await callAdminAction('add-note', { member_id: id, note: newNote.trim() });
      setNewNote('');
      await fetch360Data();
    } catch (err: any) {
      Alert.alert('Note Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditNote = async (noteId: string) => {
    if (!editingNoteText.trim()) return;
    setActionLoading(true);
    try {
      await callAdminAction('edit-note', { note_id: noteId, note: editingNoteText.trim() });
      setEditingNoteId(null);
      setEditingNoteText('');
      await fetch360Data();
    } catch (err: any) {
      Alert.alert('Note Edit Failed', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    const ok = await confirm('Delete Note', 'Are you sure you want to delete this internal note? (This utilizes a secure soft-delete cleanup)', {
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    setActionLoading(true);
    try {
      await callAdminAction('delete-note', { note_id: noteId });
      await fetch360Data();
    } catch (err: any) {
      Alert.alert('Delete Failed', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Reviewer Assignments
  const handleAssignReviewer = async (reviewerId: string) => {
    setActionLoading(true);
    try {
      if (reviewerId === 'unassigned') {
        await callAdminAction('unassign-reviewer', { account_id: id });
        Alert.alert('Success', 'Review assignment removed');
      } else {
        await callAdminAction('assign-reviewer', { account_id: id, reviewer_id: reviewerId });
        Alert.alert('Success', 'Reviewer assigned');
      }
      await fetch360Data();
    } catch (err: any) {
      Alert.alert('Assignment Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#15803d" />
        <Text className="mt-3 text-gray-500 font-medium">Compiling Member 360°...</Text>
      </View>
    );
  }

  if (!member) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 p-4">
        <XCircle size={48} color="#ef4444" />
        <Text className="mt-3 text-lg font-bold text-gray-900">Profile Not Found</Text>
        <Button title="Back to Dashboard" className="mt-4" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Dynamic Header */}
      <View className="bg-primary-900 px-4 pb-4 pt-3">
        <TouchableOpacity className="mb-2 flex-row items-center" onPress={() => router.back()}>
          <ArrowLeft size={16} color="#fff" />
          <Text className="ml-2 font-medium text-white">Back to Portal</Text>
        </TouchableOpacity>
        
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-2">
            <Text className="text-xl font-bold text-white">{member.full_name}</Text>
            <Text className="text-[13px] font-semibold text-primary-200">{member.membership_id || 'ID Pending'}</Text>
          </View>
          <View className="items-end gap-1">
            <StatusBadge status={member.account_status} />
            <View className="flex-row gap-1">
              <Badge label={member.approval_status} variant={member.approval_status === 'approved' ? 'success' : member.approval_status === 'rejected' ? 'error' : 'warning'} />
              <Badge label={member.payment_status} variant={member.payment_status === 'paid' ? 'success' : 'warning'} />
            </View>
          </View>
        </View>
      </View>

      {/* Navigation Tab bar */}
      <View className="flex-row border-b border-gray-200 bg-white">
        {(['profile', 'payments', 'certificates', 'timeline', 'audit'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            className={`flex-1 items-center py-3 border-b-2 ${
              activeTab === tab ? 'border-primary-900' : 'border-transparent'
            }`}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              className={`text-xs font-semibold uppercase ${
                activeTab === tab ? 'text-primary-900' : 'text-gray-400'
              }`}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-12"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {actionLoading && (
          <View className="mb-4 flex-row items-center justify-center rounded-lg bg-primary-50 p-3">
            <ActivityIndicator size="small" color="#15803d" />
            <Text className="ml-3 font-semibold text-primary-800">Processing Admin Action...</Text>
          </View>
        )}

        {/* Tab 1: Profile & Quick Actions */}
        {activeTab === 'profile' && (
          <View className="gap-4">
            
            {/* Quick Actions Panel */}
            <Card className="border border-primary-100 bg-primary-50/50">
              <Text className="mb-2 text-sm font-bold uppercase tracking-wider text-primary-800">SUPPORT QUICK ACTIONS</Text>
              <View className="flex-row flex-wrap gap-2">
                {member.approval_status === 'pending' && member.payment_status === 'paid' && (
                  <>
                    <Button
                      title="Approve"
                      variant="primary"
                      size="sm"
                      onPress={() => handleQuickAction('approve-account', {}, 'approve this application')}
                    />
                    <Button
                      title="Reject"
                      variant="destructive"
                      size="sm"
                      onPress={() => {
                        let reason = 'Requirements not met';
                        if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof (window as any).prompt === 'function') {
                          const input = (window as any).prompt('Rejection Reason:\nProvide rejection feedback to applicant:', reason);
                          if (input === null) return;
                          reason = input.trim() || reason;
                        }
                        handleQuickAction('reject-account', { reason }, 'reject this application');
                      }}
                    />
                  </>
                )}
                
                {member.account_status === 'active' ? (
                  <Button
                    title="Suspend"
                    variant="destructive"
                    size="sm"
                    onPress={() => handleQuickAction('suspend-member', {}, 'suspend account')}
                  />
                ) : (
                  <Button
                    title="Activate"
                    variant="primary"
                    size="sm"
                    onPress={() => handleQuickAction('activate-member', {}, 'activate account')}
                  />
                )}

                {member.payment_status === 'paid' ? (
                  <>
                    <Button
                      title="Regenerate Cert"
                      variant="outline"
                      size="sm"
                      onPress={() => handleQuickAction('bulk-regenerate', { account_ids: [id] }, 'enqueue certificate regeneration')}
                    />
                    <Button
                      title="Revoke Cert"
                      variant="destructive"
                      size="sm"
                      onPress={() => handleQuickAction('revoke-certificate', {}, 'revoke certificate')}
                    />
                  </>
                ) : (
                  <Button
                    title="Force Mark Paid"
                    variant="primary"
                    size="sm"
                    onPress={() => handleQuickAction('set-payment-status', { status: 'paid' }, 'mark payment status paid')}
                  />
                )}
              </View>
            </Card>

            {/* Assignments Panel (Admins Only) */}
            {role !== 'reviewer' && (
              <Card>
                <Text className="mb-2 text-sm font-bold text-gray-800">Assign Review Workspace</Text>
                <View className="flex-row items-center gap-3">
                  <View className="flex-1">
                    <Select
                      size="sm"
                      value={assignment?.assigned_to || 'unassigned'}
                      options={[
                        { label: 'Unassigned / Open Queue', value: 'unassigned' },
                        ...reviewers.map(r => ({ label: `${r.email} (${r.role})`, value: r.id }))
                      ]}
                      onValueChange={handleAssignReviewer}
                      className="mb-0"
                    />
                  </View>
                  <View className="rounded-lg bg-gray-100 p-2">
                    <UserCheck size={20} color="#4b5563" />
                  </View>
                </View>
                {assignment && (
                  <Text className="mt-2 text-xs text-gray-500">
                    Assigned by {assignment.assigned_by || 'system'} on {formatDate(assignment.created_at)}
                  </Text>
                )}
              </Card>
            )}

            {/* Core Member Details card */}
            <Card>
              <View className="flex-row items-center gap-2 border-b border-gray-100 pb-2 mb-3">
                <User size={18} color="#15803d" />
                <Text className="text-base font-bold text-gray-900">Member Credentials</Text>
              </View>
              <View className="gap-2">
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-500 font-medium">Full Name</Text>
                  <Text className="text-xs font-semibold text-gray-900">{member.full_name}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-500 font-medium">Email Address</Text>
                  <Text className="text-xs font-semibold text-gray-900">{member.email}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-500 font-medium">Mobile Phone</Text>
                  <Text className="text-xs font-semibold text-gray-900">{member.phone || 'N/A'}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-500 font-medium">Mailing Address</Text>
                  <Text className="text-xs font-semibold text-gray-900 max-w-[200] text-right">{member.address || 'N/A'}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-500 font-medium">District Zone</Text>
                  <Text className="text-xs font-semibold text-gray-900">{member.district || 'Unassigned'}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-500 font-medium">Aadhaar Card Number</Text>
                  <Text className="text-xs font-semibold text-gray-900">{maskAadhaar(member.aadhaar_card_number)}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-500 font-medium">WhatsApp Number</Text>
                  <Text className="text-xs font-semibold text-gray-900">{member.whatsapp_number || 'N/A'}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-500 font-medium">Joined Date</Text>
                  <Text className="text-xs font-semibold text-gray-900">{formatDate(member.created_at)}</Text>
                </View>
                {member.applicant_photo_url && (
                  <View className="mt-2 border-t border-gray-100 pt-3">
                    <Text className="text-xs font-bold text-gray-500 mb-2">APPLICANT PHOTO</Text>
                    <TouchableOpacity
                      className="flex-row items-center py-1.5 px-3 bg-gray-50 border border-gray-200 rounded-md"
                      onPress={() => handleViewFile(member.applicant_photo_url!, 'documents')}
                      disabled={downloadingFile !== null}
                    >
                      <FileText size={14} color="#15803d" />
                      <Text className="ml-2 text-xs font-semibold text-primary-900">
                        {downloadingFile === member.applicant_photo_url ? 'Loading...' : 'View Applicant Photo'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                {member.id_proof_url && (
                  <View className={`${member.applicant_photo_url ? '' : 'mt-2 border-t border-gray-100 pt-3'}`}>
                    {!member.applicant_photo_url && <Text className="text-xs font-bold text-gray-500 mb-2">IDENTITY DOCUMENT</Text>}
                    <TouchableOpacity
                      className="flex-row items-center py-1.5 px-3 bg-gray-50 border border-gray-200 rounded-md"
                      onPress={() => handleViewFile(member.id_proof_url!, 'id-proofs')}
                      disabled={downloadingFile !== null}
                    >
                      <FileText size={14} color="#15803d" />
                      <Text className="ml-2 text-xs font-semibold text-primary-900">
                        {downloadingFile === member.id_proof_url ? 'Loading...' : 'View ID Proof'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </Card>

            {/* Support Diagnostics metrics card */}
            <Card>
              <View className="flex-row items-center gap-2 border-b border-gray-100 pb-2 mb-3">
                <Clock size={18} color="#15803d" />
                <Text className="text-base font-bold text-gray-900">Activity Diagnostics</Text>
              </View>
              <View className="gap-2">
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-500 font-medium">Last Login</Text>
                  <Text className="text-xs font-semibold text-gray-900">{lastLogin ? formatDateTime(lastLogin) : 'Never'}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-500 font-medium">Last Activity Tracker</Text>
                  <Text className="text-xs font-semibold text-gray-900">{lastActivity ? formatDateTime(lastActivity) : 'Never'}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-500 font-medium">Last Payment Attempt</Text>
                  <Text className="text-xs font-semibold text-gray-900">{lastPaymentAttempt ? formatDateTime(lastPaymentAttempt) : 'Never'}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-500 font-medium">Last Certificate Download</Text>
                  <Text className="text-xs font-semibold text-gray-900">{lastCertDownload ? formatDateTime(lastCertDownload) : 'Never'}</Text>
                </View>
              </View>
            </Card>

            {/* Residential Details Card */}
            {(member.residence_address || member.residence_pin_code) && (
              <Card>
                <View className="flex-row items-center gap-2 border-b border-gray-100 pb-2 mb-3">
                  <User size={18} color="#15803d" />
                  <Text className="text-base font-bold text-gray-900">Residential Details</Text>
                </View>
                <View className="gap-2">
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500 font-medium">Residence Address</Text>
                    <Text className="text-xs font-semibold text-gray-900 max-w-[200] text-right">{member.residence_address || 'N/A'}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500 font-medium">Residence PIN Code</Text>
                    <Text className="text-xs font-semibold text-gray-900">{member.residence_pin_code || 'N/A'}</Text>
                  </View>
                </View>
              </Card>
            )}

            {/* Firm Registry Details Card */}
            <Card>
              <View className="flex-row items-center gap-2 border-b border-gray-100 pb-2 mb-3">
                <Building2 size={18} color="#15803d" />
                <Text className="text-base font-bold text-gray-900">Firm Registry Details</Text>
              </View>
              {member.firm_name ? (
                <View className="gap-2">
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500 font-medium">Firm Name</Text>
                    <Text className="text-xs font-semibold text-gray-900">{member.firm_name}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500 font-medium">Firm Entity Type</Text>
                    <Text className="text-xs font-semibold text-gray-900 uppercase">{member.firm_type}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500 font-medium">Partner / Proprietor Name</Text>
                    <Text className="text-xs font-semibold text-gray-900">{member.partner_proprietor_name || 'N/A'}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500 font-medium">License / Registry ID</Text>
                    <Text className="text-xs font-semibold text-gray-900">{member.license_number || 'N/A'}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500 font-medium">Registration Number</Text>
                    <Text className="text-xs font-semibold text-gray-900">{member.registration_number || 'N/A'}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500 font-medium">GSTIN Number</Text>
                    <Text className="text-xs font-semibold text-gray-900">{member.gst_number || 'N/A'}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500 font-medium">IFMS Number</Text>
                    <Text className="text-xs font-semibold text-gray-900">{member.ifms_number || 'N/A'}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500 font-medium">Firm Address</Text>
                    <Text className="text-xs font-semibold text-gray-900 max-w-[200] text-right">{member.firm_address || 'N/A'}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500 font-medium">Firm PIN Code</Text>
                    <Text className="text-xs font-semibold text-gray-900">{member.firm_pin_code || 'N/A'}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500 font-medium">Contact Phone</Text>
                    <Text className="text-xs font-semibold text-gray-900">{member.contact_phone || 'N/A'}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500 font-medium">Contact Email</Text>
                    <Text className="text-xs font-semibold text-gray-900">{member.contact_email || 'N/A'}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500 font-medium">WhatsApp Contact</Text>
                    <Text className="text-xs font-semibold text-gray-900">{member.whatsapp_number || 'N/A'}</Text>
                  </View>
                  
                  {member.documents_urls && member.documents_urls.length > 0 && (
                    <View className="mt-2 border-t border-gray-100 pt-3">
                      <Text className="text-xs font-bold text-gray-500 mb-2">UPLOADED FILES</Text>
                      {member.documents_urls.map((url, index) => (
                        <TouchableOpacity 
                          key={index}
                          className="flex-row items-center py-1.5 px-3 mb-1 bg-gray-50 border border-gray-200 rounded-md"
                          onPress={() => handleViewFile(url, 'documents')}
                          disabled={downloadingFile !== null}
                        >
                          <FileText size={14} color="#15803d" />
                          <Text className="ml-2 text-xs font-semibold text-primary-900 flex-1 truncate">
                            {downloadingFile === url ? 'Loading...' : `Document #${index+1}`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              ) : (
                <Text className="text-xs text-gray-400 py-2">No firm registry details provided yet.</Text>
              )}
            </Card>

            {/* License Details Card */}
            <Card>
              <View className="flex-row items-center gap-2 border-b border-gray-100 pb-2 mb-3">
                <Award size={18} color="#15803d" />
                <Text className="text-base font-bold text-gray-900">License Details</Text>
              </View>
              <View className="gap-3">
                {/* Seed Cotton License */}
                <View className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <Text className="text-[10px] font-bold text-gray-400 uppercase mb-2">Seed Cotton License</Text>
                  <View className="gap-1.5">
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-500 font-medium">License Number</Text>
                      <Text className="text-xs font-semibold text-gray-900">{member.seed_cotton_license_number || 'N/A'}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-500 font-medium">Expiry Date</Text>
                      <Text className="text-xs font-semibold text-gray-900">{member.seed_cotton_license_expiry ? formatDate(member.seed_cotton_license_expiry) : 'N/A'}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-500 font-medium">Sarthi ID (Cotton)</Text>
                      <Text className="text-xs font-semibold text-gray-900">{member.sarthi_id_cotton || 'N/A'}</Text>
                    </View>
                  </View>
                </View>

                {/* Seed General License */}
                <View className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <Text className="text-[10px] font-bold text-gray-400 uppercase mb-2">Seed General License</Text>
                  <View className="gap-1.5">
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-500 font-medium">License Number</Text>
                      <Text className="text-xs font-semibold text-gray-900">{member.seed_general_license_number || 'N/A'}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-500 font-medium">Expiry Date</Text>
                      <Text className="text-xs font-semibold text-gray-900">{member.seed_general_license_expiry ? formatDate(member.seed_general_license_expiry) : 'N/A'}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-500 font-medium">Sarthi ID (General)</Text>
                      <Text className="text-xs font-semibold text-gray-900">{member.sarthi_id_general || 'N/A'}</Text>
                    </View>
                  </View>
                </View>

                {/* Pesticide License */}
                <View className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <Text className="text-[10px] font-bold text-gray-400 uppercase mb-2">Pesticide License</Text>
                  <View className="gap-1.5">
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-500 font-medium">License Number</Text>
                      <Text className="text-xs font-semibold text-gray-900">{member.pesticide_license_number || 'N/A'}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-500 font-medium">Date of Issue</Text>
                      <Text className="text-xs font-semibold text-gray-900">{member.pesticide_license_expiry ? formatDate(member.pesticide_license_expiry) : 'N/A'}</Text>
                    </View>
                  </View>
                </View>

                {/* Fertilizer License */}
                <View className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <Text className="text-[10px] font-bold text-gray-400 uppercase mb-2">Fertilizer License</Text>
                  <View className="gap-1.5">
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-500 font-medium">License Number</Text>
                      <Text className="text-xs font-semibold text-gray-900">{member.fertilizer_license_number || 'N/A'}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-500 font-medium">Expiry Date</Text>
                      <Text className="text-xs font-semibold text-gray-900">{member.fertilizer_license_expiry ? formatDate(member.fertilizer_license_expiry) : 'N/A'}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </Card>
          </View>
        )}

        {/* Tab 2: Payments History */}
        {activeTab === 'payments' && (
          <View className="gap-3">
            {payments.map((pay) => (
              <Card key={pay.id} className="border-l-4 border-l-primary-900">
                <View className="flex-row justify-between mb-2">
                  <Text className="text-sm font-bold text-gray-900">₹{(pay.amount / 100).toFixed(2)}</Text>
                  <StatusBadge status={pay.status} />
                </View>
                <View className="gap-1 border-t border-gray-50 pt-2">
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500">Provider</Text>
                    <Text className="text-xs font-semibold text-gray-800 uppercase">{pay.provider || 'unknown'}</Text>
                  </View>
                  {pay.razorpay_payment_id && (
                    <View className="flex-row justify-between">
                      <Text className="text-xs text-gray-500">Transaction ID</Text>
                      <Text className="text-xs font-semibold text-gray-800">{pay.razorpay_payment_id}</Text>
                    </View>
                  )}
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500">Dated</Text>
                    <Text className="text-xs font-semibold text-gray-800">{formatDateTime(pay.created_at)}</Text>
                  </View>
                </View>
              </Card>
            ))}

            {payments.length === 0 && (
              <Text className="text-center text-gray-400 py-12">No payment attempts found.</Text>
            )}
          </View>
        )}

        {/* Tab 3: Certificates */}
        {activeTab === 'certificates' && (
          <View className="gap-3">
            {certificates.map((cert) => (
              <Card key={cert.id} className="border border-green-100 bg-green-50/20">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center">
                    <Award size={18} color="#15803d" />
                    <Text className="ml-2 text-sm font-bold text-gray-900">{cert.certificate_id}</Text>
                  </View>
                  <StatusBadge status={cert.status} />
                </View>
                
                <View className="gap-1 mb-3">
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500">Issue Date</Text>
                    <Text className="text-xs font-semibold text-gray-800">{formatDateTime(cert.issued_at)}</Text>
                  </View>
                </View>

                <View className="flex-row gap-2 border-t border-green-100/50 pt-2">
                  <Button 
                    title="Download Certificate" 
                    variant="primary" 
                    size="sm"
                    onPress={() => handleViewFile(cert.certificate_url, 'certificates', cert)}
                    loading={downloadingFile === cert.certificate_url}
                    disabled={downloadingFile !== null}
                  />
                </View>
              </Card>
            ))}

            {certificates.length === 0 && (
              <Text className="text-center text-gray-400 py-12">No certificates issued.</Text>
            )}
          </View>
        )}

        {/* Tab 4: Timeline & Notes System */}
        {activeTab === 'timeline' && (
          <View className="gap-4">
            
            {/* Timeline View */}
            <Card>
              <Text className="mb-4 text-base font-bold text-gray-900">Application Lifecycle Timeline</Text>
              {member.status_timeline ? (
                <View className="pl-2 border-l border-gray-300 gap-6">
                  {Object.entries(member.status_timeline).map(([key, details]: [string, any]) => (
                    <View key={key} className="relative pl-6">
                      <View className="absolute left-[-13] top-[2] w-6 h-6 rounded-full bg-primary-900 items-center justify-center border border-white">
                        <Clock size={12} color="#fff" />
                      </View>
                      <Text className="text-xs font-bold uppercase tracking-wider text-primary-900">{key.replace('_', ' ')}</Text>
                      <Text className="text-xs text-gray-500">{formatDateTime(details.timestamp)}</Text>
                      {details.reason && (
                        <Text className="mt-1 text-xs text-red-600 italic bg-red-50 p-1.5 rounded-md">Reason: {details.reason}</Text>
                      )}
                      {details.approved_by && (
                        <Text className="text-xs text-gray-600 font-semibold mt-0.5">Approved by User UUID: {details.approved_by}</Text>
                      )}
                      {details.assigned_to_admin && (
                        <Text className="text-xs text-gray-600 font-semibold mt-0.5">Assigned to Admin UUID: {details.assigned_to_admin}</Text>
                      )}
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-xs text-gray-400 py-2">No lifecycle events recorded.</Text>
              )}
            </Card>

            {/* Notes Management Section */}
            <Card>
              <Text className="mb-3 text-base font-bold text-gray-900">Internal Admin Notes</Text>
              
              {/* Add Note Input */}
              <View className="mb-4 flex-row items-end gap-2">
                <View className="flex-1">
                  <TextInput
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                    placeholder="Write a confidential internal note..."
                    placeholderTextColor="#9ca3af"
                    multiline
                    numberOfLines={3}
                    value={newNote}
                    onChangeText={setNewNote}
                  />
                </View>
                <TouchableOpacity 
                  className="bg-primary-900 rounded-lg p-2 items-center justify-center h-10 w-10"
                  onPress={handleAddNote}
                  disabled={actionLoading}
                >
                  <Send size={16} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Notes List */}
              <View className="gap-3">
                {notes.map((n) => (
                  <View key={n.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    {editingNoteId === n.id ? (
                      <View className="gap-2">
                        <TextInput
                          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                          multiline
                          value={editingNoteText}
                          onChangeText={setEditingNoteText}
                        />
                        <View className="flex-row justify-end gap-2">
                          <Button title="Cancel" size="sm" variant="outline" onPress={() => setEditingNoteId(null)} />
                          <Button title="Save Changes" size="sm" variant="primary" onPress={() => handleEditNote(n.id)} />
                        </View>
                      </View>
                    ) : (
                      <>
                        <Text className="text-xs font-semibold text-gray-800 mb-2 leading-relaxed">{n.note}</Text>
                        <View className="flex-row justify-between items-center border-t border-gray-200/50 pt-2">
                          <Text className="text-[10px] text-gray-400">
                            by {n.admin_email} ({n.admin_role}) on {formatDate(n.created_at)}
                          </Text>
                          {/* Note actions (creator check) */}
                          <View className="flex-row gap-2">
                            <TouchableOpacity 
                              onPress={() => {
                                setEditingNoteId(n.id);
                                setEditingNoteText(n.note);
                              }}
                            >
                              <Edit2 size={12} color="#4b5563" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleDeleteNote(n.id)}>
                              <Trash2 size={12} color="#ef4444" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </>
                    )}
                  </View>
                ))}

                {notes.length === 0 && (
                  <Text className="text-center text-gray-400 py-6 text-xs italic">No internal notes added.</Text>
                )}
              </View>
            </Card>
          </View>
        )}

        {/* Tab 5: Audit Log Trail */}
        {activeTab === 'audit' && (
          <View className="gap-2">
            {auditLogs.map((log) => (
              <Card key={log.id} className="py-2.5">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-2">
                    <Text className="text-xs font-bold text-primary-900 uppercase">{log.action.replace('_', ' ')}</Text>
                    {log.details && (
                      <Text className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{log.details}</Text>
                    )}
                    <Text className="text-[10px] text-gray-400 mt-1">
                      by {log.admin_users?.email || 'Unknown'}
                    </Text>
                  </View>
                  <Text className="text-[10px] text-gray-400">
                    {formatDateTime(log.created_at)}
                  </Text>
                </View>
              </Card>
            ))}

            {auditLogs.length === 0 && (
              <Text className="text-center text-gray-400 py-12">No audit actions logged.</Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
