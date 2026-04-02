# Data Migration Blueprint (Matched to Current App)

## Goal
Make gym onboarding frictionless by importing old-system data into this app with validation, reconciliation, and safe go-live.

## Migration Promise to Gym Owners
- Import customer directory, active memberships, historical transactions.
- Show a reconciliation report before go-live.
- Keep rollback option for each import job.

## Existing App Sections and How Migration Fits

### 1) Dashboard
Use this as migration command center.

Add:
- Migration status card:
  - Not started
  - In progress
  - Validation errors
  - Ready to publish
  - Completed
- Counters:
  - Customers imported
  - Transactions imported
  - Active memberships imported
  - Failed rows
- Reconciliation snapshot:
  - Legacy total collected
  - Imported total collected
  - Difference

Why here:
- Owners already look at Dashboard first.
- Gives immediate confidence after import.

---

### 2) Customers (Customer Directory)
Use this for customer import preview + duplicate handling.

Add:
- Import CSV button in Customer Directory header.
- Column mapper for customer fields:
  - first_name, last_name, phone, email, membership dates.
- Duplicate resolution panel:
  - Match by phone (primary)
  - Match by email (secondary)
  - Manual review fallback
- "Apply imports" action after review.

Why here:
- Imported customers should be validated where staff already manages members.

---

### 3) Transactions
Use this as payments import + financial truth source.

Add:
- Import payments CSV option.
- Payment mapping fields:
  - amount, status, payment_mode, sender_name, sender_account_name, source_transaction_id, created_at
- Validation rules:
  - amount must be numeric > 0
  - status in completed/pending/failed
  - UPI rows require source_transaction_id
- Reconciliation pane:
  - Imported completed amount total
  - Count of completed transactions

Why here:
- Revenue now depends on transactions; this is the right section for payment migration trust.

---

### 4) Revenue
Use this for import reconciliation and post-import checks.

Add:
- "Migration Reconciliation" card:
  - Imported booked revenue (optional)
  - Imported collected revenue
  - Current collected revenue in system
  - Difference
- "Data health" warnings:
  - Unassigned transactions
  - Unknown plan mappings
  - Rows skipped due to invalid dates

Why here:
- Revenue section is where owner validates business correctness.

---

### 5) Membership
Use this for legacy plan mapping.

Add:
- Mapping UI: old plan names -> app plan durations.
- Suggested mappings using string similarity.
- Block final import until all required plan mappings are resolved.

Why here:
- Prevents blank/incorrect income distribution and duration stats.

---

### 6) Communications
Use this for migration-completion communication.

Add:
- Optional bulk notify after import:
  - Welcome back message to active members
  - Renewal reminder schedule re-sync

Why here:
- Keeps outreach aligned immediately after switching systems.

---

### 7) Integrations
Use this for source templates and provider presets.

Add:
- Downloadable import templates per source:
  - Generic CSV
  - Legacy software A format
  - Legacy software B format
- Saved mapping profiles per gym.

Why here:
- Integrations is natural place for data source setup.

## Database Design (Supabase)

Create dedicated migration tables:
- import_jobs
  - id, gym_id, source_name, import_type, status, started_at, completed_at, created_by
- import_files
  - id, job_id, file_path, original_name, row_count
- import_rows
  - id, job_id, row_index, raw_payload, normalized_payload, validation_status
- import_errors
  - id, job_id, row_index, field_name, error_code, error_message
- import_mappings
  - id, gym_id, import_type, mapping_json, created_at
- import_reconciliations
  - id, job_id, metric_name, legacy_value, imported_value, variance

Security:
- RLS on all migration tables by gym_id = auth.uid().

## Import Types (MVP)
1. customers
2. memberships (or subscription-like rows)
3. payments

## Validation Rules (MVP)

Customers:
- At least one name token present
- phone or email required

Memberships:
- start_date <= end_date
- mapped plan required

Payments:
- amount > 0
- valid status enum
- if payment_mode = upi, source_transaction_id required

## Dedupe Rules
1. Exact phone match -> same customer
2. Else exact email match -> same customer
3. Else name + phone similarity -> flagged for manual review

## Reconciliation Rules (Go-Live Gate)
Go-live should be blocked if:
- Variance in collected revenue exceeds threshold.
- Unresolved required duplicates exist.
- Required plan mappings are incomplete.

## Rollout Plan

### Current Execution Status (as of 2026-03-27)
- Phase 1: Complete
  - Customer CSV import with validation preview and apply
  - Payment CSV import with validation preview and apply
  - Reconciliation logging into import tables
- Phase 2: In progress (now implemented in app UI, pending full QA)
  - Membership plan mapping UI with saved mapping profiles
  - Duplicate merge/review workflow during customer import
  - Partial retry for failed customer/payment rows
- Phase 3: Not started
  - Phase 3: Started
    - Integrations page added with source presets
    - Downloadable templates for customers/payments/memberships
    - Assisted migration checklist workflow (UI)

### Phase 1 (Fast MVP)
- CSV import for Customers + Payments.
- Row validation + error report download.
- Final apply import button.
- Reconciliation totals.

### Phase 2
- Membership mapping + duplicate merge UI.
- Saved mapping profiles.
- Partial retry for failed rows.

### Phase 3
- Source-specific connectors and assisted migration workflows.

## UX Checklist
- Always show Preview before Apply.
- Show estimated impact before commit.
- Show clear undo/rollback window.
- Keep logs per import job.

## Metrics to Track
- Time to first successful import
- Import success rate
- Average failed rows per 1000
- Onboarding completion rate
- 30-day retention of migrated gyms

## Final Product Positioning
- "Switch in 1 day, no data loss."
- "Your numbers are reconciled before you go live."
- "Revenue in this app matches actual collected transactions."
