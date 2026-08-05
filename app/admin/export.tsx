import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, ActivityIndicator, TouchableOpacity, Linking } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Card, Button, StatusBadge, Select } from '@/components/ui';
import { useAdmin } from '@/hooks/useAdmin';
import { confirm } from '@/lib/confirm';
import { formatDate, formatDateTime, formatPureDate } from '@/lib/utils';
import { DISTRICT_FILTER_OPTIONS } from '@/constants/districts';
import { jsPDF } from 'jspdf';
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
  const [format, setFormat] = useState<'CSV' | 'XLSX' | 'PDF'>('XLSX');
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

  const compileExportClientSide = async (type: string, exportFormat: 'CSV' | 'XLSX' | 'PDF', filters: Record<string, any>) => {
    console.log(`[Export Compiler Fallback] Compiling ${exportFormat} export for type=${type}`);
    let headers: string[] = [];
    let rows: string[][] = [];

    if (type === 'payments') {
      headers = ['Payment ID', 'Membership ID', 'Firm / Member Name', 'Email', 'Phone', 'Amount (₹)', 'Payment Status', 'Provider', 'Razorpay Payment ID', 'Created Date'];
      let query = supabase
        .from('payments')
        .select('id, amount, currency, status, provider, razorpay_payment_id, created_at, member_id, accounts:member_id(full_name, firm_name, email, phone, membership_id)')
        .order('created_at', { ascending: false });

      if (filters.payment_status && filters.payment_status !== 'all') {
        query = query.eq('status', filters.payment_status);
      }

      const { data, error: dbErr } = await query;
      if (dbErr) throw dbErr;

      rows = (data || []).map((r: any) => [
        r.id || '',
        r.accounts?.membership_id ? `NDADA/MAH/NAG/${r.accounts.membership_id}` : '-',
        r.accounts?.firm_name || r.accounts?.full_name || '',
        r.accounts?.email || '',
        r.accounts?.phone || '',
        r.amount !== undefined ? String(r.amount) : '0',
        String(r.status || '').toUpperCase(),
        r.provider || 'Razorpay',
        r.razorpay_payment_id || '-',
        r.created_at ? formatPureDate(r.created_at, 'DD/MM/YYYY') : ''
      ]);
    } else if (type === 'certificates') {
      headers = ['Certificate ID', 'Membership ID', 'Member Name', 'Firm Name', 'Email', 'Phone', 'District', 'Status', 'Issued Date'];
      let query = supabase
        .from('certificates')
        .select('id, certificate_id, status, issued_at, member_id, accounts:member_id(full_name, firm_name, email, phone, district, membership_id)')
        .order('issued_at', { ascending: false });

      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      const { data, error: dbErr } = await query;
      if (dbErr) throw dbErr;

      rows = (data || []).map((r: any) => [
        r.certificate_id || '',
        r.accounts?.membership_id ? `NDADA/MAH/NAG/${r.accounts.membership_id}` : '-',
        r.accounts?.full_name || '',
        r.accounts?.firm_name || '',
        r.accounts?.email || '',
        r.accounts?.phone || '',
        r.accounts?.district || '',
        String(r.status || '').toUpperCase(),
        r.issued_at ? formatPureDate(r.issued_at, 'DD/MM/YYYY') : ''
      ]);
    } else if (type === 'audit_logs') {
      headers = ['Log ID', 'Timestamp', 'Admin Email', 'Admin Role', 'Action', 'Target User ID', 'Details'];
      let query = supabase
        .from('audit_logs')
        .select('id, action, target_user, details, created_at, admin_id, admin_users:admin_id(email, role)')
        .order('created_at', { ascending: false })
        .limit(1000);

      const { data, error: dbErr } = await query;
      if (dbErr) throw dbErr;

      rows = (data || []).map((r: any) => [
        r.id || '',
        r.created_at ? formatDate(r.created_at) : '',
        r.admin_users?.email || 'System',
        r.admin_users?.role || 'system',
        r.action || '',
        r.target_user || '-',
        r.details || ''
      ]);
    } else {
      headers = ['Membership ID', 'Name of Firm', 'Partner / Owner Name', 'Email ID', 'Phone No', 'District', 'Address', 'Payment Status', 'Approval Status'];
      let query = supabase
        .from('accounts')
        .select('id, membership_id, firm_name, partner_proprietor_name, full_name, contact_email, email, contact_phone, phone, district, firm_address, residence_address, address, payment_status, approval_status, account_status');

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

      rows = (records || []).map((r: any) => [
        r.membership_id ? `NDADA/MAH/NAG/${r.membership_id}` : '-',
        r.firm_name || '',
        r.partner_proprietor_name || r.full_name || '',
        r.contact_email || r.email || '',
        r.contact_phone || r.phone || '',
        r.district || '',
        r.firm_address || r.residence_address || r.address || '',
        String(r.payment_status || 'unpaid').toUpperCase(),
        String(r.approval_status || 'pending').toUpperCase()
      ]);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = exportFormat === 'PDF' ? 'pdf' : exportFormat === 'CSV' ? 'csv' : 'xlsx';
    const filename = `${type}_export_${timestamp}.${extension}`;

    let fileBlob: Blob;
    let uploadContentType: string;

    if (exportFormat === 'CSV') {
      const csvHeader = headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(',');
      const csvBody = rows.map(row => 
        row.map(val => `"${String(val || '').replace(/"/g, '""').replace(/[\r\n\t]+/g, ' ').trim()}"`).join(',')
      ).join('\n');
      const csvContent = '\uFEFF' + csvHeader + '\n' + csvBody;
      uploadContentType = 'text/csv;charset=utf-8';
      fileBlob = new Blob([csvContent], { type: uploadContentType });
    } else if (exportFormat === 'PDF') {
      uploadContentType = 'application/pdf';
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = 297;
      const pageHeight = 210;
      const marginX = 10;
      const usableWidth = pageWidth - (2 * marginX);

      const primaryColor: [number, number, number] = [21, 128, 61];
      const textColor: [number, number, number] = [31, 41, 55];
      const borderLineColor: [number, number, number] = [229, 231, 235];
      const altRowColor: [number, number, number] = [249, 250, 251];

      const drawHeaderBanner = (pageDoc: any, titleText: string) => {
        pageDoc.setFillColor(...primaryColor);
        pageDoc.rect(0, 0, pageWidth, 16, 'F');
        pageDoc.setTextColor(255, 255, 255);
        pageDoc.setFontSize(11);
        pageDoc.setFont('helvetica', 'bold');
        pageDoc.text(titleText, marginX, 11);
      };

      const titleBannerText = `NDADA - ${type.toUpperCase().replace(/_/g, ' ')} EXPORT REPORT`;
      drawHeaderBanner(doc, titleBannerText);

      doc.setTextColor(...textColor);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated On: ${formatPureDate(new Date().toISOString(), 'readable')}   |   Total Records: ${rows.length}`, marginX, 22);

      const filterSummary: string[] = [];
      if (filters.district && filters.district !== 'all') filterSummary.push(`District: ${filters.district}`);
      if (filters.payment_status && filters.payment_status !== 'all') filterSummary.push(`Payment: ${filters.payment_status}`);
      if (filters.approval_status && filters.approval_status !== 'all') filterSummary.push(`Approval: ${filters.approval_status}`);
      if (filters.status && filters.status !== 'all') filterSummary.push(`Status: ${filters.status}`);

      if (filterSummary.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.text(`Applied Filters: ${filterSummary.join('   |   ')}`, marginX, 27);
      }

      const startY = filterSummary.length > 0 ? 31 : 26;

      const colWidths: number[] = [];
      let totalWeight = 0;
      headers.forEach((h) => {
        let weight = Math.max(h.length, 10);
        if (h.toLowerCase().includes('address') || h.toLowerCase().includes('name') || h.toLowerCase().includes('firm')) {
          weight = Math.max(weight, 22);
        } else if (h.toLowerCase().includes('id') || h.toLowerCase().includes('status') || h.toLowerCase().includes('phone')) {
          weight = Math.min(weight, 16);
        }
        colWidths.push(weight);
        totalWeight += weight;
      });

      const finalColWidths = colWidths.map(w => (w / totalWeight) * usableWidth);

      const rowHeight = 7;
      const cellPadding = 1.5;

      const drawTableHeader = (currentY: number) => {
        doc.setFillColor(...primaryColor);
        doc.rect(marginX, currentY, usableWidth, rowHeight, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');

        let x = marginX;
        headers.forEach((h, i) => {
          const colW = finalColWidths[i];
          let text = h;
          if (doc.getTextWidth(text) > colW - 2) {
            text = text.substring(0, Math.floor(colW / 2)) + '..';
          }
          doc.text(text, x + cellPadding, currentY + 5);
          x += colW;
        });
        return currentY + rowHeight;
      };

      let currentY = drawTableHeader(startY);
      const pdfBody = rows.length > 0 ? rows : [Array(headers.length).fill('-')];

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');

      pdfBody.forEach((row, rowIndex) => {
        if (currentY + rowHeight > pageHeight - 15) {
          doc.addPage();
          drawHeaderBanner(doc, `${titleBannerText} (Contd.)`);
          currentY = drawTableHeader(22);
        }

        if (rowIndex % 2 === 1) {
          doc.setFillColor(...altRowColor);
          doc.rect(marginX, currentY, usableWidth, rowHeight, 'F');
        }

        doc.setDrawColor(...borderLineColor);
        doc.setLineWidth(0.1);
        doc.line(marginX, currentY + rowHeight, marginX + usableWidth, currentY + rowHeight);

        doc.setTextColor(...textColor);
        let x = marginX;
        row.forEach((val, i) => {
          const colW = finalColWidths[i];
          let cellText = String(val || '-');
          while (cellText.length > 1 && doc.getTextWidth(cellText) > colW - (cellPadding * 2)) {
            cellText = cellText.slice(0, -1);
          }
          if (cellText !== String(val || '-')) {
            cellText = cellText.slice(0, -2) + '..';
          }
          doc.text(cellText, x + cellPadding, currentY + 4.8);
          x += colW;
        });

        currentY += rowHeight;
      });

      const totalPages = (doc.internal as any).getNumberOfPages ? (doc.internal as any).getNumberOfPages() : 1;
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(156, 163, 175);
        doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, pageHeight - 6, { align: 'right' });
        doc.text('NDADA Official Admin System Export', marginX, pageHeight - 6);
      }

      const pdfArrayBuffer = doc.output('arraybuffer');
      fileBlob = new Blob([pdfArrayBuffer], { type: uploadContentType });
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
      uploadContentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      fileBlob = new Blob([excelXml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    }

    try {
      const { error: uploadErr } = await supabase.storage.from('secure-exports').upload(filename, fileBlob, {
        contentType: uploadContentType,
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
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.createElement) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }, 1000);
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
      let downloadUrl = '';
      if (job.file_url) {
        const { data: signedData } = await supabase.storage
          .from('secure-exports')
          .createSignedUrl(job.file_url, 3600);

        if (signedData?.signedUrl) {
          downloadUrl = signedData.signedUrl;
        }
      }

      if (!downloadUrl) {
        const result = await callAdminAction('get-export-download', { job_id: job.id });
        if (result?.download_url) {
          downloadUrl = result.download_url;
          if (!downloadUrl.startsWith('http://') && !downloadUrl.startsWith('https://') && !downloadUrl.startsWith('blob:')) {
            const { data: publicData } = supabase.storage.from('secure-exports').getPublicUrl(downloadUrl);
            downloadUrl = publicData?.publicUrl || downloadUrl;
          }
        }
      }

      if (!downloadUrl) {
        throw new Error('Download URL token expired or unreachable');
      }

      if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.createElement) {
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = job.file_url || `${job.export_type}_export.${job.format.toLowerCase()}`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
        }, 1000);
      } else {
        Linking.openURL(downloadUrl);
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
            {/* Export Type Selector */}
            <View>
              <Text className="text-xs font-bold text-gray-500 mb-1.5">Export Target Dataset</Text>
              <Select
                value={exportType}
                options={[
                  { label: 'Members & Firms Directory', value: 'members' },
                  { label: 'Payments & Transactions', value: 'payments' },
                  { label: 'Member Certificates', value: 'certificates' },
                  { label: 'System Audit Logs', value: 'audit_logs' }
                ]}
                onValueChange={(val: any) => setExportType(val)}
              />
            </View>

            {/* Active Fields Badge */}
            <View className="bg-primary-50/60 p-2.5 rounded-lg border border-primary-100">
              <Text className="text-[10px] font-bold text-primary-900 uppercase tracking-wider mb-1">
                Included Export Fields ({
                  exportType === 'payments' ? '10 Columns' :
                  exportType === 'certificates' ? '9 Columns' :
                  exportType === 'audit_logs' ? '7 Columns' : '9 Columns'
                })
              </Text>
              <Text className="text-xs text-primary-800 font-medium">
                {exportType === 'payments'
                  ? '1. Payment ID  •  2. Membership ID  •  3. Firm / Member Name  •  4. Email  •  5. Phone  •  6. Amount (₹)  •  7. Status  •  8. Provider  •  9. Razorpay ID  •  10. Date'
                  : exportType === 'certificates'
                  ? '1. Certificate ID  •  2. Membership ID  •  3. Member Name  •  4. Firm Name  •  5. Email  •  6. Phone  •  7. District  •  8. Status  •  9. Issued Date'
                  : exportType === 'audit_logs'
                  ? '1. Log ID  •  2. Timestamp  •  3. Admin Email  •  4. Admin Role  •  5. Action  •  6. Target User ID  •  7. Details'
                  : '1. Membership ID  •  2. Name of Firm  •  3. Partner Name  •  4. Email ID  •  5. Phone No  •  6. District  •  7. Address  •  8. Payment Status  •  9. Approval Status'
                }
              </Text>
            </View>

            <View className="flex-col sm:flex-row gap-2">
              <View className="flex-1">
                <Text className="text-xs font-bold text-gray-500 mb-1.5">Format Target</Text>
                <Select
                  value={format}
                  options={[
                    { label: 'CSV Text File (.csv)', value: 'CSV' },
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
