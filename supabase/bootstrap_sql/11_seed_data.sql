INSERT INTO membership_plans (duration_type, price)
VALUES
  ('1 MONTH', 0),
  ('3 MONTHS', 0),
  ('6 MONTHS', 0),
  ('1 YEAR', 0)
ON CONFLICT (duration_type) DO NOTHING;

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
