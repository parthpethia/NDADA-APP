# NDADA Membership Platform — Setup Guide

## Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- A Supabase project (https://supabase.com)

## 1. Install Dependencies

```bash
cd ndada-app
npm install
```

## 2. Configure Environment Variables

```bash
cp .env.example .env
```

Fill in your values:

- `EXPO_PUBLIC_SUPABASE_URL` — from Supabase Dashboard > Settings > API
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — from Supabase Dashboard > Settings > API

Add your payment QR image to the app:

- Place your QR image at `assets/payment-qr.jpeg`

## 3. Setup Database

Run the SQL migration files in order in Supabase SQL Editor:

1. `supabase/migrations/001_initial_schema.sql` — creates all tables, triggers, indexes
2. `supabase/migrations/002_rls_policies.sql` — enables Row Level Security
3. `supabase/migrations/003_fraud_and_storage.sql` — fraud triggers + storage buckets/policies
4. `supabase/migrations/024_manual_payment_proofs_and_cert_upload.sql` — payment proof uploads + admin certificate uploads

Note: this project uses manual QR payments + screenshot proof uploads (no Stripe integration).

## 4. Create Admin User

After creating your first account, manually insert into `admin_users`:

```sql
INSERT INTO admin_users (user_id, email, role)
VALUES ('your-auth-user-uuid', 'admin@example.com', 'super_admin');
```

## 5. Deploy Supabase Edge Functions

Set secrets in Supabase Dashboard > Edge Functions > Secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL`

Deploy functions:

```bash
supabase functions deploy admin-actions
```

## 7. Run the App

```bash
npm run web        # Web
npm run android    # Android
npm run ios        # iOS
```

## 8. Build for Production

```bash
npm run build:web  # Static web export -> dist/
npx eas build      # Native builds via EAS
```

## Project Structure

```
app/              — Expo Router screens (auth, dashboard, admin, verify)
components/ui/    — Reusable UI components (Button, Input, Card, Badge, Select)
lib/              — Supabase client, auth provider, payment service, utils
hooks/            — Custom React hooks (useAdmin)
types/            — TypeScript type definitions
constants/        — App constants
supabase/
  migrations/     — SQL schema, RLS policies, fraud triggers
  functions/      — Edge Functions (admin-actions)
```

## Key Flows

1. **User registers** → auth.users + members table row created
2. **User adds firm** → firm row created, documents uploaded to Storage
3. **User pays ₹1500 (manual QR)** → upload payment screenshot → admin verifies → payment_status = paid
4. **Admin approves firm** → after payment verified
5. **Admin uploads certificate (JPEG)** → stored in Storage + linked in certificates table
6. **User downloads certificate** → JPEG from Storage
7. **Anyone verifies certificate** → /verify page with certificate ID
