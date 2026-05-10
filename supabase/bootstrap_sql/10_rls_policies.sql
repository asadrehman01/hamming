ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_revenue_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;

-- gyms
DROP POLICY IF EXISTS gyms_select_own ON gyms;
CREATE POLICY gyms_select_own ON gyms FOR SELECT USING (id = auth.uid());
DROP POLICY IF EXISTS gyms_insert_own ON gyms;
CREATE POLICY gyms_insert_own ON gyms FOR INSERT WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS gyms_update_own ON gyms;
CREATE POLICY gyms_update_own ON gyms FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- helper policies for gym_id tables
DROP POLICY IF EXISTS customers_select ON customers;
CREATE POLICY customers_select ON customers FOR SELECT USING (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS customers_insert ON customers;
CREATE POLICY customers_insert ON customers FOR INSERT WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS customers_update ON customers;
CREATE POLICY customers_update ON customers FOR UPDATE USING (gym_id = auth.uid() OR auth.role() = 'service_role') WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS customers_delete ON customers;
CREATE POLICY customers_delete ON customers FOR DELETE USING (gym_id = auth.uid() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS trainers_select ON trainers;
CREATE POLICY trainers_select ON trainers FOR SELECT USING (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS trainers_insert ON trainers;
CREATE POLICY trainers_insert ON trainers FOR INSERT WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS trainers_update ON trainers;
CREATE POLICY trainers_update ON trainers FOR UPDATE USING (gym_id = auth.uid() OR auth.role() = 'service_role') WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS trainers_delete ON trainers;
CREATE POLICY trainers_delete ON trainers FOR DELETE USING (gym_id = auth.uid() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS subscriptions_select ON subscriptions;
CREATE POLICY subscriptions_select ON subscriptions FOR SELECT USING (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS subscriptions_insert ON subscriptions;
CREATE POLICY subscriptions_insert ON subscriptions FOR INSERT WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS subscriptions_update ON subscriptions;
CREATE POLICY subscriptions_update ON subscriptions FOR UPDATE USING (gym_id = auth.uid() OR auth.role() = 'service_role') WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS subscriptions_delete ON subscriptions;
CREATE POLICY subscriptions_delete ON subscriptions FOR DELETE USING (gym_id = auth.uid() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS payments_select ON payments;
CREATE POLICY payments_select ON payments FOR SELECT USING (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS payments_insert ON payments;
CREATE POLICY payments_insert ON payments FOR INSERT WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS payments_update ON payments;
CREATE POLICY payments_update ON payments FOR UPDATE USING (gym_id = auth.uid() OR auth.role() = 'service_role') WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS payments_delete ON payments;
CREATE POLICY payments_delete ON payments FOR DELETE USING (gym_id = auth.uid() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS expense_categories_select ON expense_categories;
CREATE POLICY expense_categories_select ON expense_categories FOR SELECT USING (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS expense_categories_insert ON expense_categories;
CREATE POLICY expense_categories_insert ON expense_categories FOR INSERT WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS expense_categories_update ON expense_categories;
CREATE POLICY expense_categories_update ON expense_categories FOR UPDATE USING (gym_id = auth.uid() OR auth.role() = 'service_role') WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS expense_categories_delete ON expense_categories;
CREATE POLICY expense_categories_delete ON expense_categories FOR DELETE USING (gym_id = auth.uid() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS expenses_select ON expenses;
CREATE POLICY expenses_select ON expenses FOR SELECT USING (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS expenses_insert ON expenses;
CREATE POLICY expenses_insert ON expenses FOR INSERT WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS expenses_update ON expenses;
CREATE POLICY expenses_update ON expenses FOR UPDATE USING (gym_id = auth.uid() OR auth.role() = 'service_role') WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS expenses_delete ON expenses;
CREATE POLICY expenses_delete ON expenses FOR DELETE USING (gym_id = auth.uid() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS monthly_summaries_select ON monthly_revenue_summaries;
CREATE POLICY monthly_summaries_select ON monthly_revenue_summaries FOR SELECT USING (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS monthly_summaries_insert ON monthly_revenue_summaries;
CREATE POLICY monthly_summaries_insert ON monthly_revenue_summaries FOR INSERT WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS monthly_summaries_update ON monthly_revenue_summaries;
CREATE POLICY monthly_summaries_update ON monthly_revenue_summaries FOR UPDATE USING (gym_id = auth.uid() OR auth.role() = 'service_role') WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS import_jobs_select ON import_jobs;
CREATE POLICY import_jobs_select ON import_jobs FOR SELECT USING (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS import_jobs_insert ON import_jobs;
CREATE POLICY import_jobs_insert ON import_jobs FOR INSERT WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS import_jobs_update ON import_jobs;
CREATE POLICY import_jobs_update ON import_jobs FOR UPDATE USING (gym_id = auth.uid() OR auth.role() = 'service_role') WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS import_jobs_delete ON import_jobs;
CREATE POLICY import_jobs_delete ON import_jobs FOR DELETE USING (gym_id = auth.uid() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS import_files_select ON import_files;
CREATE POLICY import_files_select ON import_files FOR SELECT USING (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS import_files_insert ON import_files;
CREATE POLICY import_files_insert ON import_files FOR INSERT WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS import_rows_select ON import_rows;
CREATE POLICY import_rows_select ON import_rows FOR SELECT USING (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS import_rows_insert ON import_rows;
CREATE POLICY import_rows_insert ON import_rows FOR INSERT WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS import_errors_select ON import_errors;
CREATE POLICY import_errors_select ON import_errors FOR SELECT USING (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS import_errors_insert ON import_errors;
CREATE POLICY import_errors_insert ON import_errors FOR INSERT WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS import_reconciliations_select ON import_reconciliations;
CREATE POLICY import_reconciliations_select ON import_reconciliations FOR SELECT USING (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS import_reconciliations_insert ON import_reconciliations;
CREATE POLICY import_reconciliations_insert ON import_reconciliations FOR INSERT WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS import_mappings_select ON import_mappings;
CREATE POLICY import_mappings_select ON import_mappings FOR SELECT USING (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS import_mappings_insert ON import_mappings;
CREATE POLICY import_mappings_insert ON import_mappings FOR INSERT WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS automation_templates_select ON automation_templates;
CREATE POLICY automation_templates_select ON automation_templates FOR SELECT USING (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS automation_templates_insert ON automation_templates;
CREATE POLICY automation_templates_insert ON automation_templates FOR INSERT WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS automation_templates_update ON automation_templates;
CREATE POLICY automation_templates_update ON automation_templates FOR UPDATE USING (gym_id = auth.uid() OR auth.role() = 'service_role') WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS gym_integrations_select ON gym_integrations;
CREATE POLICY gym_integrations_select ON gym_integrations FOR SELECT USING (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS gym_integrations_insert ON gym_integrations;
CREATE POLICY gym_integrations_insert ON gym_integrations FOR INSERT WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');
DROP POLICY IF EXISTS gym_integrations_update ON gym_integrations;
CREATE POLICY gym_integrations_update ON gym_integrations FOR UPDATE USING (gym_id = auth.uid() OR auth.role() = 'service_role') WITH CHECK (gym_id = auth.uid() OR auth.role() = 'service_role');

-- membership_plans is intentionally readable by authenticated users.
DROP POLICY IF EXISTS membership_plans_select_all ON membership_plans;
CREATE POLICY membership_plans_select_all ON membership_plans FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
DROP POLICY IF EXISTS membership_plans_update_service ON membership_plans;
CREATE POLICY membership_plans_update_service ON membership_plans FOR UPDATE USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
