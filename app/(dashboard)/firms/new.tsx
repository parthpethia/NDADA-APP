import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  TouchableOpacity,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useAccountForm } from '@/lib/useAccountForm';
import { Button, Input } from '@/components/ui';
import { STORAGE_BUCKETS } from '@/constants';
import * as DocumentPicker from 'expo-document-picker';
import {
  businessDetailsSchema,
  personalDetailsSchema,
  licenseDetailsSchema,
  validateForm,
  getFieldErrors,
} from '@/lib/validation';

const STEPS = [
  { key: 'business', label: 'Business Details', shortLabel: 'Business', subtitle: 'Firm registration & statutory info' },
  { key: 'personal', label: 'Personal Details', shortLabel: 'Personal', subtitle: 'Identity, contact & residence' },
  { key: 'licenses', label: 'License Details', shortLabel: 'Licenses', subtitle: 'Seed, pesticide & fertilizer' },
  { key: 'uploads', label: 'Upload Documents', shortLabel: 'Uploads', subtitle: 'Photo & supporting docs' },
] as const;

/* ------------------------------------------------------------------ */
/*  Mobile Step Indicator (horizontal numbered circles)                */
/* ------------------------------------------------------------------ */
function MobileStepIndicator({
  active,
  onPress,
}: {
  active: number;
  onPress: (i: number) => void;
}) {
  return (
    <View className="flex-row items-center justify-between px-2">
      {STEPS.map((step, idx) => {
        const done = idx < active;
        const current = idx === active;
        return (
          <View key={step.key} className="flex-1 items-center">
            {idx > 0 && (
              <View
                className="absolute top-4 right-1/2 h-0.5 w-full"
                style={{ right: '50%' }}
              >
                <View
                  className={`h-full w-full ${idx <= active ? 'bg-primary-600' : 'bg-gray-200'}`}
                />
              </View>
            )}
            <TouchableOpacity onPress={() => onPress(idx)} className="z-10 items-center">
              <View
                className={`h-9 w-9 items-center justify-center rounded-full border-2 ${
                  done
                    ? 'border-primary-600 bg-primary-600'
                    : current
                      ? 'border-primary-600 bg-white'
                      : 'border-gray-200 bg-gray-50'
                }`}
              >
                {done ? (
                  <Text className="text-sm font-bold text-white">✓</Text>
                ) : (
                  <Text className={`text-sm font-bold ${current ? 'text-primary-600' : 'text-gray-400'}`}>
                    {idx + 1}
                  </Text>
                )}
              </View>
              <Text className={`mt-1.5 text-xs font-medium ${done || current ? 'text-primary-700' : 'text-gray-400'}`}>
                {step.shortLabel}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Web Sidebar Stepper (vertical)                                     */
/* ------------------------------------------------------------------ */
function WebSidebar({
  active,
  onPress,
}: {
  active: number;
  onPress: (i: number) => void;
}) {
  return (
    <View className="w-64 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm" style={{ minHeight: 400 }}>
      <Text className="mb-1 text-lg font-bold text-gray-900">Steps</Text>
      <Text className="mb-6 text-sm text-gray-400">Complete all 4 sections</Text>

      {STEPS.map((step, idx) => {
        const done = idx < active;
        const current = idx === active;
        return (
          <View key={step.key}>
            <TouchableOpacity
              onPress={() => onPress(idx)}
              className={`flex-row items-start rounded-xl px-3 py-3 ${current ? 'bg-primary-50' : ''}`}
            >
              {/* Number / check circle */}
              <View
                className={`mr-3 mt-0.5 h-8 w-8 items-center justify-center rounded-full ${
                  done
                    ? 'bg-primary-600'
                    : current
                      ? 'border-2 border-primary-600 bg-white'
                      : 'border border-gray-200 bg-gray-50'
                }`}
              >
                {done ? (
                  <Text className="text-sm font-bold text-white">✓</Text>
                ) : (
                  <Text className={`text-sm font-semibold ${current ? 'text-primary-600' : 'text-gray-400'}`}>
                    {idx + 1}
                  </Text>
                )}
              </View>
              {/* Label + subtitle */}
              <View className="flex-1">
                <Text className={`text-sm font-semibold ${current ? 'text-primary-700' : done ? 'text-gray-900' : 'text-gray-500'}`}>
                  {step.label}
                </Text>
                <Text className="mt-0.5 text-xs text-gray-400">{step.subtitle}</Text>
              </View>
            </TouchableOpacity>

            {/* Vertical connector */}
            {idx < STEPS.length - 1 && (
              <View className="ml-6 h-4 w-0.5 bg-gray-100" style={{ marginLeft: 27 }} />
            )}
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared small components                                            */
/* ------------------------------------------------------------------ */
function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View className="mb-5">
      <Text className="text-xl font-bold text-gray-900">{title}</Text>
      <Text className="mt-1 text-sm text-gray-500">{subtitle}</Text>
    </View>
  );
}

function SubSectionLabel({ label }: { label: string }) {
  return (
    <View className="mb-3 mt-2 flex-row items-center">
      <View className="mr-2.5 h-5 w-1 rounded-full bg-primary-600" />
      <Text className="text-sm font-semibold uppercase tracking-wide text-gray-500">{label}</Text>
    </View>
  );
}

function Divider() {
  return <View className="my-5 h-px bg-gray-100" />;
}

/* ------------------------------------------------------------------ */
/*  License sub-card used in step 3                                    */
/* ------------------------------------------------------------------ */
function LicenseCard({
  color,
  letter,
  title,
  required,
  children,
}: {
  color: string;
  letter: string;
  title: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  const bgMap: Record<string, string> = {
    green: 'bg-green-100',
    blue: 'bg-blue-100',
    orange: 'bg-orange-100',
    purple: 'bg-purple-100',
  };
  const textMap: Record<string, string> = {
    green: 'text-green-700',
    blue: 'text-blue-700',
    orange: 'text-orange-700',
    purple: 'text-purple-700',
  };
  return (
    <View className="mb-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <View className="mb-4 flex-row items-center">
        <View className={`mr-3 h-9 w-9 items-center justify-center rounded-full ${bgMap[color]}`}>
          <Text className={`text-base font-bold ${textMap[color]}`}>{letter}</Text>
        </View>
        <View>
          <Text className="text-base font-semibold text-gray-900">{title}</Text>
          <Text className="text-xs text-gray-400">{required ? 'Required' : 'Optional'}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

/* ================================================================== */
/*  Main Screen Component                                              */
/* ================================================================== */
export default function NewFirmScreen() {
  const { member } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = Platform.OS === 'web' && width >= 768;

  // Use auto-save form hook
  const {
    formData: form,
    setFormData: setForm,
    currentStep: activeSection,
    setCurrentStep: setActiveSection,
    isDrafting,
    lastSaved,
    deleteDraft,
    hasUnsavedChanges,
  } = useAccountForm(member?.user_id);

  const [documents, setDocuments] = useState<{ name: string; uri: string }[]>([]);
  const [applicantPhoto, setApplicantPhoto] = useState<{ name: string; uri: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [missingRequiredFields, setMissingRequiredFields] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const requiredFields: Array<keyof typeof form> = [
    'firm_name',
    'firm_address',
    'partner_proprietor_name',
    'mobile_number',
    'ifms_number',
    'seed_cotton_license_number',
  ];

  const getSectionForField = (field: keyof typeof form) => {
    if (field === 'partner_proprietor_name' || field === 'mobile_number') return 1;
    if (field === 'seed_cotton_license_number') return 2;
    return 0;
  };

  const fieldHasError = (field: keyof typeof form) =>
    missingRequiredFields.includes(field) || !!fieldErrors[field];

  const getFieldError = (field: keyof typeof form): string | undefined => {
    return fieldErrors[field];
  };

  const update = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (value.trim()) {
      setMissingRequiredFields((prev) => prev.filter((f) => f !== key));
      setFieldErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
    }
  };

  // Validate current step before moving forward
  const validateStep = (stepIndex: number): boolean => {
    setFieldErrors({});

    if (stepIndex === 0) {
      // Validate business details
      const result = validateForm(form, businessDetailsSchema);
      if (!result.isValid) {
        setFieldErrors(result.errors);
        return false;
      }
    } else if (stepIndex === 1) {
      // Validate personal details
      const result = validateForm(form, personalDetailsSchema);
      if (!result.isValid) {
        setFieldErrors(result.errors);
        return false;
      }
    } else if (stepIndex === 2) {
      // Validate license details
      const result = validateForm(form, licenseDetailsSchema);
      if (!result.isValid) {
        setFieldErrors(result.errors);
        return false;
      }
    }

    return true;
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: true,
      });
      if (!result.canceled && result.assets) {
        setDocuments((prev) => [
          ...prev,
          ...result.assets.map((a) => ({ name: a.name, uri: a.uri })),
        ]);
      }
    } catch {
      // cancelled
    }
  };

  const pickApplicantPhoto = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        multiple: false,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setApplicantPhoto({ name: asset.name, uri: asset.uri });
      }
    } catch {
      // cancelled
    }
  };

  const handleSubmit = async () => {
    if (!member) return;

    const missingFields = requiredFields.filter((field) => !String(form[field] || '').trim());
    if (missingFields.length > 0) {
      const firstMissingSection = missingFields.reduce(
        (minSection, field) => Math.min(minSection, getSectionForField(field)),
        STEPS.length - 1
      );
      setMissingRequiredFields(missingFields as string[]);
      setActiveSection(firstMissingSection);
      setError('Please fill in all required fields (firm, contact, IFMS, and seed cotton license details).');
      return;
    }

    const licenseNumber = String(form.seed_cotton_license_number || '').trim();
    const registrationNumber = String(form.ifms_number || '').trim();

    let existingAccountId: string | null = null;
    const { data: existingAccount } = await supabase
      .from('accounts')
      .select('id, documents_urls, applicant_photo_url')
      .eq('id', member.id)
      .single();

    if (existingAccount?.id) {
      existingAccountId = existingAccount.id;
    }

    setLoading(true);
    setError('');
    setMissingRequiredFields([]);

    const documentUrls: string[] = [];
    for (const doc of documents) {
      try {
        const filePath = `${member.id}/${Date.now()}_${doc.name}`;
        const response = await fetch(doc.uri);
        const blob = await response.blob();

        const { data } = await supabase.storage
          .from(STORAGE_BUCKETS.documents)
          .upload(filePath, blob, { contentType: blob.type });

        if (data) documentUrls.push(data.path);
      } catch (err) {
        console.error('Upload error:', err);
      }
    }

    let applicantPhotoUrl: string | null = null;
    if (applicantPhoto) {
      try {
        const filePath = `${member.id}/photo_${Date.now()}_${applicantPhoto.name}`;
        const response = await fetch(applicantPhoto.uri);
        const blob = await response.blob();

        const { data } = await supabase.storage
          .from(STORAGE_BUCKETS.documents)
          .upload(filePath, blob, { contentType: blob.type });

        if (data?.path) {
          applicantPhotoUrl = data.path;
        }
      } catch (err) {
        console.error('Photo upload error:', err);
      }
    }

    const mergedDocumentsUrls = existingAccount
      ? Array.from(new Set([...(existingAccount.documents_urls || []), ...documentUrls]))
      : documentUrls;

    const mergedApplicantPhotoUrl = applicantPhotoUrl ?? existingAccount?.applicant_photo_url ?? null;

    const basePayload = {
      firm_name: form.firm_name,
      firm_type: 'other' as const,
      license_number: licenseNumber,
      registration_number: registrationNumber,
      gst_number: form.gst_number || null,
      firm_address: form.firm_address,
      contact_phone: form.mobile_number,
      contact_email: form.email_id,
      firm_pin_code: form.firm_pin_code || null,
      partner_proprietor_name: form.partner_proprietor_name,
      whatsapp_number: form.whatsapp_number || null,
      aadhaar_card_number: form.aadhaar_card_number || null,
      ifms_number: registrationNumber,
      seed_cotton_license_number: licenseNumber,
      seed_cotton_license_expiry: form.seed_cotton_license_expiry || null,
      sarthi_id_cotton: form.sarthi_id_cotton || null,
      seed_general_license_number: form.seed_general_license_number || null,
      seed_general_license_expiry: form.seed_general_license_expiry || null,
      sarthi_id_general: form.sarthi_id_general || null,
      pesticide_license_number: form.pesticide_license_number || null,
      pesticide_license_expiry: form.pesticide_license_expiry || null,
      fertilizer_license_number: form.fertilizer_license_number || null,
      fertilizer_license_expiry: form.fertilizer_license_expiry || null,
      residence_address: form.residence_address || null,
      residence_pin_code: form.residence_pin_code || null,
      applicant_photo_url: mergedApplicantPhotoUrl,
      documents_urls: mergedDocumentsUrls,
    };

    const { error: submitError } = existingAccountId
      ? await supabase
          .from('accounts')
          .update({
            ...basePayload,
            approval_status: 'pending',
            rejection_reason: null,
            reviewed_by: null,
            reviewed_at: null,
          })
          .eq('id', existingAccountId)
      : await supabase.from('accounts').insert({
          ...basePayload,
        });

    setLoading(false);

    if (submitError) {
      if (submitError.code === '23505' || submitError.message.includes('duplicate')) {
        setError(
          'A firm with this license or registration number already exists. If it is your firm, open it from the Firms list and update it (don\'t register it again). If it belongs to someone else, contact admin.'
        );
      } else {
        setError(submitError.message);
      }
      return;
    }

    // Clear draft after successful submission
    await deleteDraft();
    router.back();
  };

  const goNext = () => {
    if (validateStep(activeSection)) {
      setActiveSection((prev) => Math.min(STEPS.length - 1, prev + 1));
    }
  };
  const goPrev = () => setActiveSection((prev) => Math.max(0, prev - 1));

  /* ---- Form section content (shared between web and mobile) ---- */
  const renderFormContent = () => (
    <>
      {/* ========== STEP 1: BUSINESS ========== */}
      {activeSection === 0 && (
        <View className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <SectionHeader
            title="Business Details"
            subtitle="Enter your firm's registration and statutory information"
          />

          <SubSectionLabel label="Firm Information" />
          <Input
            label="Firm Name *"
            placeholder="Enter your firm name"
            value={form.firm_name}
            onChangeText={(v) => update('firm_name', v)}
            error={getFieldError('firm_name')}
          />
          <Input
            label="Address of Firm *"
            placeholder="Complete firm address"
            value={form.firm_address}
            onChangeText={(v) => update('firm_address', v)}
            multiline
            numberOfLines={3}
            error={getFieldError('firm_address')}
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Input
                label="PIN Code"
                placeholder="e.g. 440001"
                value={form.firm_pin_code}
                onChangeText={(v) => update('firm_pin_code', v)}
                keyboardType="numeric"
                className="mb-0"
                error={getFieldError('firm_pin_code')}
              />
            </View>
            <View className="flex-1">
              <Input
                label="GST Number"
                placeholder="22AAAAA0000A1Z5"
                value={form.gst_number}
                onChangeText={(v) => update('gst_number', v)}
                className="mb-0"
                error={getFieldError('gst_number')}
              />
            </View>
          </View>

          <Divider />

          <SubSectionLabel label="Government Registration" />
          <Input
            label="IFMS Number *"
            placeholder="Enter IFMS number"
            value={form.ifms_number}
            onChangeText={(v) => update('ifms_number', v)}
            error={getFieldError('ifms_number')}
            className="mb-0"
          />
        </View>
      )}

      {/* ========== STEP 2: PERSONAL ========== */}
      {activeSection === 1 && (
        <View className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <SectionHeader
            title="Personal Details"
            subtitle="Your identity, contact information and residential address"
          />

          <SubSectionLabel label="Identity" />
          <Input
            label="Name of Partner / Proprietor *"
            placeholder="Full name"
            value={form.partner_proprietor_name}
            onChangeText={(v) => update('partner_proprietor_name', v)}
            error={getFieldError('partner_proprietor_name')}
          />
          <Input
            label="Aadhaar Card Number"
            placeholder="XXXX XXXX XXXX"
            value={form.aadhaar_card_number}
            onChangeText={(v) => update('aadhaar_card_number', v)}
            keyboardType="numeric"
            className="mb-0"
            error={getFieldError('aadhaar_card_number')}
          />

          <Divider />

          <SubSectionLabel label="Contact" />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Input
                label="Mobile Number *"
                placeholder="Mobile"
                value={form.mobile_number}
                onChangeText={(v) => update('mobile_number', v)}
                keyboardType="phone-pad"
                error={getFieldError('mobile_number')}
              />
            </View>
            <View className="flex-1">
              <Input
                label="WhatsApp Number"
                placeholder="WhatsApp"
                value={form.whatsapp_number}
                onChangeText={(v) => update('whatsapp_number', v)}
                keyboardType="phone-pad"
                error={getFieldError('whatsapp_number')}
              />
            </View>
          </View>
          <Input
            label="Email ID"
            placeholder="email@example.com"
            value={form.email_id}
            onChangeText={(v) => update('email_id', v)}
            keyboardType="email-address"
            autoCapitalize="none"
            className="mb-0"
          />

          <Divider />

          <SubSectionLabel label="Residence" />
          <Input
            label="Residence Address"
            placeholder="Complete residential address"
            value={form.residence_address}
            onChangeText={(v) => update('residence_address', v)}
            multiline
            numberOfLines={3}
          />
          <Input
            label="Residence PIN Code"
            placeholder="e.g. 440001"
            value={form.residence_pin_code}
            onChangeText={(v) => update('residence_pin_code', v)}
            keyboardType="numeric"
            className="mb-0"
          />
        </View>
      )}

      {/* ========== STEP 3: LICENSES ========== */}
      {activeSection === 2 && (
        <View>
          {!isWide && (
            <View className="mb-4">
              <Text className="text-xl font-bold text-gray-900">License Details</Text>
              <Text className="mt-1 text-sm text-gray-500">
                Add your seed, pesticide, and fertilizer license information
              </Text>
            </View>
          )}

          {/* On web, show licenses in a 2-column grid */}
          <View className={isWide ? 'flex-row flex-wrap gap-3' : ''}>
            <View className={isWide ? 'min-w-[48%] flex-1' : ''}>
              <LicenseCard color="green" letter="C" title="Seed Cotton License" required>
                <Input
                  label="License Number *"
                  placeholder="Cotton license number"
                  value={form.seed_cotton_license_number}
                  onChangeText={(v) => update('seed_cotton_license_number', v)}
                  error={getFieldError('seed_cotton_license_number')}
                />
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Input
                      label="Expiry Date"
                      placeholder="DD/MM/YYYY"
                      value={form.seed_cotton_license_expiry}
                      onChangeText={(v) => update('seed_cotton_license_expiry', v)}
                      error={getFieldError('seed_cotton_license_expiry')}
                      className="mb-0"
                    />
                  </View>
                  <View className="flex-1">
                    <Input
                      label="Sarthi ID"
                      placeholder="Sarthi ID"
                      value={form.sarthi_id_cotton}
                      onChangeText={(v) => update('sarthi_id_cotton', v)}
                      error={getFieldError('sarthi_id_cotton')}
                      className="mb-0"
                    />
                  </View>
                </View>
              </LicenseCard>
            </View>

            <View className={isWide ? 'min-w-[48%] flex-1' : ''}>
              <LicenseCard color="blue" letter="G" title="Seed General License">
                <Input
                  label="License Number"
                  placeholder="General license number"
                  value={form.seed_general_license_number}
                  onChangeText={(v) => update('seed_general_license_number', v)}
                  error={getFieldError('seed_general_license_number')}
                />
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Input
                      label="Expiry Date"
                      placeholder="DD/MM/YYYY"
                      value={form.seed_general_license_expiry}
                      onChangeText={(v) => update('seed_general_license_expiry', v)}
                      error={getFieldError('seed_general_license_expiry')}
                      className="mb-0"
                    />
                  </View>
                  <View className="flex-1">
                    <Input
                      label="Sarthi ID"
                      placeholder="Sarthi ID"
                      value={form.sarthi_id_general}
                      onChangeText={(v) => update('sarthi_id_general', v)}
                      error={getFieldError('sarthi_id_general')}
                      className="mb-0"
                    />
                  </View>
                </View>
              </LicenseCard>
            </View>

            <View className={isWide ? 'min-w-[48%] flex-1' : ''}>
              <LicenseCard color="orange" letter="P" title="Pesticide License">
                <Input
                  label="License Number"
                  placeholder="Pesticide license number"
                  value={form.pesticide_license_number}
                  onChangeText={(v) => update('pesticide_license_number', v)}
                  error={getFieldError('pesticide_license_number')}
                />
                <Input
                  label="Expiry Date"
                  placeholder="DD/MM/YYYY"
                  value={form.pesticide_license_expiry}
                  onChangeText={(v) => update('pesticide_license_expiry', v)}
                  error={getFieldError('pesticide_license_expiry')}
                  className="mb-0"
                />
              </LicenseCard>
            </View>

            <View className={isWide ? 'min-w-[48%] flex-1' : ''}>
              <LicenseCard color="purple" letter="F" title="Fertilizer License">
                <Input
                  label="License Number"
                  placeholder="Fertilizer license number"
                  value={form.fertilizer_license_number}
                  onChangeText={(v) => update('fertilizer_license_number', v)}
                  error={getFieldError('fertilizer_license_number')}
                />
                <Input
                  label="Expiry Date"
                  placeholder="DD/MM/YYYY"
                  value={form.fertilizer_license_expiry}
                  onChangeText={(v) => update('fertilizer_license_expiry', v)}
                  error={getFieldError('fertilizer_license_expiry')}
                  className="mb-0"
                />
              </LicenseCard>
            </View>
          </View>
        </View>
      )}

      {/* ========== STEP 4: UPLOADS ========== */}
      {activeSection === 3 && (
        <View className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <SectionHeader
            title="Upload Documents"
            subtitle="Attach your photograph and any supporting documents"
          />

          {/* On web, show photo + documents side by side */}
          <View className={isWide ? 'flex-row gap-6' : ''}>
            {/* Photo upload */}
            <View className={isWide ? 'flex-1' : ''}>
              <SubSectionLabel label="Applicant Photograph" />
              <TouchableOpacity
                onPress={pickApplicantPhoto}
                className="mb-2 items-center rounded-xl border-2 border-dashed border-primary-200 bg-primary-50/30 py-8"
              >
                {applicantPhoto?.uri ? (
                  <Image
                    source={{ uri: applicantPhoto.uri }}
                    className="h-28 w-28 rounded-xl bg-gray-100"
                  />
                ) : (
                  <View className="items-center">
                    <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-primary-100">
                      <Text className="text-2xl text-primary-700">+</Text>
                    </View>
                    <Text className="text-sm font-medium text-primary-700">
                      {isWide ? 'Click to upload photograph' : 'Tap to upload photograph'}
                    </Text>
                    <Text className="mt-1 text-xs text-gray-400">Passport-size photo recommended</Text>
                  </View>
                )}
              </TouchableOpacity>
              {applicantPhoto && (
                <TouchableOpacity onPress={() => setApplicantPhoto(null)}>
                  <Text className="mb-2 text-center text-xs font-medium text-red-500">Remove photograph</Text>
                </TouchableOpacity>
              )}
            </View>

            {!isWide && <Divider />}

            {/* Document upload */}
            <View className={isWide ? 'flex-1' : ''}>
              <SubSectionLabel label="Supporting Documents" />
              <TouchableOpacity
                onPress={pickDocument}
                className="mb-3 items-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 py-6"
              >
                <View className="items-center">
                  <View className="mb-2 h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                    <Text className="text-lg text-gray-500">+</Text>
                  </View>
                  <Text className="text-sm font-medium text-gray-600">
                    {isWide ? 'Click to upload documents' : 'Tap to upload documents'}
                  </Text>
                  <Text className="mt-1 text-xs text-gray-400">PDF or image files accepted</Text>
                </View>
              </TouchableOpacity>

              {documents.length > 0 && (
                <View>
                  {documents.map((doc, i) => (
                    <View
                      key={i}
                      className="mb-2 flex-row items-center rounded-xl border border-gray-100 bg-gray-50 px-4 py-3"
                    >
                      <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-primary-100">
                        <Text className="text-xs font-bold text-primary-700">
                          {doc.name.split('.').pop()?.toUpperCase() || 'FILE'}
                        </Text>
                      </View>
                      <Text className="flex-1 text-sm text-gray-700" numberOfLines={1}>{doc.name}</Text>
                      <TouchableOpacity
                        onPress={() => setDocuments((prev) => prev.filter((_, idx) => idx !== i))}
                        className="ml-2 rounded-full bg-red-50 px-2.5 py-1"
                      >
                        <Text className="text-xs font-medium text-red-500">Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {/* --- Navigation Buttons --- */}
      <View className="mt-6">
        <View className="flex-row gap-3">
          {activeSection > 0 && (
            <Button title="Back" variant="outline" onPress={goPrev} className="flex-1 rounded-xl" />
          )}
          {activeSection < STEPS.length - 1 ? (
            <Button title="Continue" onPress={goNext} className="flex-1 rounded-xl" size="lg" />
          ) : (
            <Button title="Submit Application" onPress={handleSubmit} loading={loading} className="flex-1 rounded-xl" size="lg" />
          )}
        </View>
        <Text className="mt-3 text-center text-xs text-gray-400">
          {activeSection < STEPS.length - 1
            ? `Next: ${STEPS[activeSection + 1].label}`
            : 'Review all details before submitting'}
        </Text>
      </View>
    </>
  );

  /* ================================================================ */
  /*  RENDER: Web (wide) layout  vs  Mobile layout                     */
  /* ================================================================ */

  if (isWide) {
    // ---- WEB: page-like layout with sidebar stepper ----
    return (
      <ScrollView
        className="flex-1 bg-gray-50"
        contentContainerClassName="min-h-full"
        keyboardShouldPersistTaps="handled"
      >
        {/* Full-width header banner */}
        <View className="bg-primary-700 px-8 py-8">
          <View className="mx-auto w-full max-w-5xl">
            <Text className="text-2xl font-bold text-white">NDADA Membership Application</Text>
            <Text className="mt-1 text-base text-primary-200">
              Complete the form below to register your firm, submit supporting details, and continue to payment.
            </Text>
          </View>
        </View>

        {/* Error banner */}
        {error ? (
          <View className="mx-auto mt-4 w-full max-w-5xl px-8">
            <View className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <Text className="text-sm font-medium text-red-700">{error}</Text>
            </View>
          </View>
        ) : null}

        {/* Auto-save indicator */}
        {isDrafting || lastSaved ? (
          <View className="mx-auto mt-2 w-full max-w-5xl px-8">
            <View className="rounded-lg bg-blue-50 px-3 py-2">
              <Text className="text-xs text-blue-600">
                {isDrafting ? '💾 Saving draft...' : lastSaved ? `✓ Saved at ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Sidebar + Form side-by-side */}
        <View className="mx-auto w-full max-w-5xl flex-row gap-6 px-8 py-8">
          {/* Left: Sidebar stepper (sticky-like via self-start) */}
          <View style={{ position: 'sticky' as 'relative', top: 24, alignSelf: 'flex-start' }}>
            <WebSidebar active={activeSection} onPress={setActiveSection} />
          </View>

          {/* Right: Form content */}
          <View className="flex-1">
            {renderFormContent()}
          </View>
        </View>
      </ScrollView>
    );
  }

  // ---- MOBILE: original stacked layout ----
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerClassName="pb-10" keyboardShouldPersistTaps="handled">
        {/* Top Header */}
        <View className="bg-primary-700 px-5 pb-10 pt-6">
          <Text className="text-center text-lg font-bold text-white">NDADA Membership Application</Text>
          <Text className="mt-1 text-center text-sm text-primary-200">
            Step {activeSection + 1} of {STEPS.length}
          </Text>
        </View>

        {/* Stepper Card (overlaps header) */}
        <View className="mx-4 -mt-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <MobileStepIndicator active={activeSection} onPress={setActiveSection} />
        </View>

        {/* Error Banner */}
        {error ? (
          <View className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <Text className="text-sm font-medium text-red-700">{error}</Text>
          </View>
        ) : null}

        {/* Auto-save indicator */}
        {isDrafting || lastSaved ? (
          <View className="mx-4 mt-2 rounded-lg bg-blue-50 px-3 py-2">
            <Text className="text-xs text-blue-600">
              {isDrafting ? '💾 Saving draft...' : lastSaved ? `✓ Saved at ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
            </Text>
          </View>
        ) : null}

        {/* Section Content */}
        <View className="mt-5 px-4">
          {renderFormContent()}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
