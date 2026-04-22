# Database Query Optimization Guide

## Overview

This document provides best practices for writing efficient queries in the NDADA app. Following these guidelines will ensure optimal performance as the user base grows.

## Quick Reference: Indexed Columns

### accounts table

- ✅ `user_id` - Use for user-specific queries
- ✅ `payment_status` - Use for status filtering
- ✅ `approval_status` - Use for status filtering
- ✅ `created_at` - Use for sorting by date
- ✅ `membership_id` - Use for membership lookups
- ✅ `email` - Use for email lookups

### payments table

- ✅ `member_id` - Use for account-specific queries
- ✅ `status` - Use for status filtering
- ✅ `created_at` - Use for date sorting

### Other tables

- `certificates.member_id`
- `notifications.user_id, read`
- `fraud_flags.member_id, resolved`

## Best Practices

### 1. Use SELECT with Specific Columns (NOT SELECT \*)

❌ **Bad:**

```typescript
const { data } = await supabase
  .from("accounts")
  .select("*")
  .eq("user_id", userId);
```

✅ **Good:**

```typescript
const { data } = await supabase
  .from("accounts")
  .select(
    "id, user_id, firm_name, full_name, email, payment_status, approval_status",
  )
  .eq("user_id", userId);
```

**Why:** Reduces bandwidth, improves cache efficiency, and speeds up queries by only retrieving needed data.

---

### 2. Always Use WHERE Clauses with Indexed Columns

❌ **Bad:**

```typescript
// Scanning all 10,000 accounts
const { data } = await supabase
  .from("accounts")
  .select("id, firm_name")
  .order("created_at", { ascending: false })
  .limit(50);
```

✅ **Good:**

```typescript
// Uses index on payment_status + approval_status
const { data } = await supabase
  .from("accounts")
  .select("id, firm_name")
  .eq("approval_status", "pending")
  .eq("payment_status", "paid")
  .order("created_at", { ascending: false })
  .limit(50);
```

**Why:** Indexed queries are typically 10-100x faster than full table scans.

---

### 3. Implement Pagination

❌ **Bad:**

```typescript
// Loading all 50,000 records at once
const { data } = await supabase.from("accounts").select("*");
```

✅ **Good:**

```typescript
// Load only one page
const page = 0;
const pageSize = 50;

const { data, count } = await supabase
  .from("accounts")
  .select("id, firm_name, payment_status", { count: "exact" })
  .eq("approval_status", "pending")
  .range(page * pageSize, (page + 1) * pageSize - 1);
```

**Why:** Reduces memory usage, improves response times, and prevents timeout errors.

---

### 4. Use Helper Functions Instead of Raw Queries

✅ **Good - Use these provided functions:**

```typescript
import {
  fetchAccountWithDetails,
  fetchAccountsList,
  getNextCertificateJob,
} from "@/lib/queries";

// Instead of writing custom queries
const { data } = await fetchAccountWithDetails(userId);
```

**Why:** Pre-optimized functions ensure consistency and performance.

---

### 5. Avoid N+1 Queries

❌ **Bad - N+1 problem:**

```typescript
// Query 1: Get all accounts
const { data: accounts } = await supabase
  .from("accounts")
  .select("id, firm_name")
  .limit(10);

// Query 2-11: Get payments for each account (10 additional queries!)
for (const account of accounts) {
  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("member_id", account.id);
}
```

✅ **Good - Use JOIN/nested select:**

```typescript
// Single query with related data
const { data } = await supabase
  .from("accounts")
  .select(
    `
    id,
    firm_name,
    payments(id, amount, status)
  `,
  )
  .limit(10);
```

**Why:** One query is dramatically faster than 11 queries.

---

### 6. Use Bulk Operations for Multiple Inserts

❌ **Bad - Multiple queries:**

```typescript
for (const error of errors) {
  await supabase
    .from("error_logs")
    .insert({ message: error.message, level: "error" });
}
```

✅ **Good - Batch insert:**

```typescript
const errorRecords = errors.map((e) => ({
  message: e.message,
  level: "error",
}));

await supabase.from("error_logs").insert(errorRecords);
```

**Why:** Batch insert is 10-100x faster than individual inserts.

---

### 7. Filter Early, Transform Late

❌ **Bad:**

```typescript
const { data: allAccounts } = await supabase.from("accounts").select("*");

// Filter in JavaScript
const pending = allAccounts.filter((a) => a.payment_status === "pending");
```

✅ **Good:**

```typescript
const { data: pending } = await supabase
  .from("accounts")
  .select("id, firm_name, payment_status")
  .eq("payment_status", "pending");
```

**Why:** Database filtering is much faster than application-level filtering.

---

### 8. Reuse Pre-Computed Views

✅ **Good - Use materialized views:**

```typescript
import { supabase } from "@/lib/supabase";

// This view is pre-computed and very fast
const { data } = await supabase
  .from("admin_dashboard_summary")
  .select("metric, value");
```

**Why:** Materialized views are pre-calculated and return results instantly.

---

### 9. Use Connection Pooling

✅ **In Supabase settings, enable "Connection Pooling":**

```
Pooling mode: Transaction
Pool size: 20
```

**Why:** Prevents connection exhaustion under high concurrency.

---

### 10. Monitor Query Performance

Use the provided performance logging:

```typescript
import { supabase } from "@/lib/supabase";

const startTime = Date.now();

const { data } = await supabase
  .from("accounts")
  .select("id, firm_name")
  .eq("payment_status", "pending");

const executionTime = Date.now() - startTime;

// Log slow queries
if (executionTime > 1000) {
  console.warn(`Slow query detected: ${executionTime}ms`);
}
```

---

## Common Query Patterns

### Get User's Account with All Details

```typescript
const { data } = await supabase
  .from("accounts")
  .select(
    `
    id,
    user_id,
    firm_name,
    full_name,
    email,
    payment_status,
    approval_status,
    status_timeline,
    payments(id, amount, status, created_at),
    certificates(id, certificate_url, status),
    fraud_flags(id, reason, resolved)
  `,
  )
  .eq("user_id", userId)
  .single();
```

### Get Pending Applications (Paginated)

```typescript
const page = 0;
const pageSize = 20;

const { data, count } = await supabase
  .from("accounts")
  .select(`id, firm_name, full_name, membership_id, created_at`, {
    count: "exact",
  })
  .eq("approval_status", "pending")
  .eq("payment_status", "paid")
  .order("created_at", { ascending: false })
  .range(page * pageSize, (page + 1) * pageSize - 1);
```

### Search Accounts by Multiple Criteria

```typescript
let query = supabase
  .from("accounts")
  .select("id, firm_name, email, membership_id, payment_status");

// Apply filters
if (searchQuery) {
  query = query.or(
    `membership_id.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,firm_name.ilike.%${searchQuery}%`,
  );
}

if (status) {
  query = query.eq("payment_status", status);
}

query = query.order("created_at", { ascending: false }).limit(50);
const { data } = await query;
```

---

## Performance Checklist

- [ ] All queries use specific column names (no `SELECT *`)
- [ ] WHERE clauses filter by indexed columns when possible
- [ ] Queries use pagination with LIMIT/OFFSET
- [ ] JOIN operations are done in database, not application
- [ ] Bulk operations batch multiple records
- [ ] Slow queries (>1s) are investigated
- [ ] Connection pooling is enabled
- [ ] N+1 queries are avoided
- [ ] Pre-computed views are used for dashboards
- [ ] Query performance is monitored regularly

---

## Troubleshooting Slow Queries

### Check if index is being used:

```sql
EXPLAIN ANALYZE
SELECT id, firm_name FROM accounts
WHERE payment_status = 'pending'
ORDER BY created_at DESC
LIMIT 50;
```

### Look for table scans:

If you see `Seq Scan` in the output, the query is scanning the entire table. Consider adding an index.

### Monitor real-time performance:

```typescript
import { getErrorLogs } from "@/lib/errorTracking";

// View all logged slow queries
const logs = getErrorLogs();
const slowQueries = logs.filter((l) => l.context.duration > 1000);
```

---

## Additional Resources

- [Supabase Performance Tips](https://supabase.com/docs/guides/platform/performance)
- [PostgreSQL Query Optimization](https://www.postgresql.org/docs/current/performance.html)
- [Explain Query Plans](https://www.postgresql.org/docs/current/sql-explain.html)
