import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import StatCard from "../components/StatCard";
import MembershipChart from "../components/MembershipChart";
import { ACCESS_MODE, getAccessMode } from "../lib/accessControl";

const MONTHS = [
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

const asNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const DashboardPage = () => {
  const navigate = useNavigate();
  const profileRef = useRef(null);
  const isReceptionMode = getAccessMode() === ACCESS_MODE.RECEPTION;

  const [stats, setStats] = useState({
    activeMembers: 0,
    totalMembers: 0,
    earnings: 0,
    activeTrainers: null,
  });
  const [reconciliation, setReconciliation] = useState({
    customersImported: 0,
    paymentsImported: 0,
    totalImportedRevenue: 0,
  });
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const displayStats = useMemo(
    () => ({
      ...stats,
      earningsLabel: `Rs ${asNumber(stats.earnings).toLocaleString()}`,
    }),
    [stats],
  );

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      setLoading(true);
      setFetchError(null);

      try {
        const [{ data: authData, error: authError }] = await Promise.all([
          supabase.auth.getUser(),
        ]);

        if (authError) throw authError;
        const userId = authData?.user?.id;
        if (!userId) throw new Error("User not authenticated");

        const [
          activeRes,
          totalRes,
          paymentsRes,
          trainersRes,
          customersCreatedRes,
          customerRecRes,
          paymentsCountRecRes,
          completedRevenueRecRes,
        ] = await Promise.all([
          supabase
            .from("active_customers")
            .select("*", { count: "exact", head: true }),
          supabase
            .from("customers")
            .select("*", { count: "exact", head: true }),
          supabase
            .from("payments")
            .select("amount, status")
            .eq("gym_id", userId),
          supabase
            .from("trainers")
            .select("id", { count: "exact", head: true })
            .eq("gym_id", userId),
          supabase.from("customers").select("created_at").eq("gym_id", userId),
          supabase
            .from("import_reconciliations")
            .select("imported_value")
            .eq("gym_id", userId)
            .eq("metric_name", "customers_count")
            .order("created_at", { ascending: false })
            .limit(1),
          supabase
            .from("import_reconciliations")
            .select("imported_value")
            .eq("gym_id", userId)
            .eq("metric_name", "payments_count")
            .order("created_at", { ascending: false })
            .limit(1),
          supabase
            .from("import_reconciliations")
            .select("imported_value")
            .eq("gym_id", userId)
            .eq("metric_name", "completed_revenue")
            .order("created_at", { ascending: false })
            .limit(1),
        ]);

        if (activeRes.error) throw activeRes.error;
        if (totalRes.error) throw totalRes.error;
        if (paymentsRes.error) throw paymentsRes.error;
        if (customersCreatedRes.error) throw customersCreatedRes.error;
        if (customerRecRes.error) throw customerRecRes.error;
        if (paymentsCountRecRes.error) throw paymentsCountRecRes.error;
        if (completedRevenueRecRes.error) throw completedRevenueRecRes.error;

        let activeTrainers = null;
        if (trainersRes.error) {
          // Trainer table may not be available in all environments.
          console.warn("Trainer count unavailable:", trainersRes.error);
        } else {
          activeTrainers = asNumber(trainersRes.count);
        }

        const paymentRows = Array.isArray(paymentsRes.data)
          ? paymentsRes.data
          : [];
        const revenueTotal = paymentRows.reduce((sum, payment) => {
          if (String(payment?.status || "").toLowerCase() !== "completed")
            return sum;
          return sum + asNumber(payment?.amount);
        }, 0);

        const customerRows = Array.isArray(customersCreatedRes.data)
          ? customersCreatedRes.data
          : [];
        // TODO: Track "lost" members when a churn signal is finalized.
        const counts = MONTHS.map((month) => ({ month, new: 0 }));
        const currentYear = new Date().getFullYear();

        customerRows.forEach((row) => {
          const date = new Date(row?.created_at);
          if (!Number.isFinite(date.getTime())) return;
          const monthIndex = date.getMonth();
          if (date.getFullYear() !== currentYear) return;
          if (monthIndex < 0 || monthIndex > 11) return;
          counts[monthIndex].new += 1;
        });

        const customerImported = asNumber(
          customerRecRes.data?.[0]?.imported_value,
        );
        const paymentsImported = asNumber(
          paymentsCountRecRes.data?.[0]?.imported_value,
        );
        const importedRevenue = asNumber(
          completedRevenueRecRes.data?.[0]?.imported_value,
        );

        if (!active) return;

        setStats({
          activeMembers: asNumber(activeRes.count),
          totalMembers: asNumber(totalRes.count),
          earnings: revenueTotal,
          activeTrainers,
        });
        setChartData(counts);
        setReconciliation({
          customersImported: customerImported,
          paymentsImported,
          totalImportedRevenue: importedRevenue,
        });
      } catch (error) {
        console.error("Dashboard load failed:", error);
        if (!active) return;
        setFetchError(error?.message || "Failed to load dashboard data");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate("/login");
    } catch (err) {
      console.error("Logout error:", err);
      alert(`Logout failed: ${err.message}`);
    }
  };

  return (
    <div className="app-page">
      <header className="px-4 md:px-10 py-4 md:py-8 flex justify-between items-center sticky top-0 bg-[#0B0E14]/80 backdrop-blur-md z-20 border-b border-white/5 lg:top-0">
        <div className="hidden sm:block relative group flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search anything..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-xs tracking-wider focus:outline-none focus:border-white/20 transition-all placeholder:text-white/40"
          />
        </div>

        <div className="flex gap-3 md:gap-6 items-center ml-auto">
          <div className="relative" ref={profileRef}>
            <div
              className="flex items-center gap-2 md:gap-4 group cursor-pointer"
              onClick={() => setIsProfileOpen(!isProfileOpen)}
            >
              <div className="text-right hidden sm:block">
                <p className="text-[10px] font-medium tracking-tight text-white">
                  System Admin
                </p>
                <p className="text-[8px] tracking-widest text-white/40 font-mono">
                  Receptionist
                </p>
              </div>
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-white/5 flex items-center justify-center border border-white/10" />
            </div>

            {isProfileOpen && (
              <div className="absolute right-0 mt-4 w-48 bg-[#151921] border border-white/10 rounded-2xl py-2 shadow-2xl z-50">
                <button
                  onClick={handleLogout}
                  className="native-inline-btn w-full text-left px-4 py-3 text-xs text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {loading ? (
        <div className="p-10 flex justify-center items-center h-[50vh]">
          <span
            className="text-sm tracking-[0.04em] text-white/40 animate-pulse font-light"
            style={{ fontFamily: "DM Sans, sans-serif" }}
          >
            Synchronizing Dashboard...
          </span>
        </div>
      ) : fetchError ? (
        <div className="p-10 flex justify-center items-center h-[50vh]">
          <span
            className="text-sm tracking-[0.04em] text-red-500/60 font-light"
            style={{ fontFamily: "DM Sans, sans-serif" }}
          >
            {fetchError}
          </span>
        </div>
      ) : (
        <div className="p-4 md:p-10 space-y-6 md:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              title="Active Members"
              value={displayStats.activeMembers}
            />
            {!isReceptionMode && (
              <StatCard title="Earnings" value={displayStats.earningsLabel} />
            )}
            <StatCard
              title={
                displayStats.activeTrainers == null
                  ? "Active Trainers (N/A)"
                  : "Active Trainers"
              }
              value={
                displayStats.activeTrainers == null
                  ? "--"
                  : displayStats.activeTrainers
              }
              onClick={() => navigate("/trainers")}
            />
            <StatCard
              title="Total Membership"
              value={displayStats.totalMembers}
            />
          </section>

          {(reconciliation.customersImported > 0 ||
            reconciliation.paymentsImported > 0 ||
            reconciliation.totalImportedRevenue > 0) && (
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="border border-white/10 bg-white/[0.02] p-6 rounded-lg">
                <p className="text-[10px] tracking-[0.2em] font-mono text-white/40 mb-2">
                  Customers Imported
                </p>
                <p className="text-3xl text-white font-medium">
                  {reconciliation.customersImported}
                </p>
              </div>
              <div className="border border-white/10 bg-white/[0.02] p-6 rounded-lg">
                <p className="text-[10px] tracking-[0.2em] font-mono text-white/40 mb-2">
                  Payments Imported
                </p>
                <p className="text-3xl text-emerald-400 font-medium">
                  {reconciliation.paymentsImported}
                </p>
              </div>
              <div className="border border-white/10 bg-white/[0.02] p-6 rounded-lg">
                <p className="text-[10px] tracking-[0.2em] font-mono text-white/40 mb-2">
                  Imported Revenue
                </p>
                <p className="text-3xl text-emerald-500 font-medium">
                  Rs{" "}
                  {asNumber(
                    reconciliation.totalImportedRevenue,
                  ).toLocaleString()}
                </p>
              </div>
            </section>
          )}

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-10">
            <div className="order-2 lg:order-2 lg:col-span-2">
              <MembershipChart data={chartData} />
            </div>
            <div className="order-1 lg:order-1 bg-[#151921] border border-white/5 p-8 rounded-2xl flex flex-col shadow-2xl shadow-black/40">
              <h3 className="text-lg font-medium text-white tracking-tight mb-8">
                Quick Actions
              </h3>
              <div className="space-y-4">
                <button
                  onClick={() => navigate("/customers")}
                  className="native-inline-btn dashboard-quick-action-btn"
                >
                  Manage Members
                </button>
                <button
                  onClick={() => navigate("/trainers")}
                  className="native-inline-btn dashboard-quick-action-btn"
                >
                  Manage Trainers
                </button>
                <button
                  onClick={() => navigate("/transactions")}
                  className="native-inline-btn dashboard-quick-action-btn"
                >
                  View Transaction
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
