# Database Schema Consolidation: One User → One Firm

## Overview

Changed the database structure from **one-to-many** (one user can register multiple firms) to **one-to-one** (one user registers exactly one firm with all details in a single row).

## 🗄️ Database Changes

### Migration Created

**File**: `supabase/migrations/029_consolidate_members_and_firms.sql`

**Key Changes:**

1. **New consolidated table**: `accounts` table
   - Combines all fields from `members` and `firms` into one table
   - One-to-one relationship with Supabase auth.users via `user_id`
   - Unique constraint on `user_id` enforces one account per user

2. **Data Migration**:
   - Automatically migrates existing data from `members` + `firms` tables
   - LEFT JOIN handles cases where users don't have firms yet
   - Original tables preserved for reference (can be archived later)

3. **Updated Foreign Keys**:
   - `payments` → references `accounts.id`
   - `certificates` → references `accounts.id`
   - `fraud_flags` → references `accounts.id`
   - `certificate_downloads` → references `accounts.id`

4. **Updated RLS Policies**:
   - All policies now reference `accounts` table
   - Storage policies updated for document uploads

5. **Updated Triggers**:
   - `handle_new_user_consolidated()` creates account records on signup
   - `check_duplicate_license_accounts()` prevents duplicate licenses

---

## 📝 Type System Updates

### File: `types/index.ts`

**Added:**

- `Account` type - new consolidated type containing all user + firm data
- `AccountWithDetails` - composite type for queries with related data

**Kept for Backward Compatibility:**

- `Member` type (legacy)
- `Firm` type (legacy)
- `MemberWithFirms` type (legacy)
- `MemberWithDetails` type (legacy)

---

## 🔧 Core Library Updates

### File: `lib/membership.ts`

**Changes:**

- Updated `getMembershipStage()` to work with single `Account` instead of `Member` + `Firm[]`
- Added `getMembershipStageLegacy()` for backward compatibility
- New logic checks `account.approval_status` directly instead of searching firms array

### File: `lib/auth.tsx`

**Changes:**

- Changed `member` context type from `Member` to `Account`
- Updated `fetchMember()` to query/create in `accounts` table
- Added default firm fields when creating new accounts

---

## 🔌 Edge Functions Updates

### File: `supabase/functions/razorpay-create-payment-link/index.ts`

- Query change: `members` → `accounts`

### File: `supabase/functions/generate-certificate/index.ts`

- Query change: `members` → `accounts`
- Removed firm approval check (now check `account.approval_status`)
- Changed from multi-firm lookup to single account

### File: `supabase/functions/admin-actions/index.ts`

**Major refactoring:**

- Action names changed:
  - `approve-firm` → `approve-account`
  - `reject-firm` → `reject-account`
  - `set-member-payment-status` → `set-payment-status`
- Parameter names: `member_id` → `account_id`, `firm_id` → `account_id`
- Simplified logic: no need to look up firm separately
- Functions renamed: `approveFirm()` → `approveAccount()`, etc.

### File: `supabase/functions/razorpay-webhook/index.ts`

- Query change: `members` → `accounts` when updating payment status

---

## 📱 UI Components Updates

### File: `app/(dashboard)/profile.tsx`

- Query: `members` → `accounts`

### File: `app/(dashboard)/firms/index.tsx`

**Major changes:**

- Displays single account's firm instead of list of firms
- Query: `members` → `accounts`
- Shows only one firm (or empty state if not registered)
- Button text: "Register a Firm" → "Register Your Firm" / "Edit Firm Details"

### File: `app/(dashboard)/firms/new.tsx`

**Major refactoring:**

- Removed multi-firm lookup by license/registration (only one firm per account)
- Query: `members` → `accounts`
- Insert/Update: `firms` → `accounts`
- Simplified form submission logic
- Removed `member_id` FK, now directly on `accounts.id`

### File: `app/(dashboard)/firms/[id].tsx`

- Type: `Firm` → `Account`
- Query: `members` → `accounts`
- Simplified delete operation (now clears firm fields instead of deleting record)

### File: `app/admin/index.tsx`

**Dashboard Stats:**

- `total_members`: Query `accounts` instead of `members`
- `total_firms`: Set equal to `total_members` (one-to-one relationship)
- `pending_reviews`: Query `accounts` with `approval_status = 'pending'`

### File: `app/admin/members.tsx`

**Major refactoring:**

- Type: `Member & { firms_count }` → `Account`
- Query: `members` + `firms(id)` → `accounts` simple select
- Removed firms count display (each account has exactly one firm)
- Added approval_status badge to display
- Updated admin action calls with new parameter names

---

## ✅ Migration Checklist

- [x] Create new `accounts` table with consolidated schema
- [x] Migrate existing data from `members` + `firms`
- [x] Update all foreign key references
- [x] Update RLS policies for new table
- [x] Update storage policies
- [x] Create new auth trigger for account creation
- [x] Update types to include `Account` type
- [x] Update `lib/membership.ts` logic
- [x] Update `lib/auth.tsx` authentication context
- [x] Update all 3 edge functions (razorpay, admin, generate-cert)
- [x] Update dashboard (profile, firms list, firm details, firm creation)
- [x] Update admin panel (members list, dashboard stats)

---

## 🔍 Verification Steps

1. **Build Check**: Run `npm run build` to verify TypeScript compilation
2. **Type Checking**: Ensure all `Account` type usages are correct
3. **Database Migration**: Verify `accounts` table has all expected columns
4. **Data Migration**: Check that old data is properly moved to `accounts`
5. **RLS Policies**: Verify row-level security works with new table
6. **Edge Functions**: Test all webhook and admin functions
7. **UI Screens**: Verify firm registration and display work correctly
8. **Admin Functions**: Test approval, rejection, and payment status updates

---

## 📊 Data Mapping Example

**Before (Two Tables):**

```
members table:
├── id: abc-123
├── user_id: user-456
├── full_name: "John Doe"
├── email: "john@example.com"
└── ...

firms table:
├── id: firm-789
├── member_id: abc-123  ← Foreign Key
├── firm_name: "ABC Trading"
├── license_number: "LIC-001"
└── ...
```

**After (One Table):**

```
accounts table:
├── id: abc-123
├── user_id: user-456
├── full_name: "John Doe"
├── email: "john@example.com"
├── firm_name: "ABC Trading"
├── license_number: "LIC-001"
└── ...
```

---

## 🎯 Key Benefits

1. **Simplified Schema**: One table instead of navigating two related tables
2. **Atomic Operations**: All user + firm data updates in single row
3. **Clearer Intent**: Enforces one-account-one-firm business rule at database level
4. **Reduced Complexity**: No need for JOINs in most queries
5. **Cleaner API**: Endpoints now deal with single `Account` type
6. **Better Performance**: Fewer table joins needed

---

## ⚠️ Breaking Changes

1. **API Changes**:
   - Old endpoints expecting `Member` now get `Account`
   - Admin actions use new parameter names

2. **Query Changes**:
   - All queries from `members`/`firms` → `accounts`
   - No more multi-firm lists in UI

3. **Business Logic**:
   - Users can no longer register multiple firms
   - Each registration creates one account with one firm

---

## 📋 Files Modified

- `supabase/migrations/029_consolidate_members_and_firms.sql` ✅
- `types/index.ts` ✅
- `lib/membership.ts` ✅
- `lib/auth.tsx` ✅
- `supabase/functions/razorpay-create-payment-link/index.ts` ✅
- `supabase/functions/generate-certificate/index.ts` ✅
- `supabase/functions/admin-actions/index.ts` ✅
- `supabase/functions/razorpay-webhook/index.ts` ✅
- `app/(dashboard)/profile.tsx` ✅
- `app/(dashboard)/firms/index.tsx` ✅
- `app/(dashboard)/firms/new.tsx` ✅
- `app/(dashboard)/firms/[id].tsx` ✅
- `app/admin/index.tsx` ✅
- `app/admin/members.tsx` ✅
