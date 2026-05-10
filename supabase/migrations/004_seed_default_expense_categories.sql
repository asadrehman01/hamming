-- Seed default expense ledger categories and auto-seed for new gyms.

-- 1) Backfill defaults for existing gyms if missing.
INSERT INTO expense_categories (gym_id, name)
SELECT g.id, defaults.name
FROM gyms g
CROSS JOIN (
  VALUES
    ('Electricity'::text),
    ('Salaries'::text),
    ('Rent'::text)
) AS defaults(name)
LEFT JOIN expense_categories ec
  ON ec.gym_id = g.id
 AND lower(ec.name) = lower(defaults.name)
WHERE ec.id IS NULL;

-- 2) Auto-seed defaults for every new gym.
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