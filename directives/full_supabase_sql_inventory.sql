-- Full SQL inventory extracted from this repository
-- Date: 2026-04-05
--
-- IMPORTANT:
-- 1) This repo contains only one real migration SQL file.
-- 2) Most backend calls are Supabase client queries in JS/TS; below are equivalent SQL templates.
-- 3) Replace :placeholders before running.
--
-- SECTIONS:
-- A) Exact migrations found in-repo
-- B) Page & Card-Level Queries (DashboardPage, RevenuePage, TransactionsPage, CustomersPage, etc.)
-- C) All CRUD operations per table
-- D) Complete object inventory

/* =====================================================================
   A) EXACT SQL FOUND IN MIGRATIONS
   Source: supabase/migrations/001_create_monthly_revenue_summaries.sql
   ===================================================================== */

CREATE TABLE IF NOT EXISTS monthly_revenue_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gym_id UUID NOT NULL,
  month_year DATE NOT NULL,
  total_revenue DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_subscriptions INT NOT NULL DEFAULT 0,
  total_expenses DECIMAL(10, 2) NOT NULL DEFAULT 0,
  net_profit DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(gym_id, month_year)
);

ALTER TABLE monthly_revenue_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own gym summaries"
  ON monthly_revenue_summaries
  FOR SELECT
  USING (gym_id = auth.uid());

CREATE POLICY "Service role can insert summaries"
  ON monthly_revenue_summaries
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update summaries"
  ON monthly_revenue_summaries
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_monthly_summaries_gym_month
  ON monthly_revenue_summaries(gym_id, month_year DESC);

CREATE OR REPLACE FUNCTION update_monthly_summaries_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER monthly_summaries_update_timestamp
  BEFORE UPDATE ON monthly_revenue_summaries
  FOR EACH ROW
  EXECUTE FUNCTION update_monthly_summaries_timestamp();

/* =====================================================================
   B) SQL TEMPLATES EQUIVALENT TO APP QUERIES (src/** + supabase/functions/**)
   ORGANIZED BY PAGE & CARD
   ===================================================================== */

/* --- DASHBOARD PAGE (src/pages/DashboardPage.jsx) --- */
-- Card: Active Customers Count
SELECT COUNT(*) FROM active_customers;

-- Card: Total Customers Count
SELECT COUNT(*) FROM customers WHERE gym_id = :gym_id;

-- Card: Payments Summary
SELECT amount, status FROM payments WHERE gym_id = :gym_id;

-- Card: Trainers Count
SELECT COUNT(*) FROM trainers WHERE gym_id = :gym_id;

-- Card: Customers Created (for trend calculation)
SELECT created_at FROM customers WHERE gym_id = :gym_id;

-- Card: Import Reconciliation - Customers Count (last value)
SELECT imported_value
FROM import_reconciliations
WHERE gym_id = :gym_id AND metric_name = 'customers_count'
ORDER BY created_at DESC
LIMIT 1;

-- Card: Import Reconciliation - Payments Count (last value)
SELECT imported_value
FROM import_reconciliations
WHERE gym_id = :gym_id AND metric_name = 'payments_count'
ORDER BY created_at DESC
LIMIT 1;

-- Card: Import Reconciliation - Completed Revenue (last value)
SELECT imported_value
FROM import_reconciliations
WHERE gym_id = :gym_id AND metric_name = 'completed_revenue'
ORDER BY created_at DESC
LIMIT 1;

/* --- REVENUE PAGE (src/pages/RevenuePage.jsx) --- */
-- Card: Monthly Revenue Summaries (Last 12 months)
SELECT *
FROM monthly_revenue_summaries
WHERE gym_id = :gym_id
ORDER BY month_year DESC
LIMIT 12;

-- Analytics: Total Revenue for Month (for chart)
SELECT amount
FROM payments
WHERE gym_id = :gym_id
  AND status = 'completed'
  AND created_at >= :month_start_ts AND created_at <= :month_end_ts;

-- Analytics: Total Subscriptions Created in Month
SELECT id, created_at
FROM subscriptions
WHERE gym_id = :gym_id;

-- Analytics: Total Expenses for Month
SELECT amount
FROM expenses
WHERE gym_id = :gym_id
  AND date >= :month_start_date AND date <= :month_end_date;

-- Card: Spend by Category (Monthly)
SELECT *
FROM expenses
WHERE gym_id = :gym_id
  AND date >= :month_start_date AND date <= :month_end_date;

-- Card: Expense Categories (Active)
SELECT *
FROM expense_categories
WHERE gym_id = :gym_id AND is_active = TRUE
ORDER BY name;

-- Payment Details with Subscription Info (Revenue chart details)
SELECT amount, status, created_at, subscriptions(plan_name)
FROM payments
WHERE gym_id = :gym_id
ORDER BY created_at DESC;

-- Customer Membership Status (for revenue filtering)
SELECT membership_end_date
FROM customers
WHERE gym_id = :gym_id;

-- Reconciliation: Legacy vs Imported Variance
SELECT imported_value, legacy_value, metric_name
FROM import_reconciliations
WHERE gym_id = :gym_id
ORDER BY created_at DESC;

-- Upsert Monthly Revenue Summary
INSERT INTO monthly_revenue_summaries
(gym_id, month_year, total_revenue, total_subscriptions, total_expenses, net_profit)
VALUES (:gym_id, :month_year, :total_revenue, :total_subscriptions, :total_expenses, :net_profit)
ON CONFLICT (gym_id, month_year)
DO UPDATE SET
  total_revenue = EXCLUDED.total_revenue,
  total_subscriptions = EXCLUDED.total_subscriptions,
  total_expenses = EXCLUDED.total_expenses,
  net_profit = EXCLUDED.net_profit,
  updated_at = NOW();

/* --- TRANSACTIONS PAGE (src/pages/TransactionsPage.jsx) --- */
-- Card: Payment List with Nested Joins
SELECT
  id,
  amount,
  status,
  payment_mode,
  sender_name,
  sender_account_name,
  source_transaction_id,
  created_at,
  subscriptions(plan_name),
  customers(first_name, last_name)
FROM payments
WHERE gym_id = :gym_id
ORDER BY created_at DESC;

-- Customer Details for Payment Filter
SELECT id, first_name, last_name
FROM customers
WHERE gym_id = :gym_id;

/* --- CUSTOMERS PAGE (src/pages/CustomersPage.jsx) --- */
-- Card: Full Customers List
SELECT *
FROM customers
WHERE gym_id = :gym_id
ORDER BY created_at DESC;

/* --- TRAINERS PAGE (src/pages/TrainersPage.jsx) --- */
-- Card: Full Trainers List
SELECT *
FROM trainers
WHERE gym_id = :gym_id
ORDER BY created_at DESC;

/* --- MEMBERSHIP PAGE (src/pages/MembershipPage.jsx) --- */
-- Card: All Membership Plans
SELECT *
FROM membership_plans
ORDER BY price ASC;

/* --- COMMUNICATIONS PAGE (src/pages/CommunicationsPage.jsx) --- */
-- Card: Automation Templates Count
SELECT COUNT(*) FROM automation_templates WHERE gym_id = :gym_id;

-- Card: Automation Templates by Type
SELECT subject, body_text
FROM automation_templates
WHERE name = :template_name AND gym_id = :gym_id;

-- Card: Gym Integrations (RESEND provider)
SELECT id, reply_to_email, sender_profile, google_business_link
FROM gym_integrations
WHERE provider = 'RESEND' AND gym_id = :gym_id;

-- Card: Google Business Integration
SELECT google_business_link
FROM gym_integrations
WHERE gym_id = :gym_id AND provider = :provider;

/* --- DUPLICATE PAGE (src/pages/DupePage.jsx) --- */
-- Card: Total Duplicate Customer Count
SELECT COUNT(*)
FROM customers
WHERE gym_id = :gym_id;

-- Card: Active Member Duplicates
SELECT COUNT(*)
FROM customers
WHERE gym_id = :gym_id
  AND (membership_end_date IS NULL OR membership_end_date >= :today);

-- Card: Inactive Member Duplicates
SELECT COUNT(*)
FROM customers
WHERE gym_id = :gym_id
  AND membership_end_date < :today;

/* --- CUSTOMER & TRAINER MODALS (Components) --- */
-- Modal: Customer Subscriptions (Detail View)
SELECT id, plan_name, amount, created_at
FROM subscriptions
WHERE customer_id = :customer_id
ORDER BY created_at DESC
LIMIT 20;

-- Modal: Trainer Documents List
-- Pseudo-query: storage bucket signed URL lookup for trainer-docs by trainer_id

-- Modal: Customer Documents List
-- Pseudo-query: storage bucket signed URL lookup for customer-docs by customer_id

/* =====================================================================
   C) ALL TABLE CRUD OPERATIONS (Complete Reference for Each Table)
   ===================================================================== */

-- customers
SELECT * FROM customers WHERE gym_id = :gym_id ORDER BY created_at DESC;
SELECT COUNT(*) FROM customers WHERE gym_id = :gym_id;
SELECT COUNT(*) FROM customers WHERE gym_id = :gym_id AND (membership_end_date IS NULL OR membership_end_date >= :today);
SELECT COUNT(*) FROM customers WHERE gym_id = :gym_id AND membership_end_date < :today;
SELECT created_at FROM customers WHERE gym_id = :gym_id;
INSERT INTO customers (gym_id, first_name, last_name, email, phone) VALUES (:gym_id, :first_name, :last_name, :email, :phone);
UPDATE customers SET first_name = :first_name, last_name = :last_name, email = :email, phone = :phone, updated_at = NOW() WHERE id = :id;
DELETE FROM customers WHERE id = :id;
UPDATE customers SET photo_url = :photo_url, aadhaar_url = :aadhaar_url, updated_at = NOW() WHERE id = :id;

-- payments
SELECT amount FROM payments WHERE gym_id = :gym_id AND status = 'completed' AND created_at >= :start_ts AND created_at <= :end_ts;
SELECT id, amount, status, payment_mode, sender_name, sender_account_name, source_transaction_id, created_at FROM payments WHERE gym_id = :gym_id ORDER BY created_at DESC;
INSERT INTO payments (gym_id, subscription_id, amount, status, payment_mode, sender_name, sender_account_name, source_transaction_id, created_at)
VALUES (:gym_id, :subscription_id, :amount, :status, :payment_mode, :sender_name, :sender_account_name, :source_transaction_id, :created_at);

-- subscriptions
SELECT id, plan_name, amount, created_at FROM subscriptions WHERE customer_id = :customer_id ORDER BY created_at DESC LIMIT 20;
SELECT id, created_at FROM subscriptions WHERE gym_id = :gym_id;
INSERT INTO subscriptions (gym_id, customer_id, plan_name, amount, created_at)
VALUES (:gym_id, :customer_id, :plan_name, :amount, :created_at);

-- trainers
SELECT * FROM trainers WHERE gym_id = :gym_id ORDER BY created_at DESC;
SELECT * FROM trainers WHERE id = :id;
INSERT INTO trainers (gym_id, name, email, phone) VALUES (:gym_id, :name, :email, :phone);
UPDATE trainers SET name = :name, email = :email, phone = :phone, updated_at = NOW() WHERE id = :id;
DELETE FROM trainers WHERE id = :id;

-- admin credentials are env-managed (VITE_ADMIN_PASSWORD) and not stored in DB

-- import_jobs
INSERT INTO import_jobs (gym_id, source_name, import_type, status, started_at, completed_at)
VALUES (:gym_id, :source_name, :import_type, :status, :started_at, :completed_at)
RETURNING id;
DELETE FROM import_jobs WHERE id = :job_id;

-- import_files
INSERT INTO import_files (job_id, gym_id, original_name, row_count)
VALUES (:job_id, :gym_id, :original_name, :row_count);

-- import_rows
INSERT INTO import_rows (job_id, gym_id, row_index, raw_payload, normalized_payload, validation_status)
VALUES (:job_id, :gym_id, :row_index, :raw_payload_json, :normalized_payload_json, :validation_status);

-- import_errors
INSERT INTO import_errors (job_id, gym_id, row_index, error_code, error_message, payload)
VALUES (:job_id, :gym_id, :row_index, :error_code, :error_message, :payload_json);

-- import_reconciliations
INSERT INTO import_reconciliations (job_id, gym_id, metric_name, legacy_value, imported_value, variance)
VALUES (:job_id, :gym_id, :metric_name, :legacy_value, :imported_value, :variance);
SELECT imported_value
FROM import_reconciliations
WHERE gym_id = :gym_id AND metric_name IN (:metric_name_list)
ORDER BY created_at DESC
LIMIT 1;

-- import_mappings
INSERT INTO import_mappings (gym_id, import_type, mapping_json, created_at)
VALUES (:gym_id, :import_type, :mapping_json, NOW());
SELECT *
FROM import_mappings
WHERE gym_id = :gym_id AND import_type = :import_type
ORDER BY created_at DESC;

-- expenses
SELECT amount FROM expenses WHERE gym_id = :gym_id AND date >= :start_date AND date <= :end_date;
SELECT * FROM expenses WHERE gym_id = :gym_id AND date >= :start_date AND date <= :end_date;
INSERT INTO expenses (gym_id, category_id, amount, date)
VALUES (:gym_id, :category_id, :amount, :date)
ON CONFLICT (gym_id, category_id, date)
DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW();

-- expense_categories
SELECT * FROM expense_categories WHERE gym_id = :gym_id AND is_active = TRUE ORDER BY name;
INSERT INTO expense_categories (name, gym_id) VALUES (:name, :gym_id);

-- monthly_revenue_summaries
SELECT * FROM monthly_revenue_summaries WHERE gym_id = :gym_id ORDER BY month_year DESC LIMIT 12;
INSERT INTO monthly_revenue_summaries (gym_id, month_year, total_revenue, total_subscriptions, total_expenses, net_profit)
VALUES (:gym_id, :month_year, :total_revenue, :total_subscriptions, :total_expenses, :net_profit)
ON CONFLICT (gym_id, month_year)
DO UPDATE SET
  total_revenue = EXCLUDED.total_revenue,
  total_subscriptions = EXCLUDED.total_subscriptions,
  total_expenses = EXCLUDED.total_expenses,
  net_profit = EXCLUDED.net_profit,
  updated_at = NOW();

-- automation_templates
SELECT subject, body_text FROM automation_templates WHERE name = :name AND gym_id = :gym_id;
UPDATE automation_templates
SET subject = :subject, body_text = :body_text, updated_at = NOW()
WHERE name = :name AND gym_id = :gym_id;

-- gym_integrations
SELECT google_business_link FROM gym_integrations WHERE gym_id = :gym_id AND provider = :provider;
SELECT id, reply_to_email, sender_profile, google_business_link
FROM gym_integrations
WHERE provider = 'RESEND' AND gym_id = :gym_id;
UPDATE gym_integrations
SET reply_to_email = :reply_to_email, sender_profile = :sender_profile, google_business_link = :google_business_link, updated_at = NOW()
WHERE id = :id AND gym_id = :gym_id;

-- membership_plans
SELECT * FROM membership_plans ORDER BY price ASC;
UPDATE membership_plans SET price = :price, updated_at = NOW() WHERE id = :id;

-- gyms
SELECT id FROM gyms WHERE id = :id;
INSERT INTO gyms (id, name) VALUES (:id, :name);

-- active_customers (view)
SELECT COUNT(*) FROM active_customers;

/* =====================================================================
   D) Objects referenced by the app
   ===================================================================== */
-- Tables:
-- customers, payments, subscriptions, trainers, expenses, expense_categories,
-- import_jobs, import_files, import_rows, import_errors,
-- import_reconciliations, import_mappings, monthly_revenue_summaries,
-- automation_templates, gym_integrations, membership_plans, gyms
-- View:
-- active_customers
-- Storage buckets (not SQL tables):
-- customer-docs, trainer-docs
