# NDADA — Digital Membership Management System

**Live application:** https://ndada.in  
**GitHub repository:** https://github.com/parthpethia/NDADA-APP

NDADA is a membership management application for the Nagpur District Agro Dealers Association. It digitizes the process of applying for membership, submitting business details and documents, paying the registration fee, tracking application decisions, and accessing membership certificates.

This repository is also the source code and technical documentation for the End-Term Software Project submission.

## Problem statement

Membership administration can involve collecting applications and documents, confirming fee payments, reviewing eligibility, communicating decisions, and issuing certificates. NDADA brings these steps into a single digital workflow for members and association administrators.

## Target users

- **Agro-dealer members/applicants:** create an account, submit firm and licence information, complete the membership process, and access membership information.
- **Association administrators:** review applications and documents, manage application status, and handle membership approvals and certificates.

## Solution and key features

- Account registration and sign-in.
- Membership application with firm and business/licence details.
- Document upload for application review.
- Online membership-fee payment through Razorpay.
- Application status tracking, including pending, approved, rejected, and revision-required states.
- Administrative review and membership decision workflow.
- Membership certificate access and certificate verification by ID/QR, where enabled by the deployed application.
- Profile and privacy options, including an account-deletion request flow.
- Email updates for relevant application and membership events, where configured.

Feature availability can depend on the deployed configuration and the user's role. The demo should show the workflows that are currently working in the live application.

## Main workflows

### 1. Apply for membership
A user signs in, enters the required firm and applicant details, and submits the application documents.

### 2. Complete the fee payment
The applicant follows the Razorpay payment flow. Payment status must be confirmed by the application's payment integration before the application is treated as paid.

### 3. Review the application
An authorized administrator reviews the application and its supporting information, then records an appropriate decision or requests a revision.

### 4. Access and verify a certificate
After approval and certificate issuance, a member can access the certificate. A verifier can use the certificate verification flow to check its status.

## Engineering and architecture

NDADA is a mobile/web application built with Expo and React Native, using Expo Router for navigation. Supabase provides the backend services used by the app, including authentication, PostgreSQL data storage, and file storage. Razorpay is used for online membership payments, with Supabase Edge Functions supporting privileged actions and payment-related operations.

High-level flow:

```text
Member / Administrator
        |
        v
Expo + React Native application
        |
        +---- Supabase Auth
        +---- Supabase database and Storage
        +---- Supabase Edge Functions
                         |
                         +---- Razorpay payment integration
```

### Technology stack

- **Application:** React Native, Expo, Expo Router, TypeScript
- **Backend services:** Supabase
- **Database:** PostgreSQL through Supabase
- **Authentication and file storage:** Supabase Auth and Storage
- **Payment integration:** Razorpay
- **Certificate/PDF utilities:** PDF-related JavaScript libraries included in the project

## Run locally

### Prerequisites

- Node.js compatible with the project's Expo SDK
- npm
- A Supabase project with the required schema, policies, storage configuration, and Edge Functions

### Installation

```bash
git clone https://github.com/parthpethia/NDADA-APP.git
cd NDADA-APP
npm install
```

Create a local `.env.local` file using `.env.local.example` as a reference, and configure the required public application settings for your own Supabase project. Never commit real credentials.

Common client configuration variables include:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Other `EXPO_PUBLIC_*` variables referenced by the application configuration

Use the repository's [SETUP.md](./SETUP.md) and the Supabase migration/function files for the database and backend setup. Configure server-side secrets, including Supabase service-role and Razorpay secrets, only in the appropriate server-side secret manager or Supabase Edge Function secrets. **Never expose a service-role key or Razorpay secret in client-side code or a public repository.**

Start the development server:

```bash
npm run start
```

Useful project scripts:

```bash
npm run web
npm run android
npm run ios
npm run lint
npm run build:web
```

Commands requiring native tooling or credentials may need additional local setup. The production website is already deployed; local setup is for development and review.

## Deployment

- **Live application:** https://ndada.in
- **Source code:** https://github.com/parthpethia/NDADA-APP
- **Web build:** `npm run build:web` (exports the web application to `dist/` according to the project scripts)

The live site is the primary way to explore the deployed product. Access to member or administrator functionality may require an account with the appropriate permissions.

## Security notes

- Keep service-role keys, payment secrets, webhook secrets, and other privileged credentials out of Git and client bundles.
- Use database Row Level Security and server-side authorization for protected records and administrative operations.
- Validate payment state using the trusted payment integration/webhook flow rather than relying only on client-side status.
- Use test accounts and non-sensitive sample data for demonstrations. Do not include real members' identity documents or personal information in screenshots or demo recordings.

## End-Term project demonstration

Recommended 3–5 minute demo:

1. Explain the membership administration problem and intended users.
2. Demonstrate the applicant workflow using a test account.
3. Show the payment and application-status flow, using a safe test/demo scenario.
4. Show the administrator review workflow, if reviewer access is available.
5. Show certificate access/verification and briefly explain the architecture.

**Demo video:** [Watch the NDADA project demo](https://drive.google.com/drive/folders/1DxTLZDj4Lf74pCaXMaxv-DbJfqk7vjNv?usp=sharing)

## Project submission details

- **Project name:** NDADA — Digital Membership Management System
- **Problem:** Digitize membership applications, document review, fee collection, status tracking, and certificate management for the Nagpur District Agro Dealers Association.
- **Repository:** https://github.com/parthpethia/NDADA-APP
- **Live application:** https://ndada.in
- **Tech stack:** Expo, React Native, TypeScript, Supabase, PostgreSQL, Razorpay
- **Major features:** Authentication, membership application, document handling, online payment, role-based administrative review, status tracking, and certificate access/verification.

Before submission, add the demo video link, confirm the repository and live site open for evaluators, and ensure the demonstrated features match the current deployed version.
