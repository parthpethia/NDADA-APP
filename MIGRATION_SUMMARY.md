# Supabase Migration Summary (001-028)

## Changes Made in Each Migration

### 001_initial_schema.sql

- Creates base tables: `members`, `firms`, `payments`, `certificates`, `admin_users`, `fraud_flags`, `audit_logs`, `certificate_downloads`
- Creates enums: `firm_type`, `payment_status`, `approval_status`, `account_status`, `certificate_status`, `admin_role`
- Creates sequences: `membership_id_seq`, `certificate_id_seq`
- Creates triggers: `trg_generate_membership_id`, `trg_members_updated_at`, `trg_generate_certificate_id`, `trg_check_duplicate_phone`
- Creates functions: `generate_membership_id()`, `update_updated_at()`, `generate_certificate_id()`, `check_duplicate_phone()`
- Creates indexes on foreign keys and unique fields

### 002_rls_policies.sql

- Enables RLS on all tables
- Creates helper functions: `is_admin()`, `has_admin_role()`
- Creates RLS policies for all tables with role-based access control
- Defines storage policies for documents, certificates, id-proofs buckets

### 003_fraud_and_storage.sql

- Creates fraud detection triggers: `check_duplicate_license()`, `check_failed_payments()`
- Creates storage buckets: documents, certificates, id-proofs
- Adds storage policies for all buckets

### 004_auto_create_member.sql

- Creates `handle_new_user()` trigger on auth.users
- Auto-creates member record when new user signs up

### 005_membership_form_fields.sql

- Adds 18 new columns to firms table for NDADA form fields
- Backfills some data from existing columns

### 006-009: Search Path Fixes

- Sets search_path to `pg_catalog, public` for all functions to prevent security issues

### 010_optimize_rls_initplan_auth.sql

- Optimizes RLS policies to use `(select auth.uid())` instead of `auth.uid()` for better query performance

### 011-013: RLS Policy Consolidation

- Fixes multiple permissive policies issues on admin_users, certificates, fraud_flags
- Splits broad FOR ALL policies into specific INSERT, UPDATE, DELETE policies
- Restricts policies to authenticated/anon roles appropriately

### 014-023: Index Optimization

- Adds: `idx_certificate_downloads_certificate_id`, `idx_firms_reviewed_by`, `idx_fraud_flags_member_id`
- Drops redundant indexes: `idx_members_membership_id`, `idx_firms_license_number`, `idx_firms_registration_number`, `idx_certificates_certificate_id`, `idx_members_email`, `idx_firms_approval_status`, `idx_payments_member_id`, `idx_payments_stripe_session_id`

### 024_manual_payment_proofs_and_cert_upload.sql

- Adds `proof_url` column to payments
- Creates payment-proofs storage bucket
- Adds storage policies for payment proofs
- Adds admin certificate management policies

### 025-026: Stripe Removal

- Drops old Stripe payment fields: `stripe_session_id`, `stripe_payment_intent`
- Drops related Stripe index

### 027_razorpay_payment_links.sql

- Adds Razorpay fields to payments: `provider`, `razorpay_payment_link_id`, `razorpay_payment_link_url`, `razorpay_payment_id`, `provider_event`, `provider_payload`
- Adds indexes: `idx_payments_razorpay_payment_link_id`, `idx_payments_provider`

### 028_update_registration_fee_amount.sql

- Sets default payment amount to 30000 paise (₹300)

## Final Database State

### Tables

- **members**: User records with metadata
- **firms**: Business entity records
- **payments**: Payment records with Razorpay support
- **certificates**: Membership certificates
- **admin_users**: Admin user roles
- **fraud_flags**: Fraud detection records
- **audit_logs**: Admin action logs
- **certificate_downloads**: Certificate download tracking

### Final Indexes (after all drops and additions)

- members: idx_members_user_id, idx_members_phone
- firms: idx_firms_member_id, idx_firms_reviewed_by
- payments: idx_payments_razorpay_payment_link_id, idx_payments_provider
- certificates: idx_certificates_member_id
- admin_users: idx_admin_users_user_id
- fraud_flags: idx_fraud_flags_member_id, idx_fraud_flags_resolved
- audit_logs: idx_audit_logs_admin_id, idx_audit_logs_created_at
- certificate_downloads: idx_cert_downloads_member_id, idx_certificate_downloads_certificate_id

### Storage Buckets

- documents (private)
- certificates (private)
- id-proofs (private)
- payment-proofs (private)
