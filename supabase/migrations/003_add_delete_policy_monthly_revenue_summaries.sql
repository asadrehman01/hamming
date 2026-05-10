-- Allow each authenticated gym user to permanently delete their own summary rows.
CREATE POLICY "Users can delete their own gym summaries"
  ON monthly_revenue_summaries
  FOR DELETE
  USING (gym_id = auth.uid());
