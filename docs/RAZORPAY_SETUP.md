# Razorpay Integration Implementation Guide

## Overview

This document provides step-by-step instructions to fully implement Razorpay payment integration in the NDADA app following the official Razorpay documentation flow (Orders → Checkout → Signature Verification → Webhook).

## Prerequisites

- Razorpay account (https://dashboard.razorpay.com)
- Test mode API keys configured
- Environment variables set up
- Supabase project configured

## Quick Setup Checklist

- [ ] Get API credentials from Razorpay dashboard
- [ ] Set environment variables
- [ ] Apply database migration
- [ ] Deploy Supabase functions
- [ ] Update app configuration
- [ ] Test payment flow

## Step 1: Get Razorpay Credentials

### 1.1 Access Razorpay Dashboard

1. Go to https://dashboard.razorpay.com
2. Sign in to your Razorpay account
3. Navigate to **Settings → API Keys**

### 1.2 Get Test Mode Keys

In the **API Keys** section:

- Copy **Key ID** (starts with `rzp_test_`)
- Copy **Key Secret** (keep this secure)

### 1.3 Get Webhook Secret

1. Navigate to **Settings → Webhooks**
2. Create a new webhook endpoint:
   - **URL**: `https://your-app.supabase.co/functions/v1/razorpay-webhook`
   - **Events**: Select all payment-related events
   - Check "Active" to enable
3. Copy the **Signing Secret**

## Step 2: Configure Environment Variables

### 2.1 Server-Side Environment (.env.production)

```env
# Razorpay API Credentials
RAZORPAY_KEY_ID=rzp_test_XXXXXXXX
RAZORPAY_KEY_SECRET=XXXXXXXX
RAZORPAY_WEBHOOK_SECRET=whsec_XXXXXXXX

# Registration Fee Configuration
REGISTRATION_FEE_AMOUNT_INR=300
REGISTRATION_FEE_CURRENCY=INR

# App Configuration
APP_URL=https://your-app.com
```

### 2.2 Client-Side Environment (.env.local or .env.production)

```env
EXPO_PUBLIC_RAZORPAY_KEY_ID=rzp_test_XXXXXXXX
```

### 2.3 Set in Supabase

For Supabase Edge Functions:

1. Navigate to your Supabase project
2. Go to **Settings → Edge Functions**
3. Click on each function and add secrets:
   - `razorpay-create-order`
   - `razorpay-verify-signature`
   - `razorpay-webhook`

Set these secrets for all three functions:

```
RAZORPAY_KEY_ID = rzp_test_XXXXXXXX
RAZORPAY_KEY_SECRET = XXXXXXXX
RAZORPAY_WEBHOOK_SECRET = whsec_XXXXXXXX
REGISTRATION_FEE_AMOUNT_INR = 300
REGISTRATION_FEE_CURRENCY = INR
APP_URL = https://your-app.com
```

## Step 3: Apply Database Migration

The migration file `039_razorpay_orders_integration.sql` creates:

- `orders` table - for tracking Razorpay orders
- `order_items` table - for itemized charges
- `payment_signatures` table - for signature verification records
- Indexes and RLS policies

### 3.1 Apply in Supabase

1. Go to your Supabase project
2. Navigate to **SQL Editor**
3. Click **New query**
4. Copy contents of `supabase/migrations/039_razorpay_orders_integration.sql`
5. Click **Run**

Or use the migration CLI:

```bash
supabase db push
```

### 3.2 Verify Tables Created

Check that these tables exist:

- `public.orders`
- `public.order_items`
- `public.payment_signatures`

## Step 4: Deploy Supabase Functions

Three functions need to be deployed:

### 4.1 Razorpay Create Order

```bash
# Deploy the function
supabase functions deploy razorpay-create-order

# Or manually:
# Copy supabase/functions/razorpay-create-order/index.ts to your Supabase project
```

**What it does**:

- Creates a Razorpay Order (Stage I)
- Stores order in database
- Returns order_id and details to client

### 4.2 Razorpay Verify Signature

```bash
supabase functions deploy razorpay-verify-signature
```

**What it does**:

- Verifies HMAC-SHA256 signature
- Updates order status to "attempted"
- Creates payment record
- **Critical security step** - prevents payment tampering

### 4.3 Razorpay Webhook

```bash
supabase functions deploy razorpay-webhook
```

**What it does**:

- Receives payment_link.paid events
- Verifies webhook signature
- Updates payment status to "paid"
- Triggers certificate generation

### 4.4 Verify Deployments

```bash
# List deployed functions
supabase functions list

# Check logs
supabase functions logs razorpay-create-order
```

## Step 5: Update App Configuration

### 5.1 Update Constants

File: `constants/index.ts`

```typescript
// Razorpay Configuration
export const RAZORPAY_KEY_ID = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || "";

// Registration Fee
export const REGISTRATION_FEE_AMOUNT_INR = 300;
export const REGISTRATION_FEE_CURRENCY = "INR";

// Membership Plan Details
export const MEMBERSHIP_PLAN_NAME = "Annual Membership";
export const MEMBERSHIP_VALIDITY_LABEL = "12 months";
export const MEMBERSHIP_SUPPORT_EMAIL = "support@ndada.com";
```

### 5.2 Install React Native Razorpay (if needed)

For React Native:

```bash
npm install react-native-razorpay
# or
yarn add react-native-razorpay

# For Expo
expo install react-native-razorpay
```

### 5.3 Update Payment Screen

Option A: Use the new `RazorpayCheckout` component:

```typescript
// app/(dashboard)/payment.tsx
import { RazorpayCheckout } from '@/components/payment/RazorpayCheckout';

export default function PaymentScreen() {
  return (
    <ScrollView>
      {/* ... other content ... */}
      <RazorpayCheckout />
    </ScrollView>
  );
}
```

Option B: Integrate into existing payment.tsx manually:

```typescript
const handleCreateOrder = async () => {
  const { data, error } = await supabase.functions.invoke(
    "razorpay-create-order",
    {
      body: { member_id: member.id },
    },
  );
  // ... handle response
};
```

## Step 6: Test Payment Flow

### 6.1 Test Environment Setup

1. Ensure you're using **Test Mode** keys (rzp*test*\*)
2. Use test cards provided by Razorpay

### 6.2 Complete Test Flow

**Step 1: Create Order**

```bash
curl -X POST http://localhost:3000/api/razorpay-create-order \
  -H "Authorization: Bearer YOUR_TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"member_id": "your-member-id"}'

# Expected Response:
{
  "id": "order_IluGWxBm9U8zJ8",
  "entity": "order",
  "amount": 50000,
  "status": "created",
  ...
}
```

**Step 2: Open Checkout**

- Use the returned order_id
- Open Razorpay checkout
- Use test card: 4111 1111 1111 1111

**Step 3: Verify Signature**

```bash
curl -X POST http://localhost:3000/api/razorpay-verify-signature \
  -H "Authorization: Bearer YOUR_TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "razorpay_order_id": "order_IluGWxBm9U8zJ8",
    "razorpay_payment_id": "pay_IH4NVgf4Dreq1l",
    "razorpay_signature": "0d4e745a1838664ad6c9c9902212a32d627d68e917290b0ad5f08ff4561bc50f"
  }'

# Expected Response:
{
  "verified": true,
  "order_id": "order_IluGWxBm9U8zJ8",
  "payment_id": "pay_IH4NVgf4Dreq1l"
}
```

### 6.3 Test Cards

| Card Type          | Card Number         | CVV | Expiry     | Result  |
| ------------------ | ------------------- | --- | ---------- | ------- |
| Visa Success       | 4111 1111 1111 1111 | 123 | Any future | Success |
| Visa Failure       | 4222 2222 2222 2222 | 123 | Any future | Failure |
| Mastercard Success | 5555 5555 5555 4444 | 123 | Any future | Success |
| Mastercard Failure | 5105 1051 0510 5100 | 123 | Any future | Failure |

### 6.4 Test UPI

Use: `success@razorpay`

### 6.5 Check Webhook

1. Open Razorpay dashboard
2. Go to **Settings → Webhooks**
3. Find your webhook endpoint
4. Click the three dots → **View Events**
5. Check if `payment_link.paid` event was received

## Step 7: Production Deployment

### 7.1 Get Live Credentials

1. Switch to **Live Mode** in Razorpay dashboard
2. Get **Live Key ID** and **Live Key Secret**
3. Create **Live Mode** webhook

### 7.2 Update Environment Variables

Replace test credentials with live ones:

```env
# Production
RAZORPAY_KEY_ID=rzp_live_XXXXXXXX
RAZORPAY_KEY_SECRET=XXXXXXXX
RAZORPAY_WEBHOOK_SECRET=whsec_XXXXXXXX
```

### 7.3 Test Live Payments

Before going fully live:

1. Process a small test transaction
2. Verify it appears in Razorpay dashboard
3. Confirm webhook is received
4. Verify payment status updates in database

### 7.4 Monitor Payments

**Razorpay Dashboard**:

- Go to **Transactions** to see all payments
- Monitor **Payment Failures** for issues
- Check **Webhook Events** for integration errors

**NDADA Database**:

- Query `payments` table for payment records
- Query `orders` table for order status
- Check `payment_signatures` for verification attempts

## Troubleshooting

### Issue: "The id provided does not exist"

**Cause**: API key mismatch between order creation and checkout

**Solution**:

1. Verify you're using the same API key ID
2. Check test vs. live key mismatch
3. Ensure all functions have correct secrets

### Issue: "Blocked by CORS policy"

**Cause**: Making API calls from client instead of server

**Solution**:

1. Ensure all Razorpay API calls are in Edge Functions (server-side)
2. Only Razorpay Checkout script runs on client
3. Signature verification happens server-side

### Issue: "Signature verification failed"

**Cause**: Tampered payment data or incorrect secret

**Solution**:

1. Check webhook secret is correct
2. Verify timing-safe comparison is used
3. Check signature generation formula: HMAC-SHA256(order_id + "|" + payment_id, secret)

### Issue: Webhook not received

**Cause**: Webhook URL not accessible or misconfigured

**Solution**:

1. Verify webhook URL is public and accessible
2. Check webhook secret in Razorpay dashboard
3. Monitor Razorpay logs for delivery failures
4. Test webhook manually in Razorpay dashboard

### Issue: Payment stuck in "pending" status

**Cause**: Webhook not received or verification failed

**Solution**:

1. Check payment_signatures table for verification attempts
2. Manually trigger webhook in Razorpay dashboard
3. Check function logs for errors
4. Verify order exists in database

## Architecture Summary

### Database Tables

```
accounts
  ├── user_id
  ├── membership_id
  ├── payment_status (pending/processing/paid/failed/expired)
  └── ...

orders (NEW)
  ├── razorpay_order_id
  ├── member_id FK
  ├── amount
  ├── status (created/attempted/paid)
  └── ...

payments
  ├── razorpay_order_id FK
  ├── razorpay_payment_id
  ├── razorpay_payment_link_id
  ├── status
  └── ...

payment_signatures (NEW)
  ├── razorpay_signature
  ├── razorpay_order_id
  ├── razorpay_payment_id
  ├── is_verified
  └── ...
```

### Payment Flow

```
1. User clicks "Pay" on client
   ↓
2. Client calls razorpay-create-order (server)
   → Creates order in Razorpay
   → Returns order_id
   ↓
3. Client opens Razorpay Checkout
   → User enters payment details
   → Razorpay processes payment
   ↓
4. Checkout success
   → Returns razorpay_payment_id, razorpay_signature
   ↓
5. Client calls razorpay-verify-signature (server)
   → Verifies HMAC-SHA256 signature
   → Updates order status
   ↓
6. Razorpay webhook: payment_link.paid
   → Updates payment status to "paid"
   → Updates account payment_status to "paid"
```

## Support

For issues or questions:

1. Check logs in Supabase Edge Function logs
2. Review RAZORPAY_INTEGRATION.md documentation
3. Contact Razorpay support: https://support.razorpay.com
4. Check NDADA project documentation

## References

- [Razorpay Orders API](https://razorpay.com/docs/api/orders/)
- [Razorpay Checkout](https://razorpay.com/docs/payments/checkout/)
- [Payment Signature Verification](https://razorpay.com/docs/payments/payment-signature-verification/)
- [Razorpay Webhooks](https://razorpay.com/docs/webhooks/)
