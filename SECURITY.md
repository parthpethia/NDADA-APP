# Security Guidelines

## Environment Variables

### Public Keys (Safe in .env.example)
- `EXPO_PUBLIC_SUPABASE_URL` - Public Supabase URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Public anon key (limited permissions via RLS)
- `EXPO_PUBLIC_APP_URL` - App URL
- `EXPO_PUBLIC_MEMBERSHIP_AMOUNT` - Public config

### Secret Keys (NEVER commit to .env.example)
- ❌ `SUPABASE_SERVICE_ROLE_KEY` - Server-only key, never in client code
- ❌ `RAZORPAY_KEY_SECRET` - Payment provider secret
- ❌ `RAZORPAY_WEBHOOK_SECRET` - Webhook verification secret
- ❌ API keys for email services (Resend, SendGrid, Mailgun)

## Setup for Development

1. Copy environment template:
   ```bash
   cp .env.local.example .env.local
   ```

2. Fill in `.env.local` with actual credentials:
   - Get Supabase keys from: https://app.supabase.com → Project → Settings → API
   - Get Razorpay keys from: https://dashboard.razorpay.com → Settings → API Keys
   - **Never commit `.env.local`** - it's in .gitignore

3. Verify `.env.local` is NOT staged:
   ```bash
   git status .env.local  # Should show "nothing to commit"
   ```

## Setup for Production

1. **Supabase Edge Functions**:
   - Set secrets via Supabase Dashboard: Project → Settings → Edge Function secrets
   - Not in .env files - managed by Supabase

2. **CI/CD Pipeline**:
   - Store secrets in GitHub Secrets or deployment platform
   - Never commit .env files

3. **Razorpay**:
   - Use test keys for development/staging
   - Rotate keys after any exposure
   - Use webhook signature verification (already implemented)

## Current Status ✅

- `.env` is in `.gitignore` ✅
- `.env.example` has no real secrets ✅
- `.env.local.example` provided as template ✅
- Supabase secrets in Edge Functions (not client) ✅
- RLS policies enforced on all queries ✅
- Razorpay signature verification implemented ✅

## If Secrets Are Ever Exposed

1. **Immediately rotate all keys**:
   - Supabase: Dashboard → API Settings → Rotate keys
   - Razorpay: Dashboard → Settings → API Keys → Regenerate

2. **Audit access logs**:
   - Check Supabase audit logs for unauthorized access
   - Check Razorpay transaction logs

3. **Update CI/CD secrets**:
   - Rotate GitHub Secrets or deployment platform credentials

4. **Audit this codebase**:
   - Ensure no other files contain hardcoded secrets
   - Run: `grep -r "rzp_live" . --exclude-dir=node_modules`

## API Security

### Payment Flow
- ✅ All Razorpay API calls server-side (Edge Functions)
- ✅ HMAC-SHA256 signature verification (prevents tampering)
- ✅ Timing-safe comparison to prevent timing attacks
- ✅ User ownership verification before processing

### Database
- ✅ RLS policies on all tables
- ✅ Single anon key with limited permissions
- ✅ Service role key only in server functions

### Email
- ✅ API keys in Edge Functions, not client
- ✅ No PII in logs
- ✅ Template variables escaped

## Tools

Check for accidental secrets:
```bash
# Scan for common secret patterns
git log -p -S "rzp_live" --all
grep -r "rzp_live" --include="*.ts" --include="*.tsx" --include="*.json"

# BFG Repo-Cleaner to remove from history (if needed)
# bfg --delete-files .env --no-blob-protection
```
