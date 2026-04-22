# Razorpay Go-Live Checklist

## Pre-Live Verification

Complete this checklist before switching to Live Mode and accepting real payments.

---

## Phase 1: Test Mode Verification ✅

### 1.1 End-to-End Payment Flow

- [ ] **Create Order** - Successfully create orders via `razorpay-create-order` function
- [ ] **Open Checkout** - Razorpay Checkout loads and displays correctly
- [ ] **Process Payment** - Complete test payment with test card (4111 1111 1111 1111)
- [ ] **Verify Signature** - HMAC-SHA256 signature verification succeeds
- [ ] **Receive Webhook** - `payment_link.paid` webhook received and processed
- [ ] **Update Status** - Payment status updates to "paid" in database
- [ ] **Account Marked Paid** - Account payment_status changes to "paid"

### 1.2 Test Different Scenarios

- [ ] **Successful Payment** - Test card success flow (4111 1111 1111 1111)
- [ ] **Failed Payment** - Test card failure flow (4222 2222 2222 2222)
- [ ] **Cancelled Payment** - User cancels from checkout
- [ ] **Expired Link** - Order expires without payment attempt
- [ ] **Duplicate Payment** - Prevent double payment on retry
- [ ] **Network Failure** - Graceful handling of network errors
- [ ] **Webhook Retry** - Verify idempotent webhook handling

### 1.3 Test All Payment Methods

- [ ] **Debit Card** - Test debit card transaction
- [ ] **Credit Card** - Test credit card transaction
- [ ] **UPI** - Test UPI payment (success@razorpay)
- [ ] **Netbanking** - Test netbanking if applicable
- [ ] **Wallet** - Test wallet payment if applicable

### 1.4 Error Handling

- [ ] **Invalid Signature** - Tampered payment rejected
- [ ] **Missing Order** - Order not found error handled
- [ ] **Unauthorized User** - User cannot pay for others' orders
- [ ] **Already Paid** - Prevent repayment of paid accounts
- [ ] **API Failures** - Graceful degradation on API errors
- [ ] **Webhook Delivery** - Missing webhook handled with API fallback

### 1.5 Database Verification

- [ ] **Orders Created** - `orders` table has test orders
- [ ] **Payment Records** - `payments` table updated correctly
- [ ] **Signature Records** - `payment_signatures` table has verification attempts
- [ ] **Status Workflow** - Orders progress: created → attempted → paid
- [ ] **Account Updated** - `accounts` table payment_status updated
- [ ] **No Data Loss** - All payment information captured and persisted

### 1.6 Function Logging

- [ ] **Order Function Logs** - `razorpay-create-order` logs are clear and helpful
- [ ] **Verify Function Logs** - `razorpay-verify-signature` logs show signature verification
- [ ] **Webhook Function Logs** - `razorpay-webhook` logs show event processing
- [ ] **Error Logs** - Errors are properly logged with context

---

## Phase 2: Live Mode Setup 🚀

### 2.1 Generate Live API Keys

- [ ] **Login to Dashboard** - Access Razorpay Dashboard
- [ ] **Switch to Live Mode** - Toggle live mode in menu
- [ ] **Navigate to API Keys** - Account & Settings → API Keys
- [ ] **Generate Live Key** - Click "Generate Key" button
- [ ] **Download Keys Securely** - Save Key ID and Key Secret
- [ ] **Store Securely** - Store in password manager/vault, NOT in version control

### 2.2 Create Live Webhook

- [ ] **Navigate to Webhooks** - Account & Settings → Webhooks
- [ ] **Create New Webhook** - Add webhook endpoint
  - URL: `https://your-production-domain.com/functions/v1/razorpay-webhook`
  - Replace with your actual production domain
- [ ] **Select Events** - Enable these events:
  - [ ] `payment_link.paid`
  - [ ] `payment_link.cancelled`
  - [ ] `payment_link.expired`
  - [ ] `payment.authorized`
  - [ ] `payment.failed`
- [ ] **Enable Webhook** - Check "Active" checkbox
- [ ] **Copy Signing Secret** - Save webhook secret for environment variables
- [ ] **Test Webhook** - Use "Test Webhook" button to verify delivery

### 2.3 Update Environment Variables

**In Supabase Edge Functions Secrets:**

```
RAZORPAY_KEY_ID=rzp_live_XXXXXXXX          ← LIVE key
RAZORPAY_KEY_SECRET=XXXXXXXX                ← LIVE secret
RAZORPAY_WEBHOOK_SECRET=whsec_XXXXXXXX     ← LIVE webhook secret
REGISTRATION_FEE_AMOUNT_INR=300
REGISTRATION_FEE_CURRENCY=INR
APP_URL=https://your-production-domain.com
```

**In Application Secrets:**

```env
EXPO_PUBLIC_RAZORPAY_KEY_ID=rzp_live_XXXXXXXX
```

Update in all three functions:

- [ ] `razorpay-create-order`
- [ ] `razorpay-verify-signature`
- [ ] `razorpay-webhook`

### 2.4 Deploy to Production

- [ ] **Test Functions Deployed** - All functions running in production
- [ ] **Environment Variables Set** - Verified in Supabase settings
- [ ] **No Test Keys in Production** - Confirm rzp*live*\* keys only
- [ ] **Database Schema Current** - All migrations applied
- [ ] **CDN/Cache Cleared** - No stale secrets cached

---

## Phase 3: Payment Capture Configuration ⚙️

### 3.1 Auto-Capture Settings (Recommended)

- [ ] **Enable Auto-Capture** - Razorpay Dashboard → Settings → Payment Capture
- [ ] **Set Auto-Capture to Enabled** - Automatic capture of authorized payments
- [ ] **No Manual Capture Needed** - Payments auto-captured (faster settlement)

**Why**: Razorpay auto-refunds uncaptured payments after fixed period. Auto-capture ensures funds are secured.

### 3.2 Verify Capture Settings

- [ ] **Test Live Payment** - Process a small test payment
- [ ] **Check Dashboard** - Verify payment shows as "captured"
- [ ] **Check Bank Settlement** - Confirm funds appear in settlement schedule
- [ ] **Monitor Webhooks** - Ensure `payment.captured` events received

### 3.3 Refund Policy

- [ ] **Understand Refund Timeline** - Uncaptured payments auto-refunded after X hours
- [ ] **Only Refund After Capture** - Refunds only possible on captured payments
- [ ] **Monitor Uncaptured Payments** - None should remain uncaptured long-term
- [ ] **Alert on Failures** - Set alerts for failed/expired payments

---

## Phase 4: Webhook Setup & Verification 🔗

### 4.1 Webhook Endpoint Verification

- [ ] **URL is Public** - Production domain is publicly accessible
- [ ] **HTTPS Only** - Endpoint uses HTTPS (TLS/SSL)
- [ ] **Correct Domain** - Points to your production domain
- [ ] **Not Behind Auth** - Webhook endpoint doesn't require authentication
- [ ] **Correct Function Path** - `/functions/v1/razorpay-webhook`

### 4.2 Webhook Signature Verification

- [ ] **Secret Saved** - Webhook signing secret stored securely
- [ ] **Signature Verified** - HMAC-SHA256 verification implemented
- [ ] **Timing-Safe Compare** - Using constant-time comparison
- [ ] **Rejects Invalid** - Invalid signatures rejected and logged

### 4.3 Webhook Event Handling

- [ ] **payment_link.paid** - Updates payment status to "paid"
- [ ] **payment_link.cancelled** - Updates payment status to "failed"
- [ ] **payment_link.expired** - Updates payment status to "expired"
- [ ] **Idempotent Handler** - Handles duplicate events gracefully
- [ ] **No Data Loss** - Events stored for audit trail
- [ ] **Error Logging** - Failed events logged with full context

### 4.4 Webhook Monitoring

- [ ] **Setup Monitoring** - Dashboard → Webhooks → Event Log
- [ ] **Monitor Delivery** - Check webhook delivery status
- [ ] **Alert on Failures** - Failures trigger alerts
- [ ] **Retry Logic** - Razorpay retries failed deliveries
- [ ] **Logs Reviewed** - Function logs show event processing

### 4.5 Fallback for Critical Flows

- [ ] **Instant Confirmation** - For user-facing "Payment Successful" message
- [ ] **API Fallback** - If webhook delayed, verify via API call
- [ ] **Fetch Payment API** - Call `GET /payments/{id}` if webhook not received
- [ ] **Timeout Set** - Max wait time before API fallback (e.g., 5 seconds)
- [ ] **User Experience** - Never leave user in uncertainty state

---

## Phase 5: Security Verification 🔒

### 5.1 Secrets Management

- [ ] **No Secrets in Code** - No hardcoded API keys in repo
- [ ] **No Secrets in Logs** - Secrets not logged or exposed
- [ ] **Secrets in Vault** - All secrets in Supabase secrets manager
- [ ] **Secure Sharing** - Shared via password manager, not chat/email
- [ ] **Rotation Planned** - Plan for periodic secret rotation

### 5.2 HTTPS & Encryption

- [ ] **HTTPS Enabled** - All endpoints use HTTPS
- [ ] **Valid SSL Certificate** - Production domain has valid cert
- [ ] **CORS Configured** - Proper CORS headers set
- [ ] **Security Headers** - X-Frame-Options, X-Content-Type-Options set
- [ ] **No Mixed Content** - All resources loaded over HTTPS

### 5.3 API Security

- [ ] **Server-Side Calls Only** - No Razorpay API calls from client
- [ ] **Authorization Checked** - User verified before payment
- [ ] **Order Ownership** - User can only pay for their own orders
- [ ] **Signature Verification** - All payments verified before processing
- [ ] **Rate Limiting** - API endpoints rate-limited to prevent abuse

### 5.4 Data Security

- [ ] **Sensitive Data Masked** - Full card numbers not stored
- [ ] **PII Protected** - Customer data encrypted if stored
- [ ] **Audit Trail** - All transactions logged and auditable
- [ ] **Backup Secured** - Database backups encrypted
- [ ] **Access Control** - RLS policies restrict data access

### 5.5 Error Handling

- [ ] **No Sensitive Info in Errors** - Error messages don't leak secrets
- [ ] **Generic User Messages** - Users see friendly error messages
- [ ] **Detailed Internal Logs** - Developers see detailed logs
- [ ] **Monitoring Alerts** - Security events trigger alerts
- [ ] **Fraud Detection** - Suspicious activity logged to fraud_flags table

---

## Phase 6: Performance & Reliability ✨

### 6.1 Function Performance

- [ ] **Create Order** - Completes in < 2 seconds
- [ ] **Verify Signature** - Completes in < 1 second
- [ ] **Webhook Handler** - Processes in < 5 seconds
- [ ] **No Timeouts** - Functions complete within limits
- [ ] **Error Recovery** - Functions gracefully handle failures

### 6.2 Database Performance

- [ ] **Indexes Created** - All indexes in place
- [ ] **Query Performance** - Queries execute efficiently
- [ ] **Connection Pooling** - Supabase connection pool configured
- [ ] **Backup Schedule** - Backups scheduled and tested
- [ ] **Recovery Plan** - Data recovery procedures tested

### 6.3 Availability & Monitoring

- [ ] **Uptime Monitoring** - Functions monitored for availability
- [ ] **Error Rate Monitoring** - Alerts on error spikes
- [ ] **Latency Monitoring** - Alerts on slowness
- [ ] **Webhook Delivery Monitoring** - Webhook delivery tracked
- [ ] **Health Checks** - Periodic health checks configured

### 6.4 Scalability

- [ ] **Load Testing** - Tested with expected transaction volume
- [ ] **Concurrent Payments** - Multiple simultaneous payments handled
- [ ] **Database Scaling** - Supabase scaling policies understood
- [ ] **Cost Monitoring** - Edge function costs monitored
- [ ] **Throttling Plan** - Plan if limits approached

---

## Phase 7: Documentation & Training 📚

### 7.1 Internal Documentation

- [ ] **Setup Guide Updated** - RAZORPAY_SETUP.md reflects production
- [ ] **Troubleshooting Guide** - RAZORPAY_SETUP.md troubleshooting section reviewed
- [ ] **Runbook Created** - On-call runbook for payment issues
- [ ] **Alert Procedures** - How to respond to payment alerts documented
- [ ] **Escalation Path** - Clear escalation path to Razorpay support

### 7.2 Team Training

- [ ] **Team Briefing** - Payment team trained on new system
- [ ] **Support Scripts** - Customer support has payment troubleshooting scripts
- [ ] **Admin Dashboard** - Admins know how to check payment status
- [ ] **Incident Response** - Team drilled on incident response
- [ ] **Razorpay Support** - Support contact info and escalation path known

### 7.3 Customer Communication

- [ ] **Payment Page Clear** - Users understand the payment process
- [ ] **Error Messages Helpful** - Users know what to do on errors
- [ ] **Support Info Available** - Support email/phone available
- [ ] **FAQ Prepared** - Common payment questions documented
- [ ] **Privacy Policy Updated** - Payment processing disclosed

---

## Phase 8: Final Go-Live 🎯

### 8.1 Pre-Launch Verification

- [ ] **All Checklist Items Done** - Nothing left unchecked above
- [ ] **Smoke Test** - One final end-to-end test in production
- [ ] **Live Payment Test** - Process a small real payment (refund after)
- [ ] **Webhook Verified** - Webhook event received and processed
- [ ] **Logs Checked** - No errors in production logs
- [ ] **Team Notified** - Team aware of go-live
- [ ] **Monitoring Active** - All monitoring and alerts active

### 8.2 Launch Window

- [ ] **Time Scheduled** - Go-live time scheduled
- [ ] **Team Available** - Team on call during launch
- [ ] **Razorpay Support** - Support info accessible (hours: 24/5)
- [ ] **Rollback Plan** - Plan to rollback if issues
- [ ] **Communication Plan** - How to notify team of issues

### 8.3 Post-Launch Monitoring (First 24 Hours)

- [ ] **Active Monitoring** - Watch dashboards continuously
- [ ] **Transaction Volume** - Monitor transaction count
- [ ] **Error Rate** - Monitor error rate
- [ ] **Webhook Delivery** - Confirm webhooks flowing
- [ ] **Payment Status** - Verify payments marking as paid
- [ ] **Manual Checks** - Spot-check random transactions
- [ ] **Incident Response** - Ready to handle issues

### 8.4 Week 1 Monitoring

- [ ] **Daily Review** - Check transaction reports daily
- [ ] **Payment Success Rate** - Monitor conversion/success rate
- [ ] **Customer Feedback** - Monitor support tickets
- [ ] **Performance Metrics** - Check latency and error rates
- [ ] **Settlement Verification** - Confirm settlement reaching bank account
- [ ] **Dashboard Review** - Razorpay dashboard reviewed daily

---

## Phase 9: Post-Launch Optimization 📈

### 9.1 Analytics & Metrics

- [ ] **Dashboard Created** - Payment analytics dashboard setup
- [ ] **Success Rate Tracked** - Monitor payment success rate
- [ ] **Average Transaction Time** - Track end-to-end time
- [ ] **Error Analysis** - Analyze failure reasons
- [ ] **Revenue Tracked** - Daily revenue reports

### 9.2 Improvements

- [ ] **User Feedback** - Collect feedback on payment experience
- [ ] **Optimize Flow** - Reduce payment flow friction
- [ ] **Error Messages** - Improve error message clarity
- [ ] **Performance Tuning** - Optimize slow queries/functions
- [ ] **Retry Logic** - Improve retry mechanisms

### 9.3 Compliance & Audits

- [ ] **PCI DSS Check** - Verify no card data stored locally
- [ ] **Audit Trail** - Audit all transactions
- [ ] **Reconciliation** - Daily reconciliation with Razorpay
- [ ] **Tax Compliance** - Payment taxes properly handled
- [ ] **Fraud Monitoring** - Monitor for suspicious activity

---

## Rollback Plan 🔄

If critical issues arise after launch:

1. **Stop Accepting New Payments**
   - Disable "Pay Now" button
   - Notify users of temporary suspension

2. **Verify Issue**
   - Check logs and errors
   - Determine if Razorpay or app side
   - Contact Razorpay support if needed

3. **Implement Fix**
   - Deploy hotfix if app issue
   - Update configuration if needed
   - Test fix thoroughly

4. **Re-enable Payments**
   - Re-enable payment button
   - Monitor closely
   - Notify team of restoration

5. **Post-Mortem**
   - Document root cause
   - Implement preventive measures
   - Update procedures

---

## Sign-Off Checklist

**Before launching to production, all stakeholders must sign off:**

- [ ] **Development Lead** - Confirms code quality and security
  - Name: ******\_\_\_****** Date: ******\_\_\_******

- [ ] **QA Lead** - Confirms testing complete
  - Name: ******\_\_\_****** Date: ******\_\_\_******

- [ ] **Product Owner** - Confirms requirements met
  - Name: ******\_\_\_****** Date: ******\_\_\_******

- [ ] **Security Officer** - Confirms security measures
  - Name: ******\_\_\_****** Date: ******\_\_\_******

- [ ] **Finance/Billing** - Confirms payment handling
  - Name: ******\_\_\_****** Date: ******\_\_\_******

---

## Quick Reference

**Critical Contacts:**

- Razorpay Support: https://support.razorpay.com
- Razorpay Dashboard: https://dashboard.razorpay.com
- Your Support Email: support@ndada.com

**Key Endpoints:**

- Create Order: `POST /functions/v1/razorpay-create-order`
- Verify Signature: `POST /functions/v1/razorpay-verify-signature`
- Webhook: `POST /functions/v1/razorpay-webhook`

**Documentation:**

- Setup Guide: `docs/RAZORPAY_SETUP.md`
- Integration Guide: `docs/RAZORPAY_INTEGRATION.md`
- Summary: `docs/RAZORPAY_SUMMARY.md`

---

**Status**: ⏳ Ready for Go-Live  
**Last Updated**: 2026-04-23  
**Next Review**: After 2 weeks in production
