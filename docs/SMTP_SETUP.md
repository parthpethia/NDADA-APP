# Supabase Custom SMTP Setup Guide

By default, Supabase Free Tier limits built-in email sends (magic links, confirmation emails, password resets) to **30 emails per hour**. During high registration surges or campaign launches, this bottleneck causes registration failures.

Configuring a free custom SMTP service removes this bottleneck entirely.

---

## Recommended Free SMTP Providers

| Provider | Free Allowance | Setup Complexity | Recommended For |
|---|---|---|---|
| **Resend** | 3,000 emails/month (100/day) | Extremely Simple | Fast setup, high deliverability |
| **SendGrid** | 100 emails/day forever | Simple | Industry standard |
| **Brevo (Sendinblue)** | 300 emails/day forever | Simple | Highest free daily volume |

---

## Option A: Resend Setup (Recommended)

1. Sign up at [resend.com](https://resend.com)
2. Go to **Domains** → Add your domain (e.g. `ndada.in`) and add the DNS records (TXT/MX/CNAME) to your DNS manager (Cloudflare/GoDaddy).
3. Go to **API Keys** → Create API Key (Name: `Supabase Auth`).
4. Copy the generated API Key (`re_...`).

### Configure in Supabase Console:
1. Open [Supabase Dashboard](https://supabase.com/dashboard) → Select your Project (`mtnbscscwijowozhchfi`).
2. Navigate to **Project Settings** → **Authentication** → **Email Settings**.
3. Enable **Enable Custom SMTP**.
4. Fill in the following:
   - **Sender email**: `noreply@ndada.in` (or your verified domain email)
   - **Sender name**: `NDADA Support`
   - **Host**: `smtp.resend.com`
   - **Port**: `587`
   - **Minimum Encryption**: `STARTTLS`
   - **Username**: `resend`
   - **Password**: `re_123456789...` (your Resend API Key)
5. Click **Save**.

---

## Option B: SendGrid Setup

1. Sign up at [sendgrid.com](https://sendgrid.com)
2. Complete **Single Sender Verification** or **Domain Authentication** under Settings → Sender Authentication.
3. Go to **Settings** → **API Keys** → **Create API Key** with Full Access to Mail Send.
4. Copy the API Key (`SG....`).

### Configure in Supabase Console:
1. Go to **Project Settings** → **Authentication** → **Email Settings**.
2. Enable **Enable Custom SMTP**.
3. Fill in:
   - **Sender email**: `support@ndada.org` (verified sender)
   - **Sender name**: `NDADA Support`
   - **Host**: `smtp.sendgrid.net`
   - **Port**: `587`
   - **Minimum Encryption**: `STARTTLS`
   - **Username**: `apikey` (literal string "apikey")
   - **Password**: `SG.your_api_key_here`
4. Click **Save**.

---

## Rate Limit Adjustment in `config.toml`

In `supabase/config.toml`, update the email rate limits once SMTP is enabled:

```toml
[auth.rate_limit]
# Increase rate limit from default 2 to 300 when custom SMTP is active
email_sent = 300
```

---

## Testing Your Setup

1. Go to the NDADA app login screen.
2. Click **Forgot Password**.
3. Enter your email and send a reset request.
4. Check your inbox and verify that:
   - Email arrives within 5 seconds.
   - Sender shows as `NDADA Support <noreply@ndada.in>`.
   - Email doesn't land in Spam/Junk folder.
