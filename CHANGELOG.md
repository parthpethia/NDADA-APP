# Changelog

All notable compliance and security improvements for the NDADA application are documented in this file.

## [1.1.0] - 2026-06-06

### Added
- **Privacy Policy & Terms of Service Screens**: Created [privacy-policy.tsx](file:///d:/Projects/ndada%20app/ndada-app/app/privacy-policy.tsx) and [terms.tsx](file:///d:/Projects/ndada%20app/ndada-app/app/terms.tsx) with native ScrollView designs and configured them in [RootLayout](file:///d:/Projects/ndada%20app/ndada-app/app/_layout.tsx).
- **Registration Consent Checkbox**: Added an interactive agreement checkbox, legal links, and validation logic in the registration form in [register.tsx](file:///d:/Projects/ndada%20app/ndada-app/app/(auth)/register.tsx).
- **Legal & Account Deletion in Profile**: Added a Legal section and a "Danger Zone" account deletion interface to [profile.tsx](file:///d:/Projects/ndada%20app/ndada-app/app/(dashboard)/profile.tsx).
- **Self-Service Account Deletion Endpoint**: Created the [delete-account](file:///d:/Projects/ndada%20app/ndada-app/supabase/functions/delete-account/index.ts) edge function to securely anonymize account details, clear uploaded media, and lock the auth profile.
- **Database Migration for Consent & Deletion**: Added [20260606000000_add_account_deletion_and_privacy_acceptance.sql](file:///d:/Projects/ndada%20app/ndada-app/supabase/migrations/20260606000000_add_account_deletion_and_privacy_acceptance.sql) to add consent flags and deletion metadata to `accounts`, updating the `handle_new_user()` trigger to copy values.
- **Aadhaar Masking Utility**: Created [aadhaar.ts](file:///d:/Projects/ndada%20app/ndada-app/lib/aadhaar.ts) and applied it across all member/firm detail screens.
- **Aadhaar Disclosure**: Added secure data handling disclosure text beneath the Aadhaar input in [new.tsx](file:///d:/Projects/ndada%20app/ndada-app/app/(dashboard)/firms/new.tsx).
- **Secrets Migration Documentation**: Created [SECRETS_MIGRATION.md](file:///d:/Projects/ndada%20app/ndada-app/docs/SECRETS_MIGRATION.md) to walk developers through secure remote secret setup.
- **Signing Guide**: Added [android-release-signing.md](file:///d:/Projects/ndada%20app/ndada-app/docs/android-release-signing.md) mapping production build signing setup.
- **Shared CORS utility**: Created [cors.ts](file:///d:/Projects/ndada%20app/ndada-app/supabase/functions/_shared/cors.ts) to restrict CORS origins to an approved allowlist.

### Changed
- **Removed Committed Secrets**: Removed server secrets from [.env](file:///d:/Projects/ndada%20app/ndada-app/.env), [.env.example](file:///d:/Projects/ndada%20app/ndada-app/.env.example), and [.env.local.example](file:///d:/Projects/ndada%20app/ndada-app/.env.local.example).
- **Enforced Security on Payment Link Creation**: Updated [razorpay-create-payment-link/index.ts](file:///d:/Projects/ndada%20app/ndada-app/supabase/functions/razorpay-create-payment-link/index.ts) to mandate user auth/ownership checks, rejecting unauthorized body overrides.
- **Removed Token Logging**: Cleaned up token logs and guarded diagnostic messages behind `__DEV__` in [payment.tsx](file:///d:/Projects/ndada%20app/ndada-app/app/(dashboard)/payment.tsx).
- **Hardened CORS Across All Edge Functions**: Applied the shared dynamic CORS checker to all 7 client-triggered edge functions.
- **Enabled Android R8/ProGuard**: Configured minification and resource shrinking in [gradle.properties](file:///d:/Projects/ndada%20app/ndada-app/android/gradle.properties) and added keep rules for key packages in [proguard-rules.pro](file:///d:/Projects/ndada%20app/ndada-app/android/app/proguard-rules.pro).
- **Release Signing Configurations**: Configured [build.gradle](file:///d:/Projects/ndada%20app/ndada-app/android/app/build.gradle) to sign release builds using production credentials when available, falling back gracefully to debug.
- **Canonical Membership Pricing**: Structured a single source of truth for membership pricing in [payment.ts](file:///d:/Projects/ndada%20app/ndada-app/constants/payment.ts) set to ₹300, aligning Metro envs and exports.

### Removed
- **Dead Code and Temp Files**: Purged empty `supabase/functions/stripe-webhook` directory, root-level Java crash logs, and test artifacts (`test-certificate.pdf`).
