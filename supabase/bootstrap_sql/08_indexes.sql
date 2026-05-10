CREATE INDEX IF NOT EXISTS idx_customers_gym_id ON customers(gym_id);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_membership_end_date ON customers(membership_end_date);

CREATE INDEX IF NOT EXISTS idx_trainers_gym_id ON trainers(gym_id);
CREATE INDEX IF NOT EXISTS idx_trainers_created_at ON trainers(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_gym_id ON subscriptions(gym_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_id ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_created_at ON subscriptions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_gym_id ON payments(gym_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_expense_categories_gym_id ON expense_categories(gym_id);
CREATE INDEX IF NOT EXISTS idx_expenses_gym_date ON expenses(gym_id, date);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);

CREATE INDEX IF NOT EXISTS idx_monthly_summaries_gym_month ON monthly_revenue_summaries(gym_id, month_year DESC);

CREATE INDEX IF NOT EXISTS idx_import_jobs_gym_created ON import_jobs(gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_files_job ON import_files(job_id);
CREATE INDEX IF NOT EXISTS idx_import_rows_job ON import_rows(job_id);
CREATE INDEX IF NOT EXISTS idx_import_errors_job ON import_errors(job_id);
CREATE INDEX IF NOT EXISTS idx_import_recon_gym_metric_created ON import_reconciliations(gym_id, metric_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_mappings_gym_type_created ON import_mappings(gym_id, import_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_templates_gym_name ON automation_templates(gym_id, name);
CREATE INDEX IF NOT EXISTS idx_gym_integrations_gym_provider ON gym_integrations(gym_id, provider);
