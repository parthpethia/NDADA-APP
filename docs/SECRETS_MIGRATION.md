# Secrets Migration Guide

To ensure Google Play Store compliance, all sensitive server-side credentials and keys have been removed from the client-side `.env` files. These keys must now be set exclusively in your remote Supabase project environment.

## Removed Secrets
The following secret variables have been purged from the client code and `.env` configuration:
1. `SUPABASE_SERVICE_ROLE_KEY`
2. `RAZORPAY_KEY_SECRET`
3. `RAZORPAY_WEBHOOK_SECRET`

---

## Required Action Steps

### 1. Set Edge Function Environment Variables
You must set the following environment variables in your Supabase project using the Supabase CLI:

```bash
# Set Razorpay API credentials
supabase secrets set RAZORPAY_KEY_ID="rzp_live_your_actual_key_id"
supabase secrets set RAZORPAY_KEY_SECRET="your_actual_key_secret"
supabase secrets set RAZORPAY_WEBHOOK_SECRET="your_actual_webhook_secret"

# Set canonical registration amounts and currency
supabase secrets set REGISTRATION_FEE_AMOUNT_INR="300"
supabase secrets set REGISTRATION_FEE_CURRENCY="INR"
```

Alternatively, you can configure these secrets directly in the **Supabase Dashboard**:
1. Go to **Settings** -> **Edge Functions** (or **Database** -> **Vault** / **Secrets** depending on your Supabase version).
2. Add the variables listed above.

### 2. Rotate Compromised Keys
Because these credentials were previously committed in cleartext inside the git repository history, they are considered compromised.

> [!WARNING]
> You **must rotate** the following keys immediately in your respective dashboards:
> - **Supabase Service Role Key**: Rotate via *Supabase Dashboard -> Settings -> API -> JWT Settings -> Rotate JWT Secret*.
> - **Razorpay Key Secret**: Generate a new Live Secret Key via *Razorpay Dashboard -> Settings -> API Keys*.
> - **Razorpay Webhook Secret**: Update the webhook secret via *Razorpay Dashboard -> Settings -> Webhooks*.

---

## Local Development
For local testing of edge functions, create a `.env` file inside the `supabase/functions/` directory or run them with local Deno settings. Never include `_SECRET` variables in the root `.env` or `.env.local` files that get loaded by Metro / React Native.
