-- Create monthly_revenue_summaries table
CREATE TABLE IF NOT EXISTS monthly_revenue_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gym_id UUID NOT NULL,
  month_year DATE NOT NULL, -- First day of the month (e.g., 2026-01-01 for January 2026)
  total_revenue DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_subscriptions INT NOT NULL DEFAULT 0,
  total_expenses DECIMAL(10, 2) NOT NULL DEFAULT 0,
  net_profit DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(gym_id, month_year)
);

-- Add RLS policies
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

-- Add index on gym_id and month_year for faster queries
CREATE INDEX idx_monthly_summaries_gym_month 
  ON monthly_revenue_summaries(gym_id, month_year DESC);

-- Add trigger to update updated_at
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
