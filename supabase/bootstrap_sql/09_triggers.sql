CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gyms_set_updated_at ON gyms;
CREATE TRIGGER gyms_set_updated_at
BEFORE UPDATE ON gyms
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS membership_plans_set_updated_at ON membership_plans;
CREATE TRIGGER membership_plans_set_updated_at
BEFORE UPDATE ON membership_plans
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS customers_set_updated_at ON customers;
CREATE TRIGGER customers_set_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trainers_set_updated_at ON trainers;
CREATE TRIGGER trainers_set_updated_at
BEFORE UPDATE ON trainers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_set_updated_at
BEFORE UPDATE ON subscriptions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS expense_categories_set_updated_at ON expense_categories;
CREATE TRIGGER expense_categories_set_updated_at
BEFORE UPDATE ON expense_categories
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS expenses_set_updated_at ON expenses;
CREATE TRIGGER expenses_set_updated_at
BEFORE UPDATE ON expenses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS monthly_summaries_set_updated_at ON monthly_revenue_summaries;
CREATE TRIGGER monthly_summaries_set_updated_at
BEFORE UPDATE ON monthly_revenue_summaries
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS automation_templates_set_updated_at ON automation_templates;
CREATE TRIGGER automation_templates_set_updated_at
BEFORE UPDATE ON automation_templates
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS gym_integrations_set_updated_at ON gym_integrations;
CREATE TRIGGER gym_integrations_set_updated_at
BEFORE UPDATE ON gym_integrations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION seed_default_expense_categories()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO expense_categories (gym_id, name)
  VALUES
    (NEW.id, 'Electricity'),
    (NEW.id, 'Salaries'),
    (NEW.id, 'Rent')
  ON CONFLICT (gym_id, name) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gyms_seed_default_expense_categories ON gyms;
CREATE TRIGGER gyms_seed_default_expense_categories
AFTER INSERT ON gyms
FOR EACH ROW
EXECUTE FUNCTION seed_default_expense_categories();
