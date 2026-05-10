import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

interface MonthlySummaryInput {
  gym_id: string;
  target_month?: string; // YYYY-MM format, defaults to previous month
}

async function generateMonthlySummary(
  gym_id: string,
  targetMonth: Date
) {
  const { createClient } = await import(
    "https://esm.sh/@supabase/supabase-js@2.39.3"
  );
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // UTC-safe month boundaries
  const firstDayOfMonth = new Date(
    Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth(), 1)
  );
  const firstDayOfNextMonth = new Date(
    Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 1)
  );

  const startDate = firstDayOfMonth.toISOString();
  const endDate = firstDayOfNextMonth.toISOString();

  // 1. Calculate total revenue (sum of completed payments)
  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("amount")
    .eq("gym_id", gym_id)
    .eq("status", "completed")
    .gte("created_at", startDate)
    .lt("created_at", endDate);

  if (paymentsError) throw paymentsError;

  const totalRevenue = (payments || []).reduce(
    (sum, p) => sum + (parseFloat(p.amount) || 0),
    0
  );

  // 2. Calculate total subscriptions created during this month
  const { count: totalSubscriptions, error: subsError } = await supabase
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gym_id)
    .gte("created_at", startDate)
    .lt("created_at", firstDayOfNextMonth.toISOString());

  if (subsError) throw subsError;

  // 3. Calculate total expenses
  const { data: expenses, error: expensesError } = await supabase
    .from("expenses")
    .select("amount")
    .eq("gym_id", gym_id)
    .gte("date", startDate)
    .lt("date", endDate);

  if (expensesError) throw expensesError;

  const totalExpenses = (expenses || []).reduce(
    (sum, e) => sum + (parseFloat(e.amount) || 0),
    0
  );

  // 4. Calculate net profit
  const netProfit = totalRevenue - totalExpenses;

  // 5. Upsert the summary into monthly_revenue_summaries table
  const { data: summary, error: upsertError } = await supabase
    .from("monthly_revenue_summaries")
    .upsert([
      {
        gym_id,
        month_year: `${targetMonth.getUTCFullYear()}-${String(targetMonth.getUTCMonth() + 1).padStart(2, "0")}-01`,
        total_revenue: totalRevenue,
        total_subscriptions: totalSubscriptions || 0,
        total_expenses: totalExpenses,
        net_profit: netProfit,
      },
    ], { onConflict: "gym_id,month_year" })
    .select();

  if (upsertError) throw upsertError;

  return summary?.[0] || null;
}

Deno.serve(async (req: Request) => {
  // Only allow POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase environment variables" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body: MonthlySummaryInput = await req.json();
    const { gym_id, target_month } = body;

    if (!gym_id) {
      return new Response(JSON.stringify({ error: "gym_id is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse target month or default to previous month
    let targetDate: Date;
    if (target_month) {
      // Expected format: YYYY-MM
      const [year, month] = target_month.split("-").map(Number);
      if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        return new Response(JSON.stringify({ error: "target_month must be YYYY-MM" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      targetDate = new Date(Date.UTC(year, month - 1, 1));
    } else {
      // Default to previous month
      const today = new Date();
      targetDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    }

    // Generate the summary
    const summary = await generateMonthlySummary(gym_id, targetDate);

    return new Response(JSON.stringify({
      success: true,
      summary,
      message: `Monthly summary generated for ${targetDate.toLocaleDateString("en-US", { year: "numeric", month: "long" })}`,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating monthly summary:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
