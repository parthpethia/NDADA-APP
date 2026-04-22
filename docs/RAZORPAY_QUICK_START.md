# Razorpay Setup Verification Checklist - QUICK CHECK

**Use this checklist RIGHT NOW to verify everything is set up correctly**

---

## ✅ Current Status Verification

### 1. Code & Files Created

```bash
# Check these files exist:
✓ supabase/migrations/039_razorpay_orders_integration.sql
✓ supabase/functions/razorpay-create-order/index.ts
✓ supabase/functions/razorpay-verify-signature/index.ts
✓ components/payment/RazorpayCheckout.tsx
✓ docs/RAZORPAY_INTEGRATION.md
✓ docs/RAZORPAY_SETUP.md
✓ docs/RAZORPAY_SUMMARY.md
✓ docs/RAZORPAY_GO_LIVE_CHECKLIST.md
```

### 2. Environment Variables Check

**File: `.env` (check these are set)**

```bash
# Get from Razorpay Dashboard:
RAZORPAY_KEY_ID=???                           # ← Need to SET (test mode)
RAZORPAY_KEY_SECRET=???                       # ← Need to SET (test mode)
RAZORPAY_WEBHOOK_SECRET=???                   # ← Need to SET (test mode)

# App Configuration:
REGISTRATION_FEE_AMOUNT_INR=300               # ← Should already be set
REGISTRATION_FEE_CURRENCY=INR                 # ← Should already be set
APP_URL=???                                   # ← Need your app URL
```

**Status**: ⚠️ **ACTION REQUIRED** - Add test mode credentials

---

## 🔍 Pre-Deployment Checks

### Check 1: Database Schema

```bash
# Login to Supabase Dashboard
# Navigate to: SQL Editor → Run this query:

SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('orders', 'order_items', 'payment_signatures', 'payments');

# Expected: Should return 4 tables (or 3 if payments already existed)
```

**Status**: ⏳ **TODO** - Apply migration first

---

### Check 2: Environment Variables in Supabase

```bash
# Go to Supabase Dashboard:
# Settings → Edge Functions → [function name] → Configuration

# Verify these functions have these secrets:
# ├─ razorpay-create-order
# ├─ razorpay-verify-signature
# └─ razorpay-webhook

# Each should have:
- RAZORPAY_KEY_ID
- RAZORPAY_KEY_SECRET
- RAZORPAY_WEBHOOK_SECRET
- REGISTRATION_FEE_AMOUNT_INR
- REGISTRATION_FEE_CURRENCY
- APP_URL
```

**Status**: ⏳ **TODO** - Set secrets after getting credentials

---

### Check 3: Supabase Functions Deployed

```bash
# Run this in terminal:
supabase functions list

# Expected output should show:
✓ razorpay-create-order
✓ razorpay-verify-signature
✓ razorpay-webhook
```

**Status**: ⏳ **TODO** - Deploy with: `supabase functions deploy razorpay-*`

---

### Check 4: Function Health

```bash
# Check function logs in Supabase:
# Settings → Edge Functions → [function name] → Logs

# Expected: No recent errors (or expected test errors only)
```

**Status**: ⏳ **TODO** - Check after deployment

---

## 📋 STEP-BY-STEP: Getting Ready for Live

### STEP 1: Get Test Mode Credentials (5 minutes)

1. Go to **https://dashboard.razorpay.com**
2. Make sure **TEST MODE** is selected (toggle in top menu)
3. Go to **Account & Settings → API Keys**
4. You should see:
   ```
   Key ID:     rzp_test_XXXXXXXX
   Key Secret: XXXXXXXX
   ```
5. Copy both values

### STEP 2: Create Test Webhook (5 minutes)

1. In Razorpay Dashboard, go to **Account & Settings → Webhooks**
2. Click **Add New Webhook Endpoint**
3. Fill in:

   ```
   URL: https://YOUR_SUPABASE_URL.supabase.co/functions/v1/razorpay-webhook

   Events (select all):
   ✓ payment_link.paid
   ✓ payment_link.cancelled
   ✓ payment_link.expired
   ✓ payment.authorized
   ✓ payment.failed

   Active: ✓ (checked)
   ```

4. Click **Create**
5. Copy the **Signing Secret** (whsec_XXXXXXXX)

### STEP 3: Set Environment Variables (5 minutes)

**In `.env` file:**

```env
RAZORPAY_KEY_ID=rzp_test_XXXXXXXX
RAZORPAY_KEY_SECRET=XXXXXXXX_from_dashboard
RAZORPAY_WEBHOOK_SECRET=whsec_XXXXXXXX
REGISTRATION_FEE_AMOUNT_INR=300
REGISTRATION_FEE_CURRENCY=INR
APP_URL=http://localhost:3000  # For testing, use your actual production URL later
EXPO_PUBLIC_RAZORPAY_KEY_ID=rzp_test_XXXXXXXX
```

### STEP 4: Apply Database Migration (5 minutes)

**Option A: Using Supabase CLI**

```bash
supabase db push
```

**Option B: Manually in Supabase**

1. Go to Supabase Dashboard → SQL Editor
2. Click "New Query"
3. Copy contents of `supabase/migrations/039_razorpay_orders_integration.sql`
4. Paste and click "Run"

**Verify:**

```sql
-- Run this query to verify tables created:
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('orders', 'order_items', 'payment_signatures');
```

### STEP 5: Deploy Functions (5 minutes)

```bash
supabase functions deploy razorpay-create-order
supabase functions deploy razorpay-verify-signature
supabase functions deploy razorpay-webhook
```

**Verify:**

```bash
supabase functions list
```

### STEP 6: Set Supabase Secrets (10 minutes)

For EACH function (razorpay-create-order, razorpay-verify-signature, razorpay-webhook):

1. Go to Supabase Dashboard
2. Navigate to **Settings → Edge Functions**
3. Click the function name
4. Click **Configuration** tab
5. Add these secrets:
   ```
   RAZORPAY_KEY_ID=rzp_test_XXXXXXXX
   RAZORPAY_KEY_SECRET=XXXXXXXX
   RAZORPAY_WEBHOOK_SECRET=whsec_XXXXXXXX
   REGISTRATION_FEE_AMOUNT_INR=300
   REGISTRATION_FEE_CURRENCY=INR
   APP_URL=http://localhost:3000
   ```

---

## 🧪 Quick Test (10 minutes)

### Test 1: Create Order

```bash
curl -X POST http://localhost:3000/functions/v1/razorpay-create-order \
  -H "Authorization: Bearer YOUR_TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"member_id": "test-member-id"}'

# Expected: { "id": "order_XXXXX", "amount": 50000, "status": "created" }
```

### Test 2: Full Payment Flow

1. Click "Pay Now" button in app
2. Use test card: **4111 1111 1111 1111**
3. CVV: **123**
4. Expiry: Any future date
5. Click "Pay"
6. Check if payment_status updates to "paid"

### Test 3: Check Webhook

1. Go to Razorpay Dashboard
2. **Account & Settings → Webhooks**
3. Find your webhook
4. Click **View Events**
5. Should see `payment_link.paid` event

---

## 🔴 Common Issues & Fixes

| Issue                           | Fix                                                     |
| ------------------------------- | ------------------------------------------------------- |
| "API key not found"             | Check RAZORPAY_KEY_ID is set in Supabase secrets        |
| "Webhook secret missing"        | Check RAZORPAY_WEBHOOK_SECRET is set correctly          |
| "Order not created"             | Check supabase/migrations/039 was applied               |
| "Payment status not updating"   | Check webhook is receiving events in Razorpay dashboard |
| "Signature verification failed" | Ensure RAZORPAY_KEY_SECRET matches dashboard            |

---

## ⏭️ Next Steps After Testing

1. ✅ Complete test payments in test mode
2. ✅ Verify all database tables have records
3. ✅ Check logs for any errors
4. ✅ Review RAZORPAY_GO_LIVE_CHECKLIST.md
5. ✅ Get live credentials from Razorpay
6. ✅ Switch to live mode (see checklist)

---

## 📞 Support

- **Razorpay Docs**: https://razorpay.com/docs/
- **Razorpay Support**: https://support.razorpay.com
- **Setup Guide**: `docs/RAZORPAY_SETUP.md`
- **Integration Guide**: `docs/RAZORPAY_INTEGRATION.md`

---

**Timeline to Go-Live**: 1-2 hours (if you have Razorpay credentials)

**Current Status**: ⏳ Awaiting environment variables and Supabase setup
