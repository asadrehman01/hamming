-- Make automation templates tenant-safe and seed default expiry template per gym.

-- 1) Scope uniqueness to each gym.
ALTER TABLE IF EXISTS automation_templates
  DROP CONSTRAINT IF EXISTS automation_templates_name_key;

ALTER TABLE IF EXISTS automation_templates
  DROP CONSTRAINT IF EXISTS automation_templates_gym_name_key;

ALTER TABLE IF EXISTS automation_templates
  ADD CONSTRAINT automation_templates_gym_name_key UNIQUE (gym_id, name);

-- 2) Backfill default expiry reminder for existing gyms that do not have one.
INSERT INTO automation_templates (gym_id, name, subject, body_text)
SELECT
  g.id,
  'EXPIRY_REMINDER',
  '{first_name}, your membership expires in 3 days',
  E'Hi {first_name},\n\nJust a quick reminder that your gym membership will expire in 3 days.\n\nRenew now to keep your workouts uninterrupted and continue your progress.\n\nIf you need any help with renewal, just reply to this email and we will assist you.\n\nSee you at the gym!'
FROM gyms g
LEFT JOIN automation_templates t
  ON t.gym_id = g.id
 AND t.name = 'EXPIRY_REMINDER'
WHERE t.id IS NULL;

-- 2b) Backfill default Google review template for existing gyms that do not have one.
INSERT INTO automation_templates (gym_id, name, subject, body_text)
SELECT
  g.id,
  'GOOGLE_REVIEW_REQUEST',
  'Welcome to the gym, {first_name}! Share your 5-star experience',
  E'Hi {first_name},\n\nWelcome to the gym. We are excited to have you with us.\n\nIf your first experience has been great, please rate us 5 stars on Google here:\n{review_link}\n\nYour feedback helps us grow and helps more people discover our gym.\n\nThank you for being part of our community!'
FROM gyms g
LEFT JOIN automation_templates t
  ON t.gym_id = g.id
 AND t.name = 'GOOGLE_REVIEW_REQUEST'
WHERE t.id IS NULL;

-- 3) Auto-seed default expiry reminder for every new gym.
CREATE OR REPLACE FUNCTION seed_default_automation_templates()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO automation_templates (gym_id, name, subject, body_text)
  VALUES (
    NEW.id,
    'EXPIRY_REMINDER',
    '{first_name}, your membership expires in 3 days',
    E'Hi {first_name},\n\nJust a quick reminder that your gym membership will expire in 3 days.\n\nRenew now to keep your workouts uninterrupted and continue your progress.\n\nIf you need any help with renewal, just reply to this email and we will assist you.\n\nSee you at the gym!'
  )
  ON CONFLICT (gym_id, name) DO NOTHING;

  INSERT INTO automation_templates (gym_id, name, subject, body_text)
  VALUES (
    NEW.id,
    'GOOGLE_REVIEW_REQUEST',
    'Welcome to the gym, {first_name}! Share your 5-star experience',
    E'Hi {first_name},\n\nWelcome to the gym. We are excited to have you with us.\n\nIf your first experience has been great, please rate us 5 stars on Google here:\n{review_link}\n\nYour feedback helps us grow and helps more people discover our gym.\n\nThank you for being part of our community!'
  )
  ON CONFLICT (gym_id, name) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gyms_seed_default_automation_templates ON gyms;
CREATE TRIGGER gyms_seed_default_automation_templates
AFTER INSERT ON gyms
FOR EACH ROW
EXECUTE FUNCTION seed_default_automation_templates();
