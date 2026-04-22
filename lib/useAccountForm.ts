/**
 * useAccountForm Hook
 *
 * Manages the form state for the account/firm registration form with:
 * - Auto-save to database (debounced)
 * - Draft persistence across page refreshes
 * - Step tracking
 * - Form validation
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { Account } from '@/types';

export interface AccountFormData {
  // Business Details (Step 1)
  firm_name: string;
  firm_type: 'proprietorship' | 'partnership' | 'private_limited' | 'llp' | 'other';
  license_number: string;
  registration_number: string;
  gst_number: string;
  firm_address: string;
  contact_phone: string;
  contact_email: string;
  firm_pin_code: string;
  ifms_number: string;

  // Personal Details (Step 2)
  partner_proprietor_name: string;
  aadhaar_card_number: string;
  whatsapp_number: string;
  mobile_number: string;
  email_id: string;
  residence_address: string;
  residence_pin_code: string;

  // License Details (Step 3)
  seed_cotton_license_number: string;
  seed_cotton_license_expiry: string;
  sarthi_id_cotton: string;
  seed_general_license_number: string;
  seed_general_license_expiry: string;
  sarthi_id_general: string;
  pesticide_license_number: string;
  pesticide_license_expiry: string;
  fertilizer_license_number: string;
  fertilizer_license_expiry: string;

  // Uploads (Step 4)
  applicant_photo_url?: string;
  documents_urls: string[];
}

export interface UseAccountFormReturn {
  formData: AccountFormData;
  setFormData: (data: AccountFormData | ((prev: AccountFormData) => AccountFormData)) => void;
  currentStep: number;
  setCurrentStep: (step: number | ((prev: number) => number)) => void;
  isDrafting: boolean;
  lastSaved: Date | null;
  saveDraft: () => Promise<void>;
  loadDraft: () => Promise<void>;
  deleteDraft: () => Promise<void>;
  hasUnsavedChanges: boolean;
}

const INITIAL_FORM_DATA: AccountFormData = {
  firm_name: '',
  firm_type: 'other',
  license_number: '',
  registration_number: '',
  gst_number: '',
  firm_address: '',
  contact_phone: '',
  contact_email: '',
  firm_pin_code: '',
  ifms_number: '',
  partner_proprietor_name: '',
  aadhaar_card_number: '',
  whatsapp_number: '',
  mobile_number: '',
  email_id: '',
  residence_address: '',
  residence_pin_code: '',
  seed_cotton_license_number: '',
  seed_cotton_license_expiry: '',
  sarthi_id_cotton: '',
  seed_general_license_number: '',
  seed_general_license_expiry: '',
  sarthi_id_general: '',
  pesticide_license_number: '',
  pesticide_license_expiry: '',
  fertilizer_license_number: '',
  fertilizer_license_expiry: '',
  applicant_photo_url: undefined,
  documents_urls: [],
};

export function useAccountForm(userId?: string): UseAccountFormReturn {
  const [formData, setFormData] = useState<AccountFormData>(INITIAL_FORM_DATA);
  const [currentStep, setCurrentStep] = useState(0);
  const [isDrafting, setIsDrafting] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [initialFormData, setInitialFormData] = useState<AccountFormData>(INITIAL_FORM_DATA);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load draft from database on mount
  const loadDraft = useCallback(async () => {
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from('account_drafts')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.warn('Failed to load draft:', error.message);
        return;
      }

      if (data) {
        const loadedData = { ...INITIAL_FORM_DATA, ...(data.form_data || {}) };
        setFormData(loadedData);
        setCurrentStep(data.current_step || 0);
        setInitialFormData(loadedData);
        setLastSaved(new Date(data.saved_at));
      }
    } catch (err) {
      console.warn('Error loading draft:', err);
    }
  }, [userId]);

  // Auto-save draft using UPSERT to avoid race conditions
  const saveDraft = useCallback(async () => {
    if (!userId) return;

    setIsDrafting(true);

    try {
      await supabase
        .from('account_drafts')
        .upsert(
          {
            user_id: userId,
            form_data: formData,
            current_step: currentStep,
            updated_at: new Date().toISOString(),
            saved_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      setLastSaved(new Date());
    } catch (err) {
      console.warn('Failed to save draft:', err);
    } finally {
      setIsDrafting(false);
    }
  }, [userId, formData, currentStep]);

  // Delete draft from database
  const deleteDraft = useCallback(async () => {
    if (!userId) return;

    try {
      await supabase
        .from('account_drafts')
        .delete()
        .eq('user_id', userId);

      setFormData(INITIAL_FORM_DATA);
      setCurrentStep(0);
      setLastSaved(null);
    } catch (err) {
      console.warn('Failed to delete draft:', err);
    }
  }, [userId]);

  // Debounced auto-save on form change (silent — user does not see this)
  useEffect(() => {
    if (!userId) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout (10 seconds of inactivity)
    saveTimeoutRef.current = setTimeout(() => {
      saveDraft();
    }, 10000);

    // Cleanup on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [userId, formData, currentStep, saveDraft]);

  // Load draft on mount
  useEffect(() => {
    loadDraft();
  }, [userId, loadDraft]);

  // Detect unsaved changes
  const hasUnsavedChanges = JSON.stringify(formData) !== JSON.stringify(initialFormData);

  return {
    formData,
    setFormData,
    currentStep,
    setCurrentStep,
    isDrafting,
    lastSaved,
    saveDraft,
    loadDraft,
    deleteDraft,
    hasUnsavedChanges,
  };
}
