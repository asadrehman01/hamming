import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { getUserWithRetry } from "../lib/authUser";
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
  RotateCw,
  X,
} from "lucide-react";
import MonthlySummaryCard from "../components/MonthlySummaryCard";
import ConfirmSummaryRemovalModal from "../components/ConfirmSummaryRemovalModal";
import ConfirmExpenseCategoryRemovalModal from "../components/ConfirmExpenseCategoryRemovalModal";
// Pricing is now managed dynamically via Supabase membership_plans table
const RevenuePage = () => {
  const DEFAULT_EXPENSE_CATEGORIES = ["Electricity", "Salaries", "Rent"];

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
  const [categoryToRemove, setCategoryToRemove] = useState(null);
  const [removingCategoryId, setRemovingCategoryId] = useState("");

  const [monthlySummaries, setMonthlySummaries] = useState([]);
  const [loadingSummaries, setLoadingSummaries] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [generatingForMonth, setGeneratingForMonth] = useState(false);
  const [removingSummaryKey, setRemovingSummaryKey] = useState("");
  const [summaryToRemove, setSummaryToRemove] = useState(null);
  const [autoSummaryChecked, setAutoSummaryChecked] = useState(false);
  const [selectedSummaryMonth, setSelectedSummaryMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d;
  });

  const summaryMonthOptions = Array.from({ length: 36 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - index);
    return {
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleString("default", { month: "long", year: "numeric" }),
    };
  });

  const summariesSectionRef = React.useRef(null);
  const SUMMARY_TABLE_NAME = "monthly_revenue_summaries";
  const safeAmount = (amt) => {
    const parsed = parseFloat(amt);
    return isFinite(parsed) ? parsed : 0;
  };
  const normalizeDurationBucket = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const normalized = raw
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (/\b(1\s*year|12\s*months?)\b/.test(normalized)) return "1 YEAR";
    if (/\b6\s*months?\b/.test(normalized)) return "6 MONTHS";
    if (/\b3\s*months?\b/.test(normalized)) return "3 MONTHS";
    if (/\b(1\s*month|monthly)\b/.test(normalized)) return "1 MONTH";
    return null;
  };
  const normalizeCustomerName = (firstName, lastName) =>
    `${String(firstName || "").trim()} ${String(lastName || "").trim()}`
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const isTransientDataError = (error) => {
    const message = String(error?.message || error || "").toLowerCase();
    return (
      message.includes("failed to fetch") ||
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("lock broken") ||
      message.includes("steal option") ||
      message.includes("503") ||
      message.includes("429")
    );
  };
  const withRetry = async (operation, { retries = 2, baseDelayMs = 200 } = {}) => {
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (!isTransientDataError(error) || attempt === retries) {
          throw error;
        }
        await sleep(baseDelayMs * (attempt + 1));
      }
    }

    throw lastError;
  };
  const getLocalSummariesKey = (gymId) => `monthly_summaries_fallback_${gymId}`;
  const isSummaryTableMissingError = (error) => {
    const message = String(error?.message || "").toLowerCase();
    return message.includes("schema cache") && message.includes("monthly_revenue_summaries");
  };
  const readLocalSummaries = (gymId) => {
    try {
      const raw = localStorage.getItem(getLocalSummariesKey(gymId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const writeLocalSummaries = (gymId, summaries) => {
    localStorage.setItem(
      getLocalSummariesKey(gymId),
      JSON.stringify(summaries.slice(0, 12)),
    );
  };
  const upsertLocalSummary = (gymId, summary) => {
    const existing = readLocalSummaries(gymId);
    const filtered = existing.filter((item) => item.month_year !== summary.month_year);
    const updated = [summary, ...filtered].sort(
      (a, b) => new Date(b.month_year) - new Date(a.month_year),
    );
    writeLocalSummaries(gymId, updated);
    return updated.slice(0, 12);
  };
  const removeLocalSummary = (gymId, monthYear) => {
    const existing = readLocalSummaries(gymId);
    const updated = existing.filter((item) => item.month_year !== monthYear);
    writeLocalSummaries(gymId, updated);
    return updated.slice(0, 12);
  };
  const getMonthKey = (dateObj) =>
    `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-01`;
  const getCurrentGymId = async () => {
    const {
      data: { user },
    } = await getUserWithRetry(supabase);
    if (!user) throw new Error("User not authenticated");
    return user.id;
  };
  const handleReportClick = () => {
    if (summariesSectionRef.current) {
      summariesSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const fetchMonthlySummaries = async ({ isActive = () => true } = {}) => {
    if (!isActive()) return;
    setLoadingSummaries(true);
    setSummaryError(null);
    let gymId = null;
    try {
      gymId = await getCurrentGymId();
      const { data: summaries, error } = await supabase
        .from(SUMMARY_TABLE_NAME)
        .select("*")
        .eq("gym_id", gymId)
        .order("month_year", { ascending: false })
        .limit(12);

      if (error) throw error;
      if (!isActive()) return;
      setMonthlySummaries(summaries || []);
    } catch (err) {
      console.error("Error fetching monthly summaries:", err);
      if (!isActive()) return;
      if (gymId && isSummaryTableMissingError(err)) {
        const localSummaries = readLocalSummaries(gymId);
        setMonthlySummaries(localSummaries);
        setSummaryError(
          "Monthly summary table is not deployed yet. Showing local summaries on this browser.",
        );
      } else {
        setSummaryError("Failed to load monthly summaries. Please try again.");
      }
    } finally {
      if (isActive()) {
        setLoadingSummaries(false);
      }
    }
  };

  const generateMonthlySummary = async (targetMonth) => {
    setGeneratingForMonth(true);
    setSummaryError(null);
    try {
      const gymId = await getCurrentGymId();

      const firstDayOfMonth = new Date(
        Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth(), 1),
      );
      const firstDayOfNextMonth = new Date(
        Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 1),
      );
      const startDate = firstDayOfMonth.toISOString();
      const nextMonthStart = firstDayOfNextMonth.toISOString();

      const { data: payments, error: paymentsError } = await supabase
        .from("payments")
        .select("amount, created_at, revenue_month")
        .eq("gym_id", gymId)
        .eq("status", "completed")
        .or(
          `and(revenue_month.gte.${startDate},revenue_month.lt.${nextMonthStart}),and(revenue_month.is.null,created_at.gte.${startDate},created_at.lt.${nextMonthStart})`,
        );
      if (paymentsError) throw paymentsError;

      const totalRevenue = (payments || []).reduce((sum, payment) => {
        const recognitionDate = payment.revenue_month
          ? new Date(payment.revenue_month)
          : new Date(payment.created_at);
        if (Number.isNaN(recognitionDate.getTime())) return sum;
        if (recognitionDate < firstDayOfMonth || recognitionDate >= firstDayOfNextMonth) {
          return sum;
        }
        return sum + (parseFloat(payment.amount) || 0);
      }, 0);

      const { count: totalSubscriptions, error: subsError } = await supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("gym_id", gymId)
        .gte("created_at", startDate)
        .lt("created_at", nextMonthStart);
      if (subsError) throw subsError;

      const { data: expenseRows, error: expensesError } = await supabase
        .from("expenses")
        .select("amount")
        .eq("gym_id", gymId)
        .gte("date", startDate)
        .lt("date", nextMonthStart);
      if (expensesError) throw expensesError;

      const totalExpenses = (expenseRows || []).reduce(
        (sum, e) => sum + (parseFloat(e.amount) || 0),
        0,
      );

      const monthYear = firstDayOfMonth.toISOString().slice(0, 10);
      const summaryPayload = {
        gym_id: gymId,
        month_year: monthYear,
        total_revenue: totalRevenue,
        total_subscriptions: totalSubscriptions || 0,
        total_expenses: totalExpenses,
        net_profit: totalRevenue - totalExpenses,
      };

      const { error: upsertError } = await supabase
        .from(SUMMARY_TABLE_NAME)
        .upsert([summaryPayload], { onConflict: "gym_id,month_year" });

      if (upsertError) {
        if (isSummaryTableMissingError(upsertError)) {
          const localSummary = {
            id: `local-${gymId}-${monthYear}`,
            created_at: new Date().toISOString(),
            ...summaryPayload,
          };
          const updatedLocal = upsertLocalSummary(gymId, localSummary);
          setMonthlySummaries(updatedLocal);
          setSummaryError(
            "Summary table not found in Supabase yet. Saved this summary locally in this browser.",
          );
          window.alert(
            `Summary generated for ${new Date(targetMonth).toLocaleString("default", { month: "long", year: "numeric" })} (saved locally)`,
          );
          return;
        }
        throw upsertError;
      }

      await fetchMonthlySummaries();
      window.alert(
        `Summary generated for ${new Date(targetMonth).toLocaleString("default", { month: "long", year: "numeric" })}`,
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : JSON.stringify(err);
      console.error("Error generating monthly summary:", errorMessage);
      setSummaryError(errorMessage);
      window.alert(`Error generating summary: ${errorMessage}`);
    } finally {
      setGeneratingForMonth(false);
    }
  };

  const requestRemoveMonthlySummary = (summary) => {
    if (!summary?.month_year) return;
    setSummaryToRemove(summary);
  };

  const removeMonthlySummary = async () => {
    const summary = summaryToRemove;
    if (!summary?.month_year) return;

    const key = String(summary.id || summary.month_year);
    setRemovingSummaryKey(key);
    setSummaryError(null);

    try {
      const gymId = await getCurrentGymId();
      const isLocalOnly = String(summary.id || "").startsWith("local-");

      if (isLocalOnly) {
        const updatedLocal = removeLocalSummary(gymId, summary.month_year);
        setMonthlySummaries(updatedLocal);
        return;
      }

      let deleteQuery = supabase
        .from(SUMMARY_TABLE_NAME)
        .delete()
        .eq("gym_id", gymId);

      if (summary.id) {
        deleteQuery = deleteQuery.eq("id", summary.id);
      } else {
        deleteQuery = deleteQuery.eq("month_year", summary.month_year);
      }

      const { data: deletedRows, error: deleteError } = await deleteQuery.select("id");

      if (deleteError) {
        if (isSummaryTableMissingError(deleteError)) {
          const updatedLocal = removeLocalSummary(gymId, summary.month_year);
          setMonthlySummaries(updatedLocal);
          return;
        }
        throw deleteError;
      }

      if (!Array.isArray(deletedRows) || deletedRows.length === 0) {
        throw new Error("Delete was not permitted for this report.");
      }

      setMonthlySummaries((prev) =>
        prev.filter((item) => item.month_year !== summary.month_year),
      );
    } catch (error) {
      console.error("Failed to remove monthly summary:", error);
      const message = String(error?.message || "");
      const lower = message.toLowerCase();
      if (
        lower.includes("row-level security") ||
        lower.includes("permission denied") ||
        lower.includes("not permitted")
      ) {
        setSummaryError(
          "Delete is blocked by database policy. Please apply the latest Supabase migration for monthly summary delete permissions.",
        );
      } else {
        setSummaryError(message || "Failed to remove summary. Please try again.");
      }
    } finally {
      setRemovingSummaryKey("");
      setSummaryToRemove(null);
    }
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
  useEffect(() => {
    let isActive = true;
    fetchMonthlySummaries({ isActive: () => isActive });
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (loadingSummaries || generatingForMonth || autoSummaryChecked) return;

    const now = new Date();
    if (now.getDate() !== 1) {
      setAutoSummaryChecked(true);
      return;
    }

    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthKey = getMonthKey(previousMonth);
    const alreadyGenerated = (monthlySummaries || []).some(
      (summary) => summary.month_year === previousMonthKey,
    );

    if (alreadyGenerated) {
      setAutoSummaryChecked(true);
      return;
    }

    generateMonthlySummary(previousMonth).finally(() => {
      setAutoSummaryChecked(true);
    });
  }, [
    loadingSummaries,
    generatingForMonth,
    autoSummaryChecked,
    monthlySummaries,
  ]);
  const fetchExpensesData = async ({ isActive = () => true } = {}) => {
    if (!isActive()) return;
    setExpenseError(null);
    try {
      const gymId = await getCurrentGymId();
      const normalizeCategoryName = (name) =>
        String(name || "")
          .trim()
          .toLowerCase();

      const { data: allCats, error: catError } = await supabase
        .from("expense_categories")
        .select("id, name, is_active")
        .eq("gym_id", gymId)
        .order("name");
      if (catError) throw catError;

      const categoryNames = new Set(
        (allCats || []).map((cat) => normalizeCategoryName(cat.name)),
      );

      const missingDefaults = DEFAULT_EXPENSE_CATEGORIES.filter(
        (name) => !categoryNames.has(normalizeCategoryName(name)),
      );

      // Fallback seeding for users whose DB hasn't had the migration applied yet.
      if (missingDefaults.length > 0) {
        const { error: seedError } = await supabase
          .from("expense_categories")
          .insert(
            missingDefaults.map((name) => ({
              gym_id: gymId,
              name,
            })),
          );
        if (seedError) throw seedError;
      }

      let finalCategories = allCats || [];
      if (missingDefaults.length > 0) {
        const { data: refreshedCats, error: refreshError } = await supabase
          .from("expense_categories")
          .select("id, name, is_active")
          .eq("gym_id", gymId)
          .order("name");
        if (refreshError) throw refreshError;
        finalCategories = refreshedCats || [];
      }

      const activeCategories = finalCategories.filter((cat) => cat.is_active);

      if (!isActive()) return;
      setCategories(activeCategories);
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

      // First, delete all existing expense entries for these categories in the current month
      // This ensures old entries don't persist when amounts are cleared
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

      const categoryIds = categories.map((cat) => cat.id);
      let originalRows = [];
      if (categoryIds.length > 0) {
        // Fetch existing rows for restoration if subsequent insert fails
        const { data: fetchedRows, error: fetchError } = await supabase
          .from("expenses")
          .select("*")
          .eq("gym_id", gymId)
          .in("category_id", categoryIds)
          .gte("date", startOfMonth)
          .lte("date", endOfMonth);
        if (fetchError) throw fetchError;
        originalRows = fetchedRows || [];

        const { error: deleteError } = await supabase
          .from("expenses")
          .delete()
          .eq("gym_id", gymId)
          .in("category_id", categoryIds)
          .gte("date", startOfMonth)
          .lte("date", endOfMonth);
        if (deleteError) throw deleteError;
      }

      // Then insert only entries with non-zero amounts
      const toUpsert = categories
        .map((category) => ({
          gym_id: gymId,
          category_id: category.id,
          amount: safeAmount(expenseInputs[category.id] || 0),
          date: ledgerDate,
        }))
        .filter((item) => item.amount > 0); // Only insert if amount > 0

      if (toUpsert.length > 0) {
        const { error: insertError } = await supabase
          .from("expenses")
          .insert(toUpsert);
        if (insertError) {
          // Restore previously deleted rows on failure
          if (originalRows.length > 0) {
            await supabase.from("expenses").insert(originalRows);
          }
          throw insertError;
        }
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

  const requestRemoveCategory = (category) => {
    if (!category?.id) return;
    setCategoryToRemove(category);
  };

  const handleRemoveCategory = async () => {
    if (!categoryToRemove?.id) return;
    setExpenseError(null);
    setRemovingCategoryId(categoryToRemove.id);
    try {
      const gymId = await getCurrentGymId();
      
      // Delete all ledger entries for this category from all months
      const { error: deleteEntriesError } = await supabase
        .from("expenses")
        .delete()
        .eq("gym_id", gymId)
        .eq("category_id", categoryToRemove.id);
      if (deleteEntriesError) throw deleteEntriesError;

      // Mark the category as inactive
      const { data: updatedRows, error: deleteError } = await supabase
        .from("expense_categories")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("gym_id", gymId)
        .eq("id", categoryToRemove.id)
        .eq("is_active", true)
        .select("id");

      if (deleteError) throw deleteError;
      if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
        throw new Error("Delete was not permitted for this field.");
      }

      const removedId = categoryToRemove.id;
      setCategories((prev) => prev.filter((cat) => cat.id !== removedId));
      setExpenseInputs((prev) => {
        const next = { ...prev };
        delete next[removedId];
        return next;
      });
      
      // Refresh expense totals since we deleted ledger entries
      fetchExpensesData();
    } catch (err) {
      console.error("Error deleting category:", err);
      const message = String(err?.message || "");
      const lower = message.toLowerCase();
      if (lower.includes("row-level security") || lower.includes("permission denied")) {
        setExpenseError("Delete is blocked by database policy for this field.");
      } else {
        setExpenseError("Failed to delete field. Please try again.");
      }
    } finally {
      setRemovingCategoryId("");
      setCategoryToRemove(null);
    }
  };

  const fetchRevenueData = async ({ isActive = () => true } = {}) => {
    if (!isActive()) return;
    setLoading(true);
    setFetchError(null);
    try {
      const {
        data: { user },
      } = await withRetry(() => getUserWithRetry(supabase), { retries: 2 });
      if (!user) throw new Error("User not authenticated");
      const [paymentsResult, customersResult, subscriptionsResult] = await withRetry(
        () =>
          Promise.all([
            supabase
              .from("payments")
              .select(` amount, status, created_at, revenue_month, subscription_id, sender_name, matched_customer_id, subscriptions ( plan_name ) `)
              .eq("gym_id", user.id),
            supabase
              .from("customers")
              .select("id, first_name, last_name, membership_end_date, membership_duration")
              .eq("gym_id", user.id),
            supabase
              .from("subscriptions")
              .select("id, amount, plan_name, status, created_at")
              .eq("gym_id", user.id),
          ]),
        { retries: 2 },
      );
      if (paymentsResult.error) throw paymentsResult.error;
      if (customersResult.error) throw customersResult.error;
      if (subscriptionsResult.error) throw subscriptionsResult.error;
      if (!isActive()) return;
      const completedPayments = (paymentsResult.data || []).filter(
        (payment) => String(payment.status || "").trim().toLowerCase() === "completed",
      );
      const subscriptionRows = subscriptionsResult.data || [];
      const completedPaymentSubscriptionIds = new Set(
        completedPayments
          .map((payment) => payment.subscription_id)
          .filter(Boolean),
      );

      // Backfill revenue from subscription ledger when no completed payment exists.
      const fallbackSubscriptionRevenue = subscriptionRows
        .filter((subscription) => {
          const normalizedStatus = String(subscription.status || "").trim().toLowerCase();
          return (
            (normalizedStatus === "active" || normalizedStatus === "completed") &&
            !completedPaymentSubscriptionIds.has(subscription.id)
          );
        })
        .map((subscription) => ({
          amount: subscription.amount,
          created_at: subscription.created_at,
          subscriptions: { plan_name: subscription.plan_name },
        }));

      const revenueRows = [...completedPayments, ...fallbackSubscriptionRevenue];
      const customerRows = customersResult.data || [];
      const membershipDurationByCustomerId = new Map();
      const membershipDurationByName = new Map();
      const duplicateCustomerNames = new Set();

      customerRows.forEach((customer) => {
        if (customer?.id) {
          membershipDurationByCustomerId.set(customer.id, customer.membership_duration || "");
        }
        const nameKey = normalizeCustomerName(customer.first_name, customer.last_name);
        if (!nameKey) return;
        if (membershipDurationByName.has(nameKey)) {
          duplicateCustomerNames.add(nameKey);
          membershipDurationByName.delete(nameKey);
          return;
        }
        membershipDurationByName.set(nameKey, customer.membership_duration || "");
      });
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
      let selectedMonthTotal = 0;
      let previousMonthTotal = 0;
      let activeCount = 0;
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const selectedMonth = expenseMonth.getMonth();
      const selectedYear = expenseMonth.getFullYear();
      const prevMonthDate = new Date(selectedYear, selectedMonth - 1, 1);
      const previousMonth = prevMonthDate.getMonth();
      const previousMonthYear = prevMonthDate.getFullYear();
      customerRows.forEach((customer) => {
        const endDate = customer.membership_end_date
          ? new Date(customer.membership_end_date)
          : null;
        const isCurrentlyActive = !endDate || endDate >= now;
        if (isCurrentlyActive) {
          activeCount++;
        }
      });
      revenueRows.forEach((payment) => {
        const price = safeAmount(payment.amount);
        const date = payment.revenue_month ? new Date(payment.revenue_month) : new Date(payment.created_at);
        if (isNaN(date.getTime())) return;
        const senderNameKey = String(payment.sender_name || "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();

        const paymentPlanDuration = normalizeDurationBucket(payment.subscriptions?.plan_name);
        const matchedCustomerDuration = normalizeDurationBucket(
          membershipDurationByCustomerId.get(payment.matched_customer_id),
        );
        const fallbackDuration =
          senderNameKey && !duplicateCustomerNames.has(senderNameKey)
            ? normalizeDurationBucket(membershipDurationByName.get(senderNameKey))
            : null;
        const durationKey = paymentPlanDuration || matchedCustomerDuration || fallbackDuration;

        if (durationKey && durationRevenue[durationKey] !== undefined) {
          durationRevenue[durationKey] += price;
        } else {
          durationRevenue.UNASSIGNED += price;
        }
        if (date.getFullYear() === targetYear) {
          monthlyRevenue[date.getMonth()].revenue += price;
        }
        total += price;
        if (date.getMonth() === selectedMonth && date.getFullYear() === selectedYear) {
          selectedMonthTotal += price;
        }
        if (date.getMonth() === previousMonth && date.getFullYear() === previousMonthYear) {
          previousMonthTotal += price;
        }
      });
      const monthlyGrowth =
        previousMonthTotal > 0
          ? ((selectedMonthTotal - previousMonthTotal) / previousMonthTotal) * 100
          : selectedMonthTotal > 0
            ? 100
            : 0;
      // Better growth metric: monthContributionPct (contribution of this month to total revenue YTD)
      const ytdTotal = monthlyRevenue.reduce((sum, m) => sum + m.revenue, 0);
      const prevYtdTotal = ytdTotal - selectedMonthTotal;
      const monthContributionPct =
        prevYtdTotal > 0
          ? (selectedMonthTotal / prevYtdTotal) * 100
          : selectedMonthTotal > 0
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
        monthlyRevenue: selectedMonthTotal,
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
      if (isTransientDataError(err)) {
        setFetchError("Temporary connection issue while loading revenue data. Please wait a moment or refresh.");
      } else {
        setFetchError("Failed to load revenue data.");
      }
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
      } = await getUserWithRetry(supabase);
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
      <div className="app-page revenue-page-vibe p-4 md:p-10">
        <style>{` 
.revenue-page-vibe { background-color: #ffffff !important; color: #0d0d0d; min-height: 100vh; }
.revenue-header-title { font-family: 'Playfair Display', serif; font-weight: 400; color: #0d0d0d; letter-spacing: 0.02em; }
.communications-subtle { color: #666666; }
`}</style>
        <div className="mb-8 p-6 border border-[#e6e6e6] bg-[#fbfbfb] text-[#666666] text-xs tracking-[0.08em] font-light dm-sans-copy animate-pulse">
          Loading revenue data...
        </div>
      </div>
    );
  }

  if (fetchError) {
      return (
        <div className="app-page revenue-page-vibe p-4 md:p-10">
          <style>{` 
          .revenue-page-vibe { background-color: #ffffff !important; color: #0d0d0d; min-height: 100vh; }
          .revenue-header-title { font-family: 'Playfair Display', serif; font-weight: 400; color: #0d0d0d; letter-spacing: 0.02em; }
          .communications-subtle { color: #666666; }
          `}</style>
          <div className="mb-8 p-4 border bg-red-500/10 border-red-500/20 text-red-500 text-xs tracking-[0.08em] font-light dm-sans-copy">
            {fetchError}
          </div>
        </div>
      );
  }

  return (
    <div className="app-page revenue-page-vibe p-4 md:p-10">
      <style>{` 
.revenue-page-vibe { background-color: #ffffff !important; color: #0d0d0d; min-height: 100vh; }
.revenue-header-title { font-family: 'Playfair Display', serif; font-weight: 400; color: #0d0d0d; letter-spacing: 0.02em; }
.communications-subtle { color: #666666; }
.revenue-page-vibe .revenue-panel { background: #fafafa; border-color: rgba(0, 0, 0, 0.12); color: #0d0d0d; }
.revenue-page-vibe .revenue-panel-muted { color: #666666; }
.revenue-page-vibe .revenue-chart-bg { background: #fafafa; border-color: rgba(0, 0, 0, 0.12); }
.revenue-page-vibe .revenue-card-title { color: #6b6b6b; }
.revenue-page-vibe .revenue-input-dark { background: #ffffff; border-color: #e0e0e0; color: #0d0d0d; }
.revenue-page-vibe .revenue-input-dark::placeholder { color: #a0a0a0; }
`}</style>
      <header className="mb-8 md:mb-12 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
        <div>
          <p className="text-xs tracking-[0.08em] communications-subtle font-light dm-sans-copy mb-2">Financial Engine</p>
          <h1 className="revenue-header-title text-4xl md:text-5xl font-medium tracking-tighter">Revenue <span className="communications-subtle">Analytics</span></h1>
        </div>
        <div className="flex gap-4 w-full sm:w-auto">
          <button
            onClick={handleReportClick}
            className="flex-1 sm:flex-none px-4 md:px-6 py-3 bg-white text-black border border-[#e6e6e6] rounded-xl text-xs tracking-[0.05em] font-light dm-sans-copy hover:bg-[#f4f4f4] transition-colors text-center"
          >
            Report
          </button>
        </div>
      </header>
      {expenseError && (
        <div className="mb-8 p-4 border bg-red-500/10 border-red-500/20 text-red-500 text-xs tracking-[0.08em] font-light dm-sans-copy">{expenseError}</div>
      )}
      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {[
          {
            label: "Total Revenue",
            value: `₹${metrics.totalRevenue.toLocaleString()}`,
            icon: <IndianRupee size={20} />,
            trend: null,
          },
          {
            label: `${expenseMonth.toLocaleString("default", { month: "short" })} Income`,
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
          <div key={i} className="bg-[#fbfbfb] border border-[#e6e6e6] p-8 rounded-2xl shadow-sm group hover:-translate-y-1 transition-all">
            <div className="flex justify-between items-start mb-6">
              <div className="w-10 h-10 bg-[#f4f4f4] rounded-xl flex items-center justify-center text-[#666666] group-hover:text-[#333333] transition-colors">{item.icon}</div>
              {item.trend !== null && (
                <div className={`flex items-center gap-1 text-[10px] font-bold font-mono ${item.trend >= 0 ? "text-[#0d0d0d]" : "text-red-400"}`}>
                  {item.trend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {item.trend > 0 ? "+" : ""}{item.trend.toFixed(1)}%
                </div>
              )}
            </div>
            <p className="text-xs tracking-[0.08em] communications-subtle font-light dm-sans-copy mb-1">{item.label}</p>
            <h3 className="text-2xl font-medium tracking-tight text-[#0d0d0d]">{item.value}</h3>
          </div>
        ))}
      </section>
      {/* Migration Reconciliation Cards */}{" "}
      {(reconciliation.paymentsImported > 0 ||
        reconciliation.importedRevenue > 0) && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {" "}
          <div className="revenue-panel border border-[#e6e6e6] bg-[#fbfbfb] p-6 rounded-lg">
            {" "}
            <p className="text-xs tracking-[0.08em] font-light dm-sans-copy revenue-panel-muted mb-2">
              Payments Imported
            </p>{" "}
            <p className="text-3xl text-[#0d0d0d] font-medium">
              {reconciliation.paymentsImported}
            </p>{" "}
            <p className="text-xs tracking-[0.08em] font-light dm-sans-copy revenue-panel-muted mt-2">
              via CSV migration
            </p>{" "}
          </div>{" "}
          <div className="revenue-panel border border-[#e6e6e6] bg-[#fbfbfb] p-6 rounded-lg">
            {" "}
            <p className="text-xs tracking-[0.08em] font-light dm-sans-copy revenue-panel-muted mb-2">
              Imported Revenue
            </p>{" "}
            <p className="text-3xl text-[#0d0d0d] font-medium">
              ₹{reconciliation.importedRevenue.toLocaleString()}
            </p>{" "}
            <p className="text-xs tracking-[0.08em] font-light dm-sans-copy revenue-panel-muted mt-2">
              completed payments
            </p>{" "}
          </div>{" "}
          <div className="revenue-panel border border-[#e6e6e6] bg-[#fbfbfb] p-6 rounded-lg">
            {" "}
            <p className="text-xs tracking-[0.08em] font-light dm-sans-copy revenue-panel-muted mb-2">
              Legacy Revenue
            </p>{" "}
            <p className="text-3xl text-[#b7791f] font-medium">
              ₹{reconciliation.legacyRevenue.toLocaleString()}
            </p>{" "}
            <p className="text-xs tracking-[0.08em] font-light dm-sans-copy revenue-panel-muted mt-2">
              pre-import historical
            </p>{" "}
          </div>{" "}
        </section>
      )}{" "}
      <div className="pb-10">
        {" "}
        {/* Main Polygraph Chart */}{" "}
        <div className="revenue-chart-bg border border-[#e6e6e6] p-6 md:p-10 rounded-2xl md:rounded-[2rem] shadow-sm">
          {" "}
          <div className="flex justify-between items-center mb-8">
            {" "}
            <div>
              {" "}
              <h3 className="revenue-header-title text-xl font-normal tracking-[0.02em]">
                Growth Polygraph
              </h3>{" "}
              <p className="text-xs tracking-[0.08em] revenue-panel-muted font-light dm-sans-copy">
                Monthly Revenue Streams
              </p>{" "}
            </div>{" "}
            <div className="flex gap-2">
              <div className="w-2.5 h-2.5 bg-[#0d0d0d] rounded-full" />
              <span className="text-xs font-light tracking-[0.08em] revenue-panel-muted dm-sans-copy">
                Income Projection
              </span>
            </div>{" "}
          </div>{" "}
          <div className="h-[350px] w-full" style={{ width: "100%", minHeight: 350 }}>
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
                      stopColor="#0d0d0d"
                      stopOpacity={0.12}
                    />{" "}
                    <stop
                      offset="95%"
                      stopColor="#0d0d0d"
                      stopOpacity={0}
                    />{" "}
                  </linearGradient>{" "}
                </defs>{" "}
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e5e7eb"
                  vertical={false}
                />{" "}
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "#666666",
                    fontSize: 10,
                    fontWeight: 500,
                  }}
                  dy={10}
                />{" "}
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "#666666",
                    fontSize: 10,
                    fontWeight: 500,
                  }}
                  tickFormatter={(value) => `₹${value / 1000}k`}
                />{" "}
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #e6e6e6",
                    borderRadius: "1rem",
                  }}
                  itemStyle={{ color: "#0d0d0d", fontSize: "12px" }}
                  cursor={{ stroke: "#0d0d0d", strokeWidth: 1 }}
                />{" "}
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#0d0d0d"
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
      <section className="revenue-chart-bg border border-[#e6e6e6] p-6 md:p-10 rounded-2xl shadow-sm mb-10">
        {" "}
        <div className="flex justify-between items-center mb-8">
          {" "}
          <div>
            {" "}
            <h3 className="revenue-header-title text-xl font-normal tracking-[0.02em] text-[#0d0d0d]">
              Operating Expenses
            </h3>{" "}
            <p className="text-xs tracking-[0.08em] revenue-panel-muted font-light dm-sans-copy">
              {" "}
              {expenseMonth.toLocaleString("default", {
                month: "long",
                year: "numeric",
              })}{" "}
              Tracker{" "}
            </p>{" "}
          </div>{" "}
          <div className="flex items-center gap-2 bg-white border border-[#e6e6e6] rounded-lg p-2">
            {" "}
            <Calendar size={16} className="text-[#666666]" />{" "}
            <select
              value={`${expenseMonth.getFullYear()}-${String(expenseMonth.getMonth()).padStart(2, "0")}`}
              onChange={(e) => {
                const [year, month] = e.target.value.split("-");
                setExpenseMonth(new Date(parseInt(year), parseInt(month), 1));
              }}
              className="bg-white border border-[#e0e0e0] px-3 py-1 text-xs font-light tracking-[0.08em] dm-sans-copy text-[#0d0d0d] focus:outline-none focus:border-black/20 cursor-pointer hover:bg-[#f4f4f4] transition-colors rounded"
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
                    className="bg-white text-[#0d0d0d]"
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
                className="flex items-center gap-4 bg-white p-4 rounded-xl border border-[#e6e6e6]"
              >
                {" "}
                <div
                  className="w-1/3 text-xs font-light tracking-[0.08em] text-[#0d0d0d]"
                  style={{ fontFamily: "Inter, sans-serif", fontWeight: 500 }}
                >
                  {cat.name}
                </div>{" "}
                <div className="relative flex-1">
                  {" "}
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#666666] font-mono">
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
                    className="revenue-input-dark w-full rounded-lg pl-8 pr-4 py-2 focus:outline-none focus:border-red-400/50 transition-colors text-[#0d0d0d] font-mono"
                  />{" "}
                </div>{" "}
                <button
                  type="button"
                  onClick={() => requestRemoveCategory(cat)}
                  disabled={removingCategoryId === cat.id}
                  aria-label={`Delete ${cat.name} field`}
                  className="native-inline-btn p-1.5 rounded-md border border-[#e6e6e6] text-[#666666] hover:text-red-500 hover:border-red-300/30 transition-colors disabled:opacity-50"
                >
                  <X size={14} />
                </button>
              </div>
            ))}{" "}
            <div className="pt-4 flex justify-end">
              {" "}
              <button
                onClick={handleSaveExpenses}
                disabled={savingExpenses}
                className="bg-white text-black font-light tracking-[0.05em] dm-sans-copy px-8 py-3 rounded-xl text-xs hover:bg-[#f4f4f4] border border-[#e6e6e6] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {" "}
                {savingExpenses ? "Saving..." : "Save Ledger"}{" "}
              </button>{" "}
            </div>{" "}
            <form
              onSubmit={handleAddCategory}
              className="bg-white border border-[#e6e6e6] p-2 rounded-xl w-fit"
            >
              {" "}
              <p className="text-xs font-light tracking-[0.08em] dm-sans-copy revenue-panel-muted mb-3">
                Add Custom Category
              </p>{" "}
              <div className="flex gap-2">
                {" "}
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Marketing"
                  className="flex-1 bg-white border border-[#e0e0e0] rounded-lg px-3 py-2 text-xs font-light tracking-[0.08em] dm-sans-copy text-[#0d0d0d] focus:outline-none focus:border-emerald-500/50"
                />{" "}
                <button
                  type="submit"
                  className="bg-[#f4f4f4] hover:bg-[#ececec] px-3 rounded-lg text-[#0d0d0d] transition-colors"
                >
                  {" "}
                  <Plus size={14} />{" "}
                </button>{" "}
              </div>{" "}
            </form>{" "}
          </div>{" "}
          <div className="space-y-6">
            {" "}
            <div className="bg-white border border-[#e6e6e6] p-6 rounded-xl space-y-6 shadow-sm">
              {" "}
              <div className="grid grid-cols-2 gap-6">
                {" "}
                <div>
                  {" "}
                  <h4
                    className="text-xs tracking-[0.08em] revenue-panel-muted mb-1"
                    style={{ fontFamily: "Inter, sans-serif", fontWeight: 500 }}
                  >
                    Selected Month Revenue
                  </h4>{" "}
                  <p className="text-3xl font-bold text-[#0d0d0d] tracking-tight">
                    ₹
                    {(
                      revenueData[expenseMonth.getMonth()]?.revenue || 0
                    ).toLocaleString()}
                  </p>{" "}
                </div>{" "}
                <div>
                  {" "}
                  <h4
                    className="text-xs tracking-[0.08em] revenue-panel-muted mb-1"
                    style={{ fontFamily: "Inter, sans-serif", fontWeight: 500 }}
                  >
                    Total Expenses
                  </h4>{" "}
                  <p className="text-3xl font-bold text-red-500 tracking-tight">
                    ₹{expenseTotal.toLocaleString()}
                  </p>{" "}
                </div>{" "}
              </div>{" "}
              <div className="pt-6 border-t border-[#e6e6e6]">
                {" "}
                <h4
                  className="text-xs tracking-[0.08em] revenue-panel-muted mb-1"
                  style={{ fontFamily: "Inter, sans-serif", fontWeight: 500 }}
                >
                  Net Profit (
                  {expenseMonth.toLocaleString("default", {
                    month: "short",
                  })}
                  )
                </h4>{" "}
                <p className="text-2xl font-bold text-[#0d0d0d] tracking-tight">
                  {" "}
                  ₹
                  {(
                    (revenueData[expenseMonth.getMonth()]?.revenue || 0) -
                    expenseTotal
                  ).toLocaleString()}{" "}
                </p>{" "}
              </div>{" "}
              <div className="pt-6 border-t border-[#e6e6e6]">
                {" "}
                <h4
                  className="text-xs tracking-[0.08em] revenue-panel-muted mb-3"
                  style={{ fontFamily: "Inter, sans-serif", fontWeight: 500 }}
                >
                  Annual Overview ({expenseMonth.getFullYear()})
                </h4>{" "}
                <div className="flex justify-between items-center mb-2">
                  {" "}
                  <span
                    className="text-xs revenue-panel-muted tracking-[0.08em]"
                    style={{ fontFamily: "Inter, sans-serif", fontWeight: 500 }}
                  >
                    YTD Expenses
                  </span>{" "}
                  <span className="text-sm font-bold text-red-500">
                    ₹{annualExpenseTotal.toLocaleString()}
                  </span>{" "}
                </div>{" "}
                <div className="flex justify-between items-center">
                  {" "}
                  <span
                    className="text-xs revenue-panel-muted tracking-[0.08em]"
                    style={{ fontFamily: "Inter, sans-serif", fontWeight: 500 }}
                  >
                    YTD Net Profit
                  </span>{" "}
                  <span className="text-sm font-bold text-[#0d0d0d]">
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

      <ConfirmExpenseCategoryRemovalModal
        isOpen={Boolean(categoryToRemove)}
        categoryName={categoryToRemove?.name || "this field"}
        onConfirm={handleRemoveCategory}
        onCancel={() => {
          if (removingCategoryId) return;
          setCategoryToRemove(null);
        }}
        isRemoving={Boolean(removingCategoryId)}
      />

      <section
        ref={summariesSectionRef}
        className="revenue-chart-bg border border-[#e6e6e6] p-6 md:p-10 rounded-2xl shadow-sm mb-10"
      >
        {" "}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 mb-8">
          <div>
            <h3 className="revenue-header-title text-xl font-normal tracking-[0.02em] text-[#0d0d0d]">
              Monthly Revenue Summaries
            </h3>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex items-center gap-2 bg-white border border-[#e6e6e6] rounded-lg px-3 py-2">
              <Calendar size={14} className="text-[#666666]" />
              <select
                value={`${selectedSummaryMonth.getFullYear()}-${String(selectedSummaryMonth.getMonth() + 1).padStart(2, "0")}`}
                onChange={(e) => {
                  const [year, month] = e.target.value.split("-");
                  setSelectedSummaryMonth(new Date(Number(year), Number(month) - 1, 1));
                }}
                className="bg-transparent text-[#0d0d0d] text-xs tracking-[0.08em] font-light dm-sans-copy focus:outline-none app-scrollbar"
              >
                {summaryMonthOptions.map((option) => (
                  <option key={option.value} value={option.value} className="bg-white text-[#0d0d0d]">
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => generateMonthlySummary(selectedSummaryMonth)}
              disabled={generatingForMonth}
              className="px-6 py-3 bg-white text-black rounded-xl text-xs tracking-[0.05em] font-light dm-sans-copy hover:bg-[#f4f4f4] border border-[#e6e6e6] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <RotateCw size={14} className={generatingForMonth ? "animate-spin" : ""} />
              {generatingForMonth ? "Generating..." : "Generate"}
            </button>
          </div>
        </div>

        {summaryError && (
          <div className="mb-6 p-4 border bg-red-500/10 border-red-500/20 text-red-500 text-xs tracking-[0.08em] font-light dm-sans-copy">
            {summaryError}
          </div>
        )}

        {loadingSummaries ? (
          <MonthlySummaryCard isLoading />
        ) : monthlySummaries.length === 0 ? (
          <div className="bg-white border border-[#e6e6e6] rounded-xl p-6 text-center text-[#666666] text-xs tracking-[0.08em]">
            No monthly summaries yet. Choose a month and click Generate.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {monthlySummaries.map((summary) => (
              <MonthlySummaryCard
                key={summary.id || summary.month_year}
                summary={summary}
                onRemove={requestRemoveMonthlySummary}
                isRemoving={removingSummaryKey === String(summary.id || summary.month_year)}
              />
            ))}
          </div>
        )}

        <ConfirmSummaryRemovalModal
          isOpen={Boolean(summaryToRemove)}
          monthLabel={
            summaryToRemove?.month_year
              ? new Date(summaryToRemove.month_year).toLocaleString("default", {
                  month: "long",
                  year: "numeric",
                })
              : "selected"
          }
          onConfirm={removeMonthlySummary}
          onCancel={() => {
            if (removingSummaryKey) return;
            setSummaryToRemove(null);
          }}
          isRemoving={Boolean(removingSummaryKey)}
        />
      </section>{" "}
      {/* Comparison Bar Diagram */}{" "}
      <section className="revenue-chart-bg border border-[#e6e6e6] p-6 md:p-10 rounded-2xl shadow-sm mb-10">
        {" "}
        <div className="flex justify-between items-center mb-10">
          {" "}
          <div>
            {" "}
            <h3
              className="revenue-header-title text-xl font-normal tracking-[0.02em] text-[#0d0d0d]"
            >
              Income Distribution
            </h3>{" "}
            <p className="text-xs tracking-[0.08em] revenue-panel-muted font-light dm-sans-copy">
              Comparison by Membership Level
            </p>{" "}
          </div>{" "}
        </div>{" "}
        <div className="h-[200px] w-full" style={{ width: "100%", minHeight: 200 }}>
          {" "}
          <ResponsiveContainer width="100%" height="100%">
            {" "}
              <BarChart data={durationStats}>
              {" "}
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e5e7eb"
                vertical={false}
              />{" "}
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#666666", fontSize: 10 }}
              />{" "}
              <YAxis hide />{" "}
              <Tooltip
                cursor={{ fill: "rgba(17,24,39,0.03)" }}
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e6e6e6",
                  borderRadius: "1rem",
                }}
              />{" "}
              <Bar
                dataKey="value"
                fill="#0d0d0d"
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

