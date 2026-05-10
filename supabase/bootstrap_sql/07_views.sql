CREATE OR REPLACE VIEW active_customers AS
SELECT c.*
FROM customers c
WHERE c.gym_id = auth.uid()
  AND (c.membership_end_date IS NULL OR c.membership_end_date >= CURRENT_DATE);
