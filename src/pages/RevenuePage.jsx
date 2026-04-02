import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import {
  ArrowUpRight,
  ArrowDownRight,
  IndianRupee,
  Users,
  CreditCard,
  TrendingUp,
  Plus,
  Calendar,
} from "lucide-react";
// Pricing is now managed dynamically via Supabase membership_plans table
const RevenuePage = () => {
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [durationStats, setDurationStats] = useState([]);
  const [reconciliation, setReconciliation] = useState({
    paymentsImported: 0,
    importedRevenue: 0,
    legacyRevenue: 0,
  });
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    monthlyRevenue: 0,
    monthlyGrowth: 0,
    totalGrowth: 0,
    averageRevenue: 0,
    activeSubs: 0,
  });
  // Expenses state
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [expenseMonth, setExpenseMonth] = useState(new Date());
  const [newCategoryName, setNewCategoryName] = useState("");
  const [expenseInputs, setExpenseInputs] = useState({});
  const [savingExpenses, setSavingExpenses] = useState(false);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [annualExpenseTotal, setAnnualExpenseTotal] = useState(0);
  const [expenseError, setExpenseError] = useState(null);
  const COLORS = ["#f5f5f5", "#d4d4d4", "#a3a3a3", "#737373", "#525252"];
  const safeAmount = (amt) => {
    const parsed = parseFloat(amt);
    return isFinite(parsed) ? parsed : 0;
  };
  const getCurrentGymId = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");
    return user.id;
  };
  const handleReportClick = () => {
    window.alert("Report export is coming soon.");
  };
  const handleLiveFeedClick = () => {
    window.alert("Live feed is coming soon.");
  };
  useEffect(() => {
    let isActive = true;
    fetchRevenueData({ isActive: () => isActive });
    return () => {
      isActive = false;
    };
  }, [expenseMonth]);
  useEffect(() => {
    let isActive = true;
    fetchExpensesData({ isActive: () => isActive });
    return () => {
      isActive = false;
    };
  }, [expenseMonth]);
  useEffect(() => {
    let isActive = true;
    fetchReconciliation({ isActive: () => isActive });
    return () => {
      isActive = false;
    };
  }, []);
  const fetchExpensesData = async ({ isActive = () => true } = {}) => {
    if (!isActive()) return;
    setExpenseError(null);
    try {
      const gymId = await getCurrentGymId();
      const { data: cats, error: catError } = await supabase
        .from("expense_categories")
        .select("*")
        .eq("gym_id", gymId)
        .eq("is_active", true)
        .order("name");
      if (catError) throw catError;
      if (!isActive()) return;
      setCategories(cats || []);
      const startOfMonth = new Date(
        expenseMonth.getFullYear(),
        expenseMonth.getMonth(),
        1,
      ).toISOString();
      const endOfMonth = new Date(
        expenseMonth.getFullYear(),
        expenseMonth.getMonth() + 1,
        0,
        23,
        59,
        59,
      ).toISOString();
      const { data: exps, error: expError } = await supabase
        .from("expenses")
        .select("*")
        .eq("gym_id", gymId)
        .gte("date", startOfMonth)
        .lte("date", endOfMonth);
      if (expError) throw expError;
      if (!isActive()) return;
      setExpenses(exps || []);
      const total = (exps || []).reduce(
        (sum, exp) => sum + safeAmount(exp.amount),
        0,
      );
      setExpenseTotal(total);
      // Fetch annual expenses for the selected year
      const startOfYear = new Date(
        expenseMonth.getFullYear(),
        0,
        1,
      ).toISOString();
      const endOfYear = new Date(
        expenseMonth.getFullYear(),
        11,
        31,
        23,
        59,
        59,
      ).toISOString();
      const { data: annualExps, error: annualExpError } = await supabase
        .from("expenses")
        .select("*")
        .eq("gym_id", gymId)
        .gte("date", startOfYear)
        .lte("date", endOfYear);
      if (annualExpError) throw annualExpError;
      if (!isActive()) return;
      const annTotal = (annualExps || []).reduce(
        (sum, exp) => sum + safeAmount(exp.amount),
        0,
      );
      setAnnualExpenseTotal(annTotal);
      const inputs = {};
      (exps || []).forEach((exp) => {
        inputs[exp.category_id] =
          (inputs[exp.category_id] || 0) + safeAmount(exp.amount);
      });
      setExpenseInputs(inputs);
    } catch (err) {
      console.error("Error fetching expenses:", err);
      if (!isActive()) return;
      setExpenseError("Failed to load expenses. Please try again.");
    }
  };
  const handleSaveExpenses = async () => {
    setSavingExpenses(true);
    setExpenseError(null);
    try {
      const gymId = await getCurrentGymId();
      const ledgerDate = new Date(
        expenseMonth.getFullYear(),
        expenseMonth.getMonth(),
        15,
      ).toISOString();
      const toUpsert = categories.map((category) => ({
        gym_id: gymId,
        category_id: category.id,
        amount: safeAmount(expenseInputs[category.id] || 0),
        date: ledgerDate,
      }));
      if (toUpsert.length > 0) {
        const { error } = await supabase
          .from("expenses")
          .upsert(toUpsert, { onConflict: "gym_id,category_id,date" });
        if (error) throw error;
      }
      fetchExpensesData();
    } catch (err) {
      console.error("Error saving expenses:", err);
      setExpenseError("Failed to save expenses. Please try again.");
    } finally {
      setSavingExpenses(false);
    }
  };
  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setExpenseError(null);
    try {
      const gymId = await getCurrentGymId();
      const { error } = await supabase
        .from("expense_categories")
        .insert({ name: newCategoryName.trim(), gym_id: gymId });
      if (error) throw error;
      setNewCategoryName("");
      fetchExpensesData();
    } catch (err) {
      console.error("Error adding category:", err);
      setExpenseError("Failed to add category. Please try again.");
    }
  };
  const fetchRevenueData = async ({ isActive = () => true } = {}) => {
    if (!isActive()) return;
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      const [paymentsResult, customersResult] = await Promise.all([
        supabase
          .from("payments")
          .select(` amount, status, created_at, subscriptions ( plan_name ) `)
          .eq("gym_id", user.id),
        supabase
          .from("customers")
          .select("membership_end_date")
          .eq("gym_id", user.id),
      ]);
      if (paymentsResult.error) throw paymentsResult.error;
      if (customersResult.error) throw customersResult.error;
      if (!isActive()) return;
      const completedPayments = (paymentsResult.data || []).filter(
        (payment) => String(payment.status || "").toLowerCase() === "completed",
      );
      const customerRows = customersResult.data || [];
      // Process revenue for the year of the currently selected expense month
      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const targetYear = expenseMonth.getFullYear();
      const monthlyRevenue = months.map((m) => ({ name: m, revenue: 0 }));
      const durationRevenue = {
        "1 MONTH": 0,
        "3 MONTHS": 0,
        "6 MONTHS": 0,
        "1 YEAR": 0,
        UNASSIGNED: 0,
      };
      let total = 0;
      let thisMonthTotal = 0;
      let lastMonthTotal = 0;
      let activeCount = 0;
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const currentMonth = now.getMonth();
      const currentYearNum = now.getFullYear();
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear =
        currentMonth === 0 ? currentYearNum - 1 : currentYearNum;
      customerRows.forEach((customer) => {
        const endDate = customer.membership_end_date
          ? new Date(customer.membership_end_date)
          : null;
        const isCurrentlyActive = !endDate || endDate >= now;
        if (isCurrentlyActive) {
          activeCount++;
        }
      });
      completedPayments.forEach((payment) => {
        const price = safeAmount(payment.amount);
        const date = new Date(payment.created_at);
        if (isNaN(date.getTime())) return;
        const planName = payment.subscriptions?.plan_name;
        if (planName && durationRevenue[planName] !== undefined) {
          durationRevenue[planName] += price;
        } else {
          durationRevenue.UNASSIGNED += price;
        }
        if (date.getFullYear() === targetYear) {
          monthlyRevenue[date.getMonth()].revenue += price;
        }
        total += price;
        if (
          date.getMonth() === currentMonth &&
          date.getFullYear() === currentYearNum
        ) {
          thisMonthTotal += price;
        }
        if (
          date.getMonth() === lastMonth &&
          date.getFullYear() === lastMonthYear
        ) {
          lastMonthTotal += price;
        }
      });
      const monthlyGrowth =
        lastMonthTotal > 0
          ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100
          : thisMonthTotal > 0
            ? 100
            : 0;
      // Better growth metric: monthContributionPct (contribution of this month to total revenue YTD)
      const ytdTotal = monthlyRevenue.reduce((sum, m) => sum + m.revenue, 0);
      const prevYtdTotal = ytdTotal - thisMonthTotal;
      const monthContributionPct =
        prevYtdTotal > 0
          ? (thisMonthTotal / prevYtdTotal) * 100
          : thisMonthTotal > 0
            ? 100
            : 0;
      setRevenueData(monthlyRevenue);
      const durStatsArray = [
        { name: "1 Month", value: durationRevenue["1 MONTH"] },
        { name: "3 Months", value: durationRevenue["3 MONTHS"] },
        { name: "6 Months", value: durationRevenue["6 MONTHS"] },
        { name: "1 Year", value: durationRevenue["1 YEAR"] },
        { name: "Unassigned", value: durationRevenue.UNASSIGNED },
      ].filter((d) => d.value > 0);
      setDurationStats(durStatsArray);
      setMetrics({
        totalRevenue: total,
        monthlyRevenue: thisMonthTotal,
        monthlyGrowth: monthlyGrowth,
        totalGrowth: monthContributionPct,
        averageRevenue: completedPayments.length
          ? Math.round(total / completedPayments.length)
          : 0,
        activeSubs: activeCount,
      });
    } catch (err) {
      console.error("Error fetching revenue:", err);
      if (!isActive()) return;
      setFetchError("Failed to load revenue data.");
    } finally {
      if (isActive()) {
        setLoading(false);
      }
    }
  };
  const fetchReconciliation = async ({ isActive = () => true } = {}) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      // Fetch last payment and customer import reconciliation records
      const { data: paymentRec, error: paymentRecError } = await supabase
        .from("import_reconciliations")
        .select("imported_value, legacy_value, metric_name")
        .eq("gym_id", user.id)
        .in("metric_name", ["payments_count", "completed_revenue"])
        .order("created_at", { ascending: false });
      if (paymentRecError) throw paymentRecError;
      let paymentsImported = 0;
      let importedRevenue = 0;
      let legacyRevenue = 0;
      if (paymentRec) {
        const paymentsRec = paymentRec.find(
          (r) => r.metric_name === "payments_count",
        );
        const revenueRec = paymentRec.find(
          (r) => r.metric_name === "completed_revenue",
        );
        if (paymentsRec) paymentsImported = paymentsRec.imported_value;
        if (revenueRec) {
          importedRevenue = revenueRec.imported_value;
          legacyRevenue = revenueRec.legacy_value || 0;
        }
      }
      if (!isActive()) return;
      setReconciliation({ paymentsImported, importedRevenue, legacyRevenue });
    } catch (err) {
      console.error("Error fetching reconciliation:", err);
    }
  };
  if (loading) {
    return (
      <div className="app-page p-4 md:p-10">
        <div className="mb-8 p-6 border border-white/10 bg-white/5 text-white/70 text-xs tracking-[0.08em] font-light dm-sans-copy animate-pulse">
          Loading revenue data...
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="app-page p-4 md:p-10">
        <div className="mb-8 p-4 border bg-red-500/10 border-red-500/20 text-red-500 text-xs tracking-[0.08em] font-light dm-sans-copy">
          {fetchError}
        </div>
      </div>
    );
  }

  return (
    <div className="app-page p-4 md:p-10">
      {" "}
      <header className="mb-8 md:mb-12 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
        {" "}
        <div>
          {" "}
          <p className="text-xs tracking-[0.08em] text-white/40 font-light dm-sans-copy mb-2">
            Financial Engine
          </p>{" "}
          <h1 className="text-4xl md:text-5xl font-medium tracking-tighter">
            Revenue <span className="text-white/20">Analytics</span>
          </h1>{" "}
        </div>{" "}
        <div className="flex gap-4 w-full sm:w-auto">
          {" "}
          <button
            onClick={handleReportClick}
            className="flex-1 sm:flex-none px-4 md:px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-xs tracking-[0.08em] font-light dm-sans-copy hover:bg-white/10 transition-all text-center"
          >
            {" "}
            Report{" "}
          </button>{" "}
          <button
            onClick={handleLiveFeedClick}
            className="flex-1 sm:flex-none px-4 md:px-6 py-3 bg-white text-black rounded-xl text-xs tracking-[0.08em] font-light dm-sans-copy hover:bg-white/90 transition-all text-center"
          >
            {" "}
            Live Feed{" "}
          </button>{" "}
        </div>{" "}
      </header>
      {expenseError && (
        <div className="mb-8 p-4 border bg-red-500/10 border-red-500/20 text-red-500 text-xs tracking-[0.08em] font-light dm-sans-copy">
          {expenseError}
        </div>
      )}
      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {" "}
        {[
          {
            label: "Total Revenue",
            value: `₹${metrics.totalRevenue.toLocaleString()}`,
            icon: <IndianRupee size={20} />,
            trend: null,
          },
          {
            label: "Monthly Income",
            value: `₹${metrics.monthlyRevenue.toLocaleString()}`,
            icon: <TrendingUp size={20} />,
            trend: metrics.monthlyGrowth,
          },
          {
            label: "Avg per User",
            value: `₹${metrics.averageRevenue.toLocaleString()}`,
            icon: <Users size={20} />,
            trend: null,
          },
          {
            label: "Active Subs",
            value: metrics.activeSubs.toString(),
            icon: <CreditCard size={20} />,
            trend: null,
          },
        ].map((item, i) => (
          <div
            key={i}
            className="bg-[#151921] border border-white/5 p-8 rounded-2xl shadow-2xl shadow-black/40 group hover:-translate-y-1 transition-all"
          >
            {" "}
            <div className="flex justify-between items-start mb-6">
              {" "}
              <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-white/40 group-hover:text-white transition-colors">
                {" "}
                {item.icon}{" "}
              </div>{" "}
              {item.trend !== null && (
                <div
                  className={`flex items-center gap-1 text-[10px] font-bold font-mono ${item.trend >= 0 ? "text-white/80" : "text-red-400"}`}
                >
                  {" "}
                  {item.trend >= 0 ? (
                    <ArrowUpRight size={12} />
                  ) : (
                    <ArrowDownRight size={12} />
                  )}{" "}
                  {item.trend > 0 ? "+" : ""}
                  {item.trend.toFixed(1)}%{" "}
                </div>
              )}{" "}
            </div>{" "}
            <p className="text-xs tracking-[0.08em] text-white/40 font-light dm-sans-copy mb-1">
              {item.label}
            </p>{" "}
            <h3 className="text-2xl font-medium tracking-tight">
              {item.value}
            </h3>{" "}
          </div>
        ))}{" "}
      </section>{" "}
      {/* Migration Reconciliation Cards */}{" "}
      {(reconciliation.paymentsImported > 0 ||
        reconciliation.importedRevenue > 0) && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {" "}
          <div className="border border-white/10 bg-white/[0.02] p-6 rounded-lg">
            {" "}
            <p className="text-xs tracking-[0.08em] font-light dm-sans-copy text-white/40 mb-2">
              Payments Imported
            </p>{" "}
            <p className="text-3xl text-white font-medium">
              {reconciliation.paymentsImported}
            </p>{" "}
            <p className="text-xs tracking-[0.08em] font-light dm-sans-copy text-white/30 mt-2">
              via CSV migration
            </p>{" "}
          </div>{" "}
          <div className="border border-white/10 bg-white/[0.02] p-6 rounded-lg">
            {" "}
            <p className="text-xs tracking-[0.08em] font-light dm-sans-copy text-white/40 mb-2">
              Imported Revenue
            </p>{" "}
            <p className="text-3xl text-white font-medium">
              ₹{reconciliation.importedRevenue.toLocaleString()}
            </p>{" "}
            <p className="text-xs tracking-[0.08em] font-light dm-sans-copy text-white/30 mt-2">
              completed payments
            </p>{" "}
          </div>{" "}
          <div className="border border-white/10 bg-white/[0.02] p-6 rounded-lg">
            {" "}
            <p className="text-xs tracking-[0.08em] font-light dm-sans-copy text-white/40 mb-2">
              Legacy Revenue
            </p>{" "}
            <p className="text-3xl text-amber-400 font-medium">
              ₹{reconciliation.legacyRevenue.toLocaleString()}
            </p>{" "}
            <p className="text-xs tracking-[0.08em] font-light dm-sans-copy text-white/30 mt-2">
              pre-import historical
            </p>{" "}
          </div>{" "}
        </section>
      )}{" "}
      <div className="pb-10">
        {" "}
        {/* Main Polygraph Chart */}{" "}
        <div className="bg-[#151921] border border-white/10 p-6 md:p-10 rounded-2xl md:rounded-[2rem] shadow-2xl shadow-black/30">
          {" "}
          <div className="flex justify-between items-center mb-8">
            {" "}
            <div>
              {" "}
              <h3
                className="text-xl font-normal tracking-[0.02em]"
                style={{ fontFamily: "DM Sans, sans-serif" }}
              >
                Growth Polygraph
              </h3>{" "}
              <p className="text-xs tracking-[0.08em] text-white/40 font-light dm-sans-copy">
                Monthly Revenue Streams
              </p>{" "}
            </div>{" "}
            <div className="flex gap-2">
              {" "}
              <div className="w-2.5 h-2.5 bg-white rounded-full" />{" "}
              <span className="text-xs font-light tracking-[0.08em] text-white/60 dm-sans-copy">
                Income Projection
              </span>{" "}
            </div>{" "}
          </div>{" "}
          <div className="h-[350px] w-full">
            {" "}
            <ResponsiveContainer width="100%" height="100%">
              {" "}
              <AreaChart data={revenueData}>
                {" "}
                <defs>
                  {" "}
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    {" "}
                    <stop
                      offset="5%"
                      stopColor="#ffffff"
                      stopOpacity={0.22}
                    />{" "}
                    <stop
                      offset="95%"
                      stopColor="#ffffff"
                      stopOpacity={0}
                    />{" "}
                  </linearGradient>{" "}
                </defs>{" "}
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#ffffff12"
                  vertical={false}
                />{" "}
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "#ffffff80",
                    fontSize: 10,
                    fontWeight: 500,
                  }}
                  dy={10}
                />{" "}
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "#ffffff80",
                    fontSize: 10,
                    fontWeight: 500,
                  }}
                  tickFormatter={(value) => `₹${value / 1000}k`}
                />{" "}
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#151921",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: "1rem",
                  }}
                  itemStyle={{ color: "#fff", fontSize: "12px" }}
                  cursor={{ stroke: "#ffffff", strokeWidth: 1 }}
                />{" "}
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#ffffff"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                  animationDuration={1200}
                />{" "}
              </AreaChart>{" "}
            </ResponsiveContainer>{" "}
          </div>{" "}
        </div>{" "}
      </div>{" "}
      {/* Expenses Ledger */}{" "}
      <section className="bg-[#151921] border border-white/5 p-6 md:p-10 rounded-2xl shadow-2xl shadow-black/40 mb-10">
        {" "}
        <div className="flex justify-between items-center mb-8">
          {" "}
          <div>
            {" "}
            <h3
              className="text-xl font-normal tracking-[0.02em] text-white"
              style={{ fontFamily: "DM Sans, sans-serif" }}
            >
              Operating Expenses
            </h3>{" "}
            <p className="text-xs tracking-[0.08em] text-white/40 font-light dm-sans-copy">
              {" "}
              {expenseMonth.toLocaleString("default", {
                month: "long",
                year: "numeric",
              })}{" "}
              Tracker{" "}
            </p>{" "}
          </div>{" "}
          <div className="flex items-center gap-2 bg-[#0a0c10] border border-white/5 rounded-lg p-2">
            {" "}
            <Calendar size={16} className="text-white/40" />{" "}
            <select
              value={`${expenseMonth.getFullYear()}-${String(expenseMonth.getMonth()).padStart(2, "0")}`}
              onChange={(e) => {
                const [year, month] = e.target.value.split("-");
                setExpenseMonth(new Date(parseInt(year), parseInt(month), 1));
              }}
              className="bg-[#0a0c10] border border-white/10 px-3 py-1 text-xs font-light tracking-[0.08em] dm-sans-copy text-white focus:outline-none focus:border-white/30 cursor-pointer hover:bg-white/5 transition-colors rounded"
            >
              {" "}
              {Array.from({ length: 24 }).map((_, i) => {
                const date = new Date();
                date.setMonth(date.getMonth() - i);
                const year = date.getFullYear();
                const month = date.getMonth();
                const value = `${year}-${String(month).padStart(2, "0")}`;
                const label = date.toLocaleString("default", {
                  month: "long",
                  year: "numeric",
                });
                return (
                  <option
                    key={value}
                    value={value}
                    className="bg-[#0a0c10] text-white"
                  >
                    {" "}
                    {label}{" "}
                  </option>
                );
              })}{" "}
            </select>{" "}
          </div>{" "}
        </div>{" "}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {" "}
          <div className="lg:col-span-2 space-y-4">
            {" "}
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center gap-4 bg-[#0a0c10] p-4 rounded-xl border border-white/5"
              >
                {" "}
                <div
                  className="w-1/3 text-xs font-light tracking-[0.08em] text-white/80"
                  style={{ fontFamily: "Inter, sans-serif", fontWeight: 500 }}
                >
                  {cat.name}
                </div>{" "}
                <div className="relative flex-1">
                  {" "}
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-mono">
                    ₹
                  </span>{" "}
                  <input
                    type="number"
                    min="0"
                    value={expenseInputs[cat.id] || ""}
                    onChange={(e) =>
                      setExpenseInputs({
                        ...expenseInputs,
                        [cat.id]: e.target.value,
                      })
                    }
                    placeholder="0.00"
                    className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-4 py-2 focus:outline-none focus:border-red-400/50 transition-colors text-white font-mono"
                  />{" "}
                </div>{" "}
              </div>
            ))}{" "}
            <div className="pt-4 flex justify-end">
              {" "}
              <button
                onClick={handleSaveExpenses}
                disabled={savingExpenses}
                className="bg-emerald-500 hover:bg-emerald-400 text-black font-light tracking-[0.08em] dm-sans-copy px-8 py-3 rounded-xl text-xs transition-all flex items-center gap-2"
              >
                {" "}
                {savingExpenses ? "Saving..." : "Save Ledger"}{" "}
              </button>{" "}
            </div>{" "}
            <form
              onSubmit={handleAddCategory}
              className="bg-[#0a0c10] border border-white/5 p-2 rounded-xl w-fit"
            >
              {" "}
              <p className="text-xs font-light tracking-[0.08em] dm-sans-copy text-white/40 mb-3">
                Add Custom Category
              </p>{" "}
              <div className="flex gap-2">
                {" "}
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Marketing"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs font-light tracking-[0.08em] dm-sans-copy text-white focus:outline-none focus:border-emerald-500/50"
                />{" "}
                <button
                  type="submit"
                  className="bg-white/10 hover:bg-white/20 px-3 rounded-lg text-white transition-colors"
                >
                  {" "}
                  <Plus size={14} />{" "}
                </button>{" "}
              </div>{" "}
            </form>{" "}
          </div>{" "}
          <div className="space-y-6">
            {" "}
            <div className="bg-[#0a0c10] border border-white/5 p-6 rounded-xl space-y-6">
              {" "}
              <div className="grid grid-cols-2 gap-6">
                {" "}
                <div>
                  {" "}
                  <h4
                    className="text-xs tracking-[0.08em] text-white/40 mb-1"
                    style={{ fontFamily: "Inter, sans-serif", fontWeight: 500 }}
                  >
                    Total Revenue
                  </h4>{" "}
                  <p className="text-3xl font-bold text-white tracking-tight">
                    ₹
                    {(
                      revenueData[expenseMonth.getMonth()]?.revenue || 0
                    ).toLocaleString()}
                  </p>{" "}
                </div>{" "}
                <div>
                  {" "}
                  <h4
                    className="text-xs tracking-[0.08em] text-white/40 mb-1"
                    style={{ fontFamily: "Inter, sans-serif", fontWeight: 500 }}
                  >
                    Total Expenses
                  </h4>{" "}
                  <p className="text-3xl font-bold text-red-400 tracking-tight">
                    ₹{expenseTotal.toLocaleString()}
                  </p>{" "}
                </div>{" "}
              </div>{" "}
              <div className="pt-6 border-t border-white/5">
                {" "}
                <h4
                  className="text-xs tracking-[0.08em] text-white/40 mb-1"
                  style={{ fontFamily: "Inter, sans-serif", fontWeight: 500 }}
                >
                  Net Profit (
                  {expenseMonth.toLocaleString("default", {
                    month: "short",
                  })}
                  )
                </h4>{" "}
                <p className="text-2xl font-bold text-white tracking-tight">
                  {" "}
                  ₹
                  {(
                    (revenueData[expenseMonth.getMonth()]?.revenue || 0) -
                    expenseTotal
                  ).toLocaleString()}{" "}
                </p>{" "}
              </div>{" "}
              <div className="pt-6 border-t border-white/5">
                {" "}
                <h4
                  className="text-xs tracking-[0.08em] text-white/40 mb-3"
                  style={{ fontFamily: "Inter, sans-serif", fontWeight: 500 }}
                >
                  Annual Overview ({expenseMonth.getFullYear()})
                </h4>{" "}
                <div className="flex justify-between items-center mb-2">
                  {" "}
                  <span
                    className="text-xs text-white/40 tracking-[0.08em]"
                    style={{ fontFamily: "Inter, sans-serif", fontWeight: 500 }}
                  >
                    YTD Expenses
                  </span>{" "}
                  <span className="text-sm font-bold text-red-400">
                    ₹{annualExpenseTotal.toLocaleString()}
                  </span>{" "}
                </div>{" "}
                <div className="flex justify-between items-center">
                  {" "}
                  <span
                    className="text-xs text-white/40 tracking-[0.08em]"
                    style={{ fontFamily: "Inter, sans-serif", fontWeight: 500 }}
                  >
                    YTD Net Profit
                  </span>{" "}
                  <span className="text-sm font-bold text-white">
                    {" "}
                    ₹
                    {(
                      revenueData.reduce((sum, item) => sum + item.revenue, 0) -
                      annualExpenseTotal
                    ).toLocaleString()}{" "}
                  </span>{" "}
                </div>{" "}
              </div>{" "}
            </div>{" "}
          </div>{" "}
        </div>{" "}
      </section>{" "}
      {/* Comparison Bar Diagram */}{" "}
      <section className="bg-[#151921] border border-white/5 p-6 md:p-10 rounded-2xl shadow-2xl shadow-black/40 mb-10">
        {" "}
        <div className="flex justify-between items-center mb-10">
          {" "}
          <div>
            {" "}
            <h3
              className="text-xl font-normal tracking-[0.02em]"
              style={{ fontFamily: "DM Sans, sans-serif" }}
            >
              Income Distribution
            </h3>{" "}
            <p className="text-xs tracking-[0.08em] text-white/40 font-light dm-sans-copy">
              Comparison by Membership Level
            </p>{" "}
          </div>{" "}
        </div>{" "}
        <div className="h-[200px] w-full">
          {" "}
          <ResponsiveContainer width="100%" height="100%">
            {" "}
            <BarChart data={durationStats}>
              {" "}
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#ffffff08"
                vertical={false}
              />{" "}
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#ffffff30", fontSize: 10 }}
              />{" "}
              <YAxis hide />{" "}
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
                contentStyle={{
                  backgroundColor: "#151921",
                  border: "none",
                  borderRadius: "1rem",
                }}
              />{" "}
              <Bar
                dataKey="value"
                fill="#ffffff80"
                radius={[10, 10, 0, 0]}
              />{" "}
            </BarChart>{" "}
          </ResponsiveContainer>{" "}
        </div>{" "}
      </section>{" "}
    </div>
  );
};
export default RevenuePage;
