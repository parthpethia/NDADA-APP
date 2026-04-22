# Razorpay Checkout Integration Guide

## Overview

This guide implements the complete Razorpay payment flow as documented in the Razorpay API documentation. The flow consists of three stages:

- **Stage I (created)**: Order is created server-side
- **Stage II (attempted)**: Payment is attempted and authorized
- **Stage III (paid/captured)**: Payment is captured and confirmed

## Architecture

### Components

1. **Order Creation** (`razorpay-create-order`) - Server-side
   - Creates Razorpay Order (Stage I)
   - Stores order details in database

2. **Signature Verification** (`razorpay-verify-signature`) - Server-side
   - Verifies payment signature using HMAC-SHA256
   - Updates order status to "attempted"

3. **Webhook Handler** (`razorpay-webhook`) - Server-side
   - Receives and verifies webhook from Razorpay
   - Confirms payment capture (Stage III)
   - Updates order and payment status to "paid"

4. **Checkout UI** - Client-side
   - Loads Razorpay Checkout script
   - Displays payment form
   - Handles payment responses

## Integration Steps

### Step 1: Create an Order (Server-Side)

**When**: User clicks "Pay Now"

**API Endpoint**: `POST /functions/v1/razorpay-create-order`

**Request**:

```typescript
{
  member_id?: string;  // Optional, fetched from auth if not provided
}
```

**Response**:

```typescript
{
  id: string; // order_IluGWxBm9U8zJ8
  entity: "order";
  amount: number; // 50000 (in paise)
  amount_paid: number; // 0
  amount_due: number; // 50000
  currency: string; // "INR"
  receipt: string;
  status: string; // "created"
  attempts: number; // 0
  notes: {
    member_id: string;
    membership_id: string;
  }
  created_at: number; // Unix timestamp
}
```

**Error Handling**:

```typescript
{
  error: string;
  razorpay_status?: number;
}
```

### Step 2: Integrate Checkout (Client-Side)

#### 2.1 Add Razorpay Script

```html
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
```

#### 2.2 Configure Checkout Options

```typescript
const checkoutOptions = {
  // Required - API credentials
  key: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID, // From dashboard

  // Required - Amount in smallest currency unit (paise for INR)
  amount: orderResponse.amount, // e.g., 50000 for ₹500
  currency: orderResponse.currency, // "INR"

  // Required - Order ID from Step 1
  order_id: orderResponse.id, // e.g., "order_IluGWxBm9U8zJ8"

  // Business Information
  name: "NDADA Membership",
  description: "Registration Fee",
  image: "https://example.com/logo.png",

  // Pre-fill customer information
  prefill: {
    name: member.full_name,
    email: member.email,
    contact: member.phone, // Format: +919876543210
  },

  // Notes (max 15 key-value pairs, 256 chars each)
  notes: {
    member_id: member.id,
    membership_id: member.membership_id,
  },

  // Callback after payment
  callback_url: "https://your-app.com/payment-callback",
  callback_method: "get",

  // Theme customization
  theme: {
    color: "#3399cc",
  },

  // Timeout (in seconds)
  timeout: 600,
};
```

#### 2.3 Handler Function Approach (Recommended)

```typescript
import RazorpayCheckout from "react-native-razorpay";
import * as WebBrowser from "expo-web-browser";

const handlePayment = async (orderResponse: any) => {
  try {
    const checkoutOptions = {
      key: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID,
      amount: orderResponse.amount,
      currency: orderResponse.currency,
      order_id: orderResponse.id,
      name: "NDADA Membership",
      prefill: {
        name: member.full_name,
        email: member.email,
        contact: member.phone,
      },
      notes: {
        member_id: member.id,
        membership_id: member.membership_id,
      },
      theme: {
        color: "#3399cc",
      },
    };

    // For React Native
    if (Platform.OS !== "web") {
      RazorpayCheckout.open(checkoutOptions)
        .then((data) => {
          // SUCCESS: User has completed payment
          handlePaymentSuccess(data);
        })
        .catch((error) => {
          // FAILURE: User cancelled or payment failed
          handlePaymentFailure(error);
        });
    } else {
      // For Web (React/Next.js)
      const { Razorpay } = window as any;
      const rzp = new Razorpay(checkoutOptions);
      rzp.open();
    }
  } catch (error) {
    console.error("Payment initiation failed:", error);
  }
};
```

### Step 3: Handle Payment Success

**On Client Success**:
The checkout returns:

```typescript
{
  razorpay_payment_id: string; // pay_IH4NVgf4Dreq1l
  razorpay_order_id: string; // order_IluGWxBm9U8zJ8
  razorpay_signature: string; // 0d4e745a1838664ad6c9c9...
}
```

### Step 4: Verify Signature (Server-Side)

**When**: User returns from payment checkout (success)

**API Endpoint**: `POST /functions/v1/razorpay-verify-signature`

**Important**: This step is MANDATORY to prevent payment tampering.

**Request**:

```typescript
{
  razorpay_order_id: string; // From checkout response
  razorpay_payment_id: string;
  razorpay_signature: string;
}
```

**Signature Generation** (for reference):

```
generated_signature = HMAC-SHA256(
  data: order_id + "|" + payment_id,
  key: RAZORPAY_KEY_SECRET
)

If generated_signature == razorpay_signature → Payment is authentic
```

**Response**:

```typescript
{
  verified: true,
  order_id: string;
  payment_id: string;
  message: string;
}
```

**Error Response**:

```typescript
{
  verified: false,
  error: string;  // "Signature verification failed" or "Order not found"
}
```

### Step 5: Webhook Confirmation (Server-Side)

**When**: Razorpay sends webhook event

**Event Types Handled**:

- `payment_link.paid`: Payment successfully captured
- `payment_link.cancelled`: Payment cancelled
- `payment_link.expired`: Payment link expired

**Webhook Payload**:

```typescript
{
  event: "payment_link.paid",
  payload: {
    payment_link: {
      entity: {
        id: string;          // plink_xxxxxxxxx
        notes: {
          member_id: string;
        }
      }
    },
    payment: {
      entity: {
        id: string;          // pay_xxxxxxxxx
      }
    }
  }
}
```

**Webhook Handler** (`razorpay-webhook`):

- Verifies webhook signature using HMAC-SHA256
- Updates payment status to "paid"
- Updates account payment_status to "paid"
- Creates certificate generation task

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ CLIENT SIDE                                                  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. User clicks "Pay Now"                                   │
│     │                                                        │
│     └──> Call razorpay-create-order                        │
│          (Server)                                            │
│          Response: { id, amount, ... }                      │
│                                                               │
│  2. Load Razorpay Checkout SDK                             │
│     Razorpay(options with order_id).open()                │
│                                                               │
│  3. User enters payment details                            │
│     Razorpay processes payment                              │
│                                                               │
│  4. On Success: Handler function receives                  │
│     { razorpay_order_id, razorpay_payment_id,             │
│       razorpay_signature }                                  │
│                                                               │
│  5. Send to Server:                                        │
│     POST razorpay-verify-signature                        │
│     { order_id, payment_id, signature }                    │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│ SERVER SIDE                                                  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  razorpay-create-order:                                     │
│  • Create order in Razorpay API                            │
│  • Store order in database (status: created)              │
│  • Return order_id to client                              │
│                                                               │
│  razorpay-verify-signature:                                │
│  • Verify HMAC-SHA256 signature                            │
│  • Update order status to "attempted"                      │
│  • Create payment record                                   │
│  • Return verified response                                │
│                                                               │
│  razorpay-webhook (async):                                 │
│  • Receive payment_link.paid event                        │
│  • Verify webhook signature                               │
│  • Update payment status to "paid"                         │
│  • Update account payment_status to "paid"                │
│  • Trigger certificate generation                         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### orders table

```sql
id UUID PRIMARY KEY
member_id UUID NOT NULL (FK: accounts.id)
razorpay_order_id TEXT UNIQUE
amount NUMERIC(10, 2)
currency TEXT
receipt TEXT
status TEXT  -- 'created', 'attempted', 'paid', 'failed', 'expired'
attempts INTEGER
amount_paid NUMERIC(10, 2)
amount_due NUMERIC(10, 2)
notes JSONB
provider_payload JSONB
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### payment_signatures table

```sql
id UUID PRIMARY KEY
payment_id UUID (FK: payments.id)
razorpay_signature TEXT
razorpay_order_id TEXT
razorpay_payment_id TEXT
is_verified BOOLEAN
verification_error TEXT
verified_at TIMESTAMPTZ
created_at TIMESTAMPTZ
```

### payments table (updated)

```sql
-- Previous fields...
razorpay_order_id TEXT (FK: orders.razorpay_order_id)
```

## Error Handling

### Common Errors

| Error                            | Cause                        | Solution                                                        |
| -------------------------------- | ---------------------------- | --------------------------------------------------------------- |
| "The id provided does not exist" | API key mismatch             | Ensure test/live keys match between order creation and checkout |
| "Blocked by CORS policy"         | Client-side API call         | Ensure all API calls are server-side only                       |
| "Signature verification failed"  | Tampered payment data        | Investigate suspicious activity, log to fraud_flags table       |
| "Order not found"                | Order ID doesn't exist in DB | Recreate order using razorpay-create-order                      |
| "Member already paid"            | Duplicate payment attempt    | Return existing payment status from database                    |

### Status Transitions

```
created (Order placed)
  ↓
  ├─→ attempted (Payment attempted)
  │    ├─→ paid (Payment captured - webhook)
  │    ├─→ failed (Payment declined)
  │    └─→ expired (Link expired)
  │
  └─→ expired (Link expired without attempt)
```

## Testing

### Test Credentials

Use these credentials in test mode:

**Test Cards**:

- **Success**: 4111 1111 1111 1111, CVV: 123, Exp: Any future date
- **Failure**: 4222 2222 2222 2222, CVV: 123, Exp: Any future date

**Test UPI**: success@razorpay

### Testing Flow

1. Create order: `razorpay-create-order`
2. Checkout with test card
3. Verify signature: `razorpay-verify-signature`
4. Check webhook in Razorpay dashboard (might need manual trigger in test)

## Environment Variables

```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=whsec_xxxxxxxxx
REGISTRATION_FEE_AMOUNT_INR=300
REGISTRATION_FEE_CURRENCY=INR
APP_URL=https://your-app.com
EXPO_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxx
```

## Security Best Practices

1. **Always verify signatures** - Prevents payment tampering
2. **Use HTTPS only** - Protect credentials in transit
3. **Store secrets server-side** - Never expose keys in client code
4. **Timing-safe comparison** - Use constant-time string comparison
5. **Validate order ownership** - Verify user owns the order
6. **Log all events** - Track payments for auditing
7. **Rate limit API calls** - Prevent brute force attacks
8. **Implement webhook signature verification** - Verify webhook source
9. **Auto-expire orders** - Clean up stale orders periodically
10. **Handle edge cases** - Network failures, duplicate webhooks, etc.

## References

- [Razorpay Orders API](https://razorpay.com/docs/api/orders/)
- [Razorpay Checkout](https://razorpay.com/docs/payments/checkout/)
- [Payment Signature Verification](https://razorpay.com/docs/payments/payment-signature-verification/)
- [Razorpay Webhooks](https://razorpay.com/docs/webhooks/)
- [Test Cards](https://razorpay.com/docs/payments/payments/test-cards/)
