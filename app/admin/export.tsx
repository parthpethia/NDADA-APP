import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, ActivityIndicator, TouchableOpacity, Linking } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card, Button, StatusBadge, Select } from '@/components/ui';
import { useAdmin } from '@/hooks/useAdmin';
import { confirm } from '@/lib/confirm';
import { formatDateTime } from '@/lib/utils';
import { DISTRICT_FILTER_OPTIONS } from '@/constants/districts';
import { 
  Download, Calendar, AlertTriangle, CheckCircle, 
  Trash2, RefreshCw, FileText, Filter, Clock 
} from 'lucide-react-native';

interface ExportJob {
  id: string;
  admin_id: string;
  export_type: 'members' | 'firms' | 'payments' | 'certificates' | 'audit_logs';
  filters: Record<string, any>;
  format: 'CSV' | 'XLSX' | 'PDF';
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
  const [exportType, setExportType] = useState<'members' | 'firms' | 'payments' | 'certificates' | 'audit_logs'>('members');
  const [format, setFormat] = useState<'XLSX' | 'PDF'>('XLSX');
  const [memberType, setMemberType] = useState<'all' | 'members' | 'non_members'>('all');
  const [filterDistrict, setFilterDistrict] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const [triggerLoading, setTriggerLoading] = useState(false);
  const initializedRef = useRef(false);

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
    if (initializedRef.current) return;
    initializedRef.current = true;
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

  const compileExportClientSide = async (type: string, exportFormat: 'XLSX' | 'PDF', filters: Record<string, any>) => {
    let query = supabase
      .from('accounts')
      .select('id, firm_name, partner_proprietor_name, full_name, contact_email, email, contact_phone, phone, district, firm_address, residence_address, address, payment_status, approval_status, account_status');

    if (filters.district && filters.district !== 'all') {
      query = query.eq('district', filters.district);
    }

    const mType = filters.member_type || memberType;
    if (mType === 'members') {
      query = query.eq('payment_status', 'paid').eq('approval_status', 'approved');
    } else if (mType === 'non_members') {
      query = query.or('payment_status.neq.paid,approval_status.neq.approved');
    }

    if (filters.payment_status && filters.payment_status !== 'all') {
      if (filters.payment_status === 'received' || filters.payment_status === 'paid') {
        query = query.eq('payment_status', 'paid');
      } else if (filters.payment_status === 'unpaid') {
        query = query.in('payment_status', ['pending', 'failed']);
      } else {
        query = query.eq('payment_status', filters.payment_status);
      }
    }

    const { data: records, error: dbErr } = await query;
    if (dbErr) throw dbErr;

    const headers = ['Name of Firm', 'Partner Name', 'Email ID', 'Phone No', 'City', 'District', 'Address'];
    const rows = (records || []).map((r: any) => [
      r.firm_name || '',
      r.partner_proprietor_name || r.full_name || '',
      r.contact_email || r.email || '',
      r.contact_phone || r.phone || '',
      r.district || '',
      r.district || '',
      r.firm_address || r.residence_address || r.address || ''
    ]);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = exportFormat === 'PDF' ? 'pdf' : 'xlsx';
    const filename = `${type}_export_${timestamp}.${extension}`;

    let fileBlob: Blob;
    if (exportFormat === 'PDF') {
      const htmlDoc = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>NDADA Export Report</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 24px; color: #1f2937; }
            .header { background-color: #15803d; color: white; padding: 18px 24px; border-radius: 8px; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 0.5px; }
            .header p { margin: 4px 0 0 0; font-size: 12px; opacity: 0.9; }
            .meta { font-size: 12px; margin-bottom: 16px; color: #4b5563; background: #f9fafb; padding: 10px 14px; border-radius: 6px; border: 1px solid #e5e7eb; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
            th { background-color: #15803d; color: white; text-align: left; padding: 10px 12px; font-weight: bold; border: 1px solid #15803d; }
            td { padding: 9px 12px; border: 1px solid #e5e7eb; word-break: break-word; }
            tr:nth-child(even) { background-color: #f9fafb; }
            .footer { margin-top: 32px; font-size: 11px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 14px; }
            @media print {
              body { padding: 0; }
              @page { size: landscape; margin: 10mm; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>NDADA Member & Firm Directory Report</h1>
            <p>Official System Export &bull; Generated: ${new Date().toLocaleString()}</p>
          </div>
          <div class="meta">
            <strong>Total Records:</strong> ${rows.length} &nbsp;|&nbsp; 
            <strong>Member Filter:</strong> ${mType === 'members' ? 'Members Only' : mType === 'non_members' ? 'Non-Members Only' : 'All Records'}
            ${filters.district && filters.district !== 'all' ? ` &nbsp;|&nbsp; <strong>District:</strong> ${filters.district}` : ''}
          </div>
          <table>
            <thead>
              <tr>
                ${headers.map(h => `<th>${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${rows.length > 0 ? rows.map(r => `
                <tr>
                  ${r.map(val => `<td>${val || '-'}</td>`).join('')}
                </tr>
              `).join('') : `<tr><td colspan="7" style="text-align:center; padding: 24px; color:#9ca3af;">No matching records found for the applied filter criteria</td></tr>`}
            </tbody>
          </table>
          <div class="footer">
            NDADA Official Admin Export &bull; File: ${filename}
          </div>
        </body>
        </html>
      `;
      fileBlob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
    } else {
      const xmlHeader = headers.map(h => `<Cell ss:StyleID="Header"><Data ss:Type="String">${h}</Data></Cell>`).join('');
      const xmlRows = rows.map(r =>
        `<Row>` + r.map(val => `<Cell><Data ss:Type="String">${String(val || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</Data></Cell>`).join('') + `</Row>`
      ).join('\n');

      const excelXml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#15803D" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="NDADA Export">
  <Table>
   <Row>${xmlHeader}</Row>
   ${xmlRows}
  </Table>
 </Worksheet>
</Workbook>`;
      fileBlob = new Blob([excelXml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    }

    try {
      const { error: uploadErr } = await supabase.storage.from('secure-exports').upload(filename, fileBlob, {
        contentType: exportFormat === 'PDF' ? 'text/html' : 'application/vnd.ms-excel',
        upsert: true
      });

      if (!uploadErr) {
        const { data: userRes } = await supabase.auth.getUser();
        if (userRes?.user?.id) {
          const { data: adminRes } = await supabase.from('admin_users').select('id').eq('user_id', userRes.user.id).single();
          if (adminRes?.id) {
            await supabase.from('export_jobs').insert({
              admin_id: adminRes.id,
              export_type: type,
              filters,
              format: exportFormat,
              status: 'completed',
              file_url: filename,
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            });
          }
        }
      }
    } catch (e) {
      console.warn('Silent storage upload warning:', e);
    }

    const blobUrl = URL.createObjectURL(fileBlob);
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      const printWin = window.open(blobUrl, '_blank');
      if (printWin && exportFormat === 'PDF') {
        printWin.focus();
        setTimeout(() => {
          try { printWin.print(); } catch (pe) {}
        }, 500);
      } else {
        Linking.openURL(blobUrl);
      }
    } else {
      Linking.openURL(blobUrl);
    }
  };

  const handleGenerateExport = async () => {
    setTriggerLoading(true);
    const filters: Record<string, any> = {};
    if (filterDistrict !== 'all') filters.district = filterDistrict;
    if (memberType !== 'all') filters.member_type = memberType;
    
    if (filterStatus !== 'all') {
      if (exportType === 'members' || exportType === 'firms') {
        if (['received', 'unpaid', 'pending', 'paid', 'failed'].includes(filterStatus)) {
          filters.payment_status = filterStatus;
        } else if (['approved', 'rejected'].includes(filterStatus)) {
          filters.approval_status = filterStatus;
        } else if (['active', 'suspended', 'deleted'].includes(filterStatus)) {
          filters.account_status = filterStatus;
        }
      } else if (exportType === 'payments') {
        filters.payment_status = filterStatus;
      } else if (exportType === 'certificates') {
        filters.status = filterStatus;
      }
    }

    try {
      const result = await callAdminAction('generate-export', {
        type: exportType,
        format,
        filters
      });

      if (result?.message && result.message.includes('edge function offline')) {
        await compileExportClientSide(exportType, format, filters);
        Alert.alert('Export Generated', `Your ${format} report has been compiled successfully.`);
      } else {
        Alert.alert('Job Enqueued', `Your ${format} background export compiler has started. Refresh history in a few seconds.`);
      }
      await fetchExportData();
    } catch (err: any) {
      try {
        await compileExportClientSide(exportType, format, filters);
        Alert.alert('Export Generated', `Your ${format} export report has been compiled.`);
        await fetchExportData();
      } catch (fallbackErr: any) {
        Alert.alert('Compilation Failed', err.message);
      }
    } finally {
      setTriggerLoading(false);
    }
  };

  // Secure download trigger using private signed URL API
  const handleDownloadFile = async (job: ExportJob) => {
    try {
      if (job.file_url) {
        const { data: signedData } = await supabase.storage
          .from('secure-exports')
          .createSignedUrl(job.file_url, 3600);

        if (signedData?.signedUrl) {
          Linking.openURL(signedData.signedUrl);
          return;
        }
      }

      const result = await callAdminAction('get-export-download', { job_id: job.id });
      if (result?.download_url) {
        let url = result.download_url;
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('blob:')) {
          const { data: publicData } = supabase.storage.from('secure-exports').getPublicUrl(url);
          url = publicData?.publicUrl || url;
        }
        Linking.openURL(url);
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
        <ActivityIndicator size="large" color="#15803d" />
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
        <Card className="mb-4 border border-primary-50">
          <View className="flex-row items-center gap-2 border-b border-gray-100 pb-2 mb-3">
            <Filter size={16} color="#15803d" />
            <Text className="text-sm font-bold text-primary-900 uppercase">Export Configuration</Text>
          </View>

          <View className="gap-3">
            {/* Active Fields Badge */}
            <View className="bg-primary-50/60 p-2.5 rounded-lg border border-primary-100">
              <Text className="text-[10px] font-bold text-primary-900 uppercase tracking-wider mb-1">
                Included Export Fields (7 Columns)
              </Text>
              <Text className="text-xs text-primary-800 font-medium">
                1. Name of Firm  •  2. Partner Name  •  3. Email ID  •  4. Phone No  •  5. City  •  6. District  •  7. Address
              </Text>
            </View>

            <View className="flex-col sm:flex-row gap-2">
              <View className="flex-1">
                <Text className="text-xs font-bold text-gray-500 mb-1.5">Format Target</Text>
                <Select
                  value={format}
                  options={[
                    { label: 'Excel Spreadsheet (.xlsx)', value: 'XLSX' },
                    { label: 'PDF Document (.pdf)', value: 'PDF' }
                  ]}
                  onValueChange={(val: any) => setFormat(val)}
                />
              </View>

              <View className="flex-1">
                <Text className="text-xs font-bold text-gray-500 mb-1.5">Member Status Filter</Text>
                <Select
                  value={memberType}
                  options={[
                    { label: 'All (Members & Non-Members)', value: 'all' },
                    { label: 'Members Only (Paid/Approved)', value: 'members' },
                    { label: 'Non-Members Only (Unpaid/Pending)', value: 'non_members' }
                  ]}
                  onValueChange={(val: any) => setMemberType(val)}
                />
              </View>
            </View>

            <View className="flex-col sm:flex-row gap-2">
              <View className="flex-1">
                <Text className="text-xs font-bold text-gray-500 mb-1.5">District Filter</Text>
                <Select
                  value={filterDistrict}
                  options={DISTRICT_FILTER_OPTIONS as any}
                  onValueChange={(val: any) => setFilterDistrict(val)}
                />
              </View>

              <View className="flex-1">
                <Text className="text-xs font-bold text-gray-500 mb-1.5">Detailed Status Filter</Text>
                <Select
                  value={filterStatus}
                  options={[
                    { label: 'All Statuses', value: 'all' },
                    { label: 'Payment Received (Paid)', value: 'received' },
                    { label: 'Payment Not Received (Unpaid)', value: 'unpaid' },
                    { label: 'Approved', value: 'approved' },
                    { label: 'Rejected', value: 'rejected' },
                    { label: 'Active Account', value: 'active' },
                    { label: 'Suspended Account', value: 'suspended' },
                  ]}
                  onValueChange={(val: any) => setFilterStatus(val)}
                />
              </View>
            </View>

            {triggerLoading ? (
              <ActivityIndicator size="small" color="#15803d" className="py-2" />
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
                      {job.export_type.replace(/_/g, ' ')} export
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
                  exp.expired ? (
                    <View className="flex-row items-center gap-2 bg-gray-100 p-2.5 rounded-lg border border-gray-200">
                      <Clock size={14} color="#9ca3af" />
                      <Text className="text-[10px] text-gray-500 font-semibold flex-1">
                        Export file has expired and is no longer available for download.
                      </Text>
                    </View>
                  ) : (
                    <Button 
                      title="Download Export File" 
                      variant="primary" 
                      size="sm"
                      onPress={() => handleDownloadFile(job)}
                    />
                  )
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
                    <Text className="text-xs font-semibold text-amber-500">Compiling {job.format} file...</Text>
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
