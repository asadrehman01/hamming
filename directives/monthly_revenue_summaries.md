# Monthly Revenue Summaries

> Note: this document includes Supabase Edge Function references and the current UTC-safe summary flow.
> Do not embed service-role secrets directly in client-side or doc examples.

## Overview
This feature auto-generates revenue summaries on the 1st of each month for the previous month. Each summary includes:
- **Total Revenue**: Sum of all completed payments
- **Total Subscriptions**: Count of new subscriptions created
- **Total Expenses**: Sum of all expenses from that month
- **Net Profit**: Revenue minus expenses

## Components

### Database
- **Table**: `monthly_revenue_summaries`
  - `id`: UUID primary key
  - `gym_id`: UUID (references the gym/user)
  - `month_year`: DATE (first day of the month, e.g., 2026-01-01)
  - `total_revenue`: DECIMAL
  - `total_subscriptions`: INT
  - `total_expenses`: DECIMAL
  - `net_profit`: DECIMAL (calculated: revenue - expenses)
  - `created_at`, `updated_at`: Timestamps
  - **Unique Constraint**: `(gym_id, month_year)` - ensures one summary per gym per month

### Edge Function
- **Location**: `supabase/functions/generate-monthly-summary/`
- **Endpoint**: `POST /functions/v1/generate-monthly-summary`
- **Request Body**:
  ```json
  {
    "gym_id": "your-gym-id",
    "target_month": "2026-01-01" // Optional, defaults to previous month (YYYY-MM format)
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "summary": { /* monthly summary data */ },
    "message": "Monthly summary generated for January 2026"
  }
  ```

### Frontend
- **Component**: `MonthlySummaryCard.jsx` - Displays a single month's summary with 4 metric cards
- **Page**: `RevenuePage.jsx` - Displays all summaries and provides manual generation trigger
- **Features**:
  - Manual generation via dropdown + button
  - Display of up to 12 most recent summaries
  - Color-coded metrics (blue=revenue, orange=expenses, purple=subscriptions, green/red=profit)

## Setup & Deployment

### 1. Apply Database Migration
Run the migration to create the `monthly_revenue_summaries` table:
```bash
supabase db push
```

Or manually execute the SQL from `supabase/migrations/001_create_monthly_revenue_summaries.sql` in your Supabase dashboard.

### 2. Deploy Edge Function
```bash
supabase functions deploy generate-monthly-summary
```

Ensure your Supabase project has these secrets configured:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (for the client)

### 3. Set Up Automatic Monthly Trigger

#### Option A: Using Supabase's pg_cron Extension (Recommended)
If your Supabase project has `pg_cron` enabled, you can create a scheduled job:

```sql
-- Create a table to track cron executions (optional, for logging)
CREATE TABLE cron_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name TEXT,
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT,
  error TEXT
);

-- Schedule the monthly summary generation for 1st of each month at 00:30 UTC
-- This assumes you have a stored procedure or a secure server-side job that calls the Edge Function.

-- Alternative: Use pg_cron to call an HTTP endpoint via a secure server-side secret reference.
-- Keep the service-role key in a secret manager rather than in the SQL string.
SELECT cron.schedule('monthly_revenue_summary', '30 0 1 * *', 
  'SELECT net.http_post(
    ''https://your-project-ref.supabase.co/functions/v1/generate-monthly-summary'',
    ''{"gym_id":"all"}'',
    ''application/json'',
    ''Bearer <service-role-secret-from-secure-storage>''
  ) AS result');
```

#### Option B: Using an External Cron Service
Use a service like:
- **Vercel Cron** (if your app is on Vercel)
- **easycron.com** 
- **cronhub.io**
- **AWS EventBridge**
- **Google Cloud Scheduler**
- **IFTTT**

Configure it to POST to:
```
https://your-project-ref.supabase.co/functions/v1/generate-monthly-summary
```

With headers:
```
Authorization: Bearer YOUR_SERVICE_ROLE_KEY
Content-Type: application/json
```

And body:
```json
{
  "gym_id": "your-gym-id",
  "target_month": "2026-02-01"
}
```

#### Option C: Manual Trigger (Current)
Users can manually generate summaries via the RevenuePage UI:
1. Navigate to Revenue page
2. Scroll to "Monthly Revenue Summaries" section
3. Select month from dropdown
4. Click "Generate" button

## Usage

### Manual Generation
1. Go to **Revenue Page** → **Monthly Revenue Summaries** section
2. Select the month you want to summarize
3. Click "Generate" button
4. Summary will appear in the grid below

### Viewing Summaries
- Displays the 12 most recent monthly summaries
- Each card shows:
  - Total Revenue (blue)
  - Total Expenses (orange)
  - Total Subscriptions (purple)
  - Net Profit (green if positive, red if negative)
- Click the month header to see details

### Data Included in Calculations

**Total Revenue**:
- Source: `payments` table
- Filter: Status = "completed", created_at within the month

**Total Subscriptions**:
- Source: `subscriptions` table
- Filter: Created within the month
- Count: Number of new subscriptions

**Total Expenses**:
- Source: `expenses` table
- Filter: Date within the month
- Sum: All expense amounts for the month

**Net Profit**:
- Calculation: `total_revenue - total_expenses`

## API Examples

### Generate Summary for Previous Month
```javascript
const response = await fetch(
  'https://your-project.supabase.co/functions/v1/generate-monthly-summary',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      gym_id: currentUserId,
      // target_month omitted = defaults to previous month
    })
  }
);

const summary = await response.json();
console.log(summary);
```

### Generate Summary for Specific Month
```javascript
const response = await fetch(
  'https://your-project.supabase.co/functions/v1/generate-monthly-summary',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      gym_id: currentUserId,
      target_month: '2026-01' // YYYY-MM format
    })
  }
);

const summary = await response.json();
console.log(summary);
```

## Monitoring & Troubleshooting

### Viewing Edge Function Logs
In Supabase dashboard:
1. Go to **Edge Functions** → **generate-monthly-summary**
2. View **Logs** tab to see execution history and errors

### Common Issues

**Error: "User not authenticated"**
- Ensure the request includes a valid JWT token in the Authorization header
- For manual triggers within the app, this is automatic

**Error: "Month already exists"**
- This is expected if you try to regenerate the same month
- The function uses `upsert`, so it will update the existing summary

**No summaries appearing**
- Check database: Verify `monthly_revenue_summaries` table exists
- Check permissions: Ensure RLS policies are set correctly
- Check Edge Function deployment: Run `supabase functions list` to verify

### Performance Notes
- Summaries are calculated in real-time when generated
- For gyms with large transaction volumes (thousands/month), initial generation may take 5-10 seconds
- Results are cached in the database, so queries are fast afterward

## Future Enhancements
- [ ] Automatic monthly generation via pg_cron or external scheduler
- [ ] Email notifications with monthly summary
- [ ] Export summaries to PDF
- [ ] Year-over-year comparison charts
- [ ] Profit projections based on trend
- [ ] Custom date range summaries
- [ ] Multi-gym consolidated summaries (for franchise owners)
