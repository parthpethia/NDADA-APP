import { z } from 'zod';

/**
 * Validation Schemas using Zod
 * Centralized form validation for the NDADA app
 *
 * IMPORTANT: These schemas must match the field names used in
 * AccountFormData (lib/useAccountForm.ts) and the registration
 * form (app/(dashboard)/firms/new.tsx).
 */

// ============================================================
// Helper validators
// ============================================================

const phoneNumberRegex = /^[6-9]\d{9}$/; // Indian mobile numbers
const aadhaarRegex = /^\d{4}\s?\d{4}\s?\d{4}$/; // Aadhaar format
const gstRegex = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z\d{1}$/; // GST format
const pinCodeRegex = /^\d{6}$/; // Indian PIN code

// ============================================================
// Step 1: Business Details Schema
// Fields: firm_name, firm_address, firm_pin_code, gst_number, ifms_number
// ============================================================
export const businessDetailsSchema = z.object({
  firm_name: z
    .string()
    .min(1, 'Firm name is required')
    .min(3, 'Firm name must be at least 3 characters')
    .max(255, 'Firm name must be less than 255 characters')
    .trim(),

  firm_address: z
    .string()
    .min(1, 'Firm address is required')
    .min(10, 'Firm address must be at least 10 characters')
    .max(500, 'Firm address must be less than 500 characters')
    .trim(),

  firm_pin_code: z
    .string()
    .optional()
    .refine(
      (val) => !val || pinCodeRegex.test(val),
      'PIN code must be a valid 6-digit number'
    ),

  gst_number: z
    .string()
    .optional()
    .refine(
      (val) => !val || gstRegex.test(val.toUpperCase()),
      'Please enter a valid GST number (format: 22AAAAA0000A1Z5)'
    ),

  ifms_number: z
    .string()
    .min(1, 'IFMS number is required')
    .min(3, 'IFMS number must be at least 3 characters')
    .max(50, 'IFMS number must be less than 50 characters')
    .trim(),
});

// ============================================================
// Step 2: Personal Details Schema
// Fields match AccountFormData: partner_proprietor_name,
// aadhaar_card_number, mobile_number, whatsapp_number,
// email_id, residence_address, residence_pin_code
// ============================================================
export const personalDetailsSchema = z.object({
  partner_proprietor_name: z
    .string()
    .min(1, 'Partner/Proprietor name is required')
    .min(3, 'Name must be at least 3 characters')
    .max(255, 'Name must be less than 255 characters')
    .trim(),

  aadhaar_card_number: z
    .string()
    .optional()
    .refine(
      (val) => !val || aadhaarRegex.test(val),
      'Please enter a valid Aadhaar number (format: XXXX XXXX XXXX)'
    ),

  mobile_number: z
    .string()
    .min(1, 'Mobile number is required')
    .refine(
      (val) => phoneNumberRegex.test(val.replace(/\s/g, '')),
      'Please enter a valid 10-digit mobile number starting with 6-9'
    ),

  whatsapp_number: z
    .string()
    .optional()
    .refine(
      (val) => !val || phoneNumberRegex.test(val.replace(/\s/g, '')),
      'Please enter a valid 10-digit WhatsApp number'
    ),

  email_id: z
    .string()
    .optional()
    .refine(
      (val) => !val || z.string().email().safeParse(val).success,
      'Please enter a valid email address'
    ),

  residence_address: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.length >= 10,
      'Residence address must be at least 10 characters if provided'
    ),

  residence_pin_code: z
    .string()
    .optional()
    .refine(
      (val) => !val || pinCodeRegex.test(val),
      'PIN code must be a valid 6-digit number'
    ),
});

// ============================================================
// Step 3: License Details Schema
// ============================================================
export const licenseDetailsSchema = z.object({
  seed_cotton_license_number: z
    .string()
    .min(1, 'Seed cotton license number is required')
    .min(3, 'License number must be at least 3 characters')
    .max(50, 'License number must be less than 50 characters')
    .trim(),

  seed_cotton_license_expiry: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^\d{2}\/\d{2}\/\d{4}$/.test(val) || /^\d{4}-\d{2}-\d{2}$/.test(val),
      'Please enter a valid date (DD/MM/YYYY or YYYY-MM-DD)'
    ),

  sarthi_id_cotton: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.length >= 3,
      'SARTHI ID must be at least 3 characters'
    ),

  seed_general_license_number: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.length >= 3,
      'License number must be at least 3 characters'
    ),

  seed_general_license_expiry: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^\d{2}\/\d{2}\/\d{4}$/.test(val) || /^\d{4}-\d{2}-\d{2}$/.test(val),
      'Please enter a valid date (DD/MM/YYYY or YYYY-MM-DD)'
    ),

  sarthi_id_general: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.length >= 3,
      'SARTHI ID must be at least 3 characters'
    ),

  pesticide_license_number: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.length >= 3,
      'License number must be at least 3 characters'
    ),

  pesticide_license_expiry: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^\d{2}\/\d{2}\/\d{4}$/.test(val) || /^\d{4}-\d{2}-\d{2}$/.test(val),
      'Please enter a valid date (DD/MM/YYYY or YYYY-MM-DD)'
    ),

  fertilizer_license_number: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.length >= 3,
      'License number must be at least 3 characters'
    ),

  fertilizer_license_expiry: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^\d{2}\/\d{2}\/\d{4}$/.test(val) || /^\d{4}-\d{2}-\d{2}$/.test(val),
      'Please enter a valid date (DD/MM/YYYY or YYYY-MM-DD)'
    ),
});

// ============================================================
// Combined: Full Account Schema
// ============================================================
export const fullAccountSchema = businessDetailsSchema
  .merge(personalDetailsSchema)
  .merge(licenseDetailsSchema);

// ============================================================
// Auth Schemas
// ============================================================
export const loginSchema = z.object({
  email: z
    .string()
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters'),
});

export const signupSchema = z.object({
  email: z
    .string()
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// ============================================================
// Payment Schema
// ============================================================
export const paymentSchema = z.object({
  amount: z
    .number()
    .positive('Amount must be greater than 0'),
  member_id: z
    .string()
    .uuid('Invalid member ID'),
});

// ============================================================
// Type exports for TypeScript
// ============================================================
export type BusinessDetails = z.infer<typeof businessDetailsSchema>;
export type PersonalDetails = z.infer<typeof personalDetailsSchema>;
export type LicenseDetails = z.infer<typeof licenseDetailsSchema>;
export type FullAccount = z.infer<typeof fullAccountSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;

// ============================================================
// Validation helper function
// ============================================================
export function validateForm(data: any, schema: z.ZodSchema) {
  const result = schema.safeParse(data);

  if (!result.success) {
    const errors: Record<string, string> = {};
    result.error.errors.forEach((err) => {
      const path = err.path.join('.');
      errors[path] = err.message;
    });
    return { isValid: false, errors };
  }

  return { isValid: true, errors: {}, data: result.data };
}

// ============================================================
// Get all errors for a field (for detailed error messages)
// ============================================================
export function getFieldErrors(data: any, schema: z.ZodSchema, fieldName: string) {
  const result = schema.safeParse(data);

  if (result.success) return [];

  return result.error.errors
    .filter((err) => err.path.join('.') === fieldName)
    .map((err) => err.message);
}
