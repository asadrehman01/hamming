import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { getUserWithRetry } from "../lib/authUser";
import StatCard from "../components/StatCard";
import MembershipChart from "../components/MembershipChart";
import AttendanceDashboardCard from "../components/AttendanceDashboardCard";
import { ACCESS_MODE, getAccessMode } from "../lib/accessControl";
import { AlertTriangle, X } from "lucide-react";

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
  const isReceptionMode = getAccessMode() === ACCESS_MODE.RECEPTION;

  const [stats, setStats] = useState({
    activeMembers: 0,
    totalMembers: 0,
    earnings: 0,
    activeTrainers: null,
  });
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);
  const [expiredAlerts, setExpiredAlerts] = useState([]);

  const handleSearchKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      // TODO: wire dashboard search to a filter or dedicated search route.
    }
  };

  const displayStats = useMemo(
    () => ({
      ...stats,
      earningsLabel: `Rs ${asNumber(stats.earnings).toLocaleString()}`,
    }),
    [stats],
  );

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      setLoading(true);
      setFetchError(null);

      try {
        const [{ data: authData, error: authError }] = await Promise.all([
          getUserWithRetry(supabase),
        ]);

        if (authError) throw authError;
        const userId = authData?.user?.id;
        if (!userId) throw new Error("User not authenticated");
        if (active) setCurrentUserId(userId);

        const [
          activeRes,
          totalRes,
          paymentsRes,
          subscriptionsRes,
          trainersRes,
          customersCreatedRes,
        ] = await Promise.all([
          supabase
            .from("active_customers")
            .select("*", { count: "exact", head: true }),
          supabase
            .from("customers")
            .select("*", { count: "exact", head: true }),
          supabase
            .from("payments")
            .select("amount, status, subscription_id")
            .eq("gym_id", userId),
          supabase
            .from("subscriptions")
            .select("id, amount, status")
            .eq("gym_id", userId),
          supabase
            .from("trainers")
            .select("id", { count: "exact", head: true })
            .eq("gym_id", userId),
          supabase.from("customers").select("created_at").eq("gym_id", userId),
        ]);

        if (activeRes.error) throw activeRes.error;
        if (totalRes.error) throw totalRes.error;
        if (paymentsRes.error) throw paymentsRes.error;
        if (subscriptionsRes.error) throw subscriptionsRes.error;
        if (customersCreatedRes.error) throw customersCreatedRes.error;

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
        const completedPayments = paymentRows.filter(
          (payment) =>
            String(payment?.status || "").trim().toLowerCase() ===
            "completed",
        );
        const completedPaymentSubscriptionIds = new Set(
          completedPayments
            .map((payment) => payment?.subscription_id)
            .filter(Boolean),
        );
        const subscriptionRows = Array.isArray(subscriptionsRes.data)
          ? subscriptionsRes.data
          : [];
        const fallbackSubscriptionRevenue = subscriptionRows
          .filter((subscription) => {
            const normalizedStatus = String(
              subscription?.status || "",
            ).trim().toLowerCase();
            return (
              (normalizedStatus === "active" ||
                normalizedStatus === "completed") &&
              !completedPaymentSubscriptionIds.has(subscription?.id)
            );
          })
          .map((subscription) => ({ amount: subscription?.amount }));

        const revenueTotal = [...completedPayments, ...fallbackSubscriptionRevenue].reduce(
          (sum, row) => sum + asNumber(row?.amount),
          0,
        );

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

        if (!active) return;

        setStats({
          activeMembers: asNumber(activeRes.count),
          totalMembers: asNumber(totalRes.count),
          earnings: revenueTotal,
          activeTrainers,
        });
        setChartData(counts);
      } catch (error) {
        console.error("Dashboard load failed:", error);
        if (!active) return;
        const message = String(error?.message || "").toLowerCase();
        if (message.includes("lock broken") || message.includes("steal option")) {
          setFetchError(
            "Temporary connection issue while loading dashboard. Please wait a moment or refresh.",
          );
        } else {
          setFetchError(error?.message || "Failed to load dashboard data");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel("dashboard_expired_alerts")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "attendance_logs",
          filter: `user_id=eq.${currentUserId}`,
        },
        async (payload) => {
          if (payload.new.status === "expired_member" && payload.new.customer_id) {
            const { data: cust } = await supabase
              .from("customers")
              .select("first_name, last_name, membership_end_date")
              .eq("id", payload.new.customer_id)
              .single();
            if (cust) {
              setExpiredAlerts((prev) => [
                ...prev,
                {
                  id: payload.new.id,
                  name: `${cust.first_name} ${cust.last_name}`,
                  date: cust.membership_end_date,
                },
              ]);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const dismissAlert = (id) => {
    setExpiredAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div
      className="app-page dashboard-page-vibe"
      style={{
        "--app-theme-page-bg": "#ffffff",
        "--app-theme-card-bg": "#fbfbfb",
        "--app-theme-card-bg-alt": "#f4f4f4",
        color: "#0d0d0d",
      }}
    >
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=DM+Sans:wght@400;500;600&display=swap");
        .dashboard-page-vibe {
          background: #ffffff !important;
          color: #0d0d0d !important;
          font-family: "DM Sans", system-ui, sans-serif;
          min-height: 100vh;
        }
        .dashboard-page-vibe .dashboard-header-title {
          font-family: "Playfair Display", Georgia, serif;
        }
        .dashboard-page-vibe .dashboard-card {
          background: #fafafa;
          border-color: rgba(0, 0, 0, 0.12);
        }
        .dashboard-page-vibe .dashboard-card:hover {
          background: #fafafa;
          border-color: rgba(0, 0, 0, 0.12);
        }
        .dashboard-page-vibe .dashboard-quick-actions-card:hover {
          background: #fafafa !important;
          border-color: rgba(0, 0, 0, 0.12) !important;
        }
        .dashboard-page-vibe .dashboard-chip {
          background: #ffffff;
          border-color: #e0e0e0;
          color: #0d0d0d;
        }
        .dashboard-page-vibe .dashboard-subtle {
          color: #8a8a8a;
        }
        .dashboard-page-vibe .dashboard-muted {
          color: #666666;
        }
        .dashboard-page-vibe div[class*="bg-\\[#151920\\]"] {
          background: #fafafa !important;
          border-color: rgba(0, 0, 0, 0.12) !important;
        }
        .dashboard-page-vibe div[class*="bg-\\[#151920\\]"]:hover {
          background: #fafafa !important;
          border-color: rgba(0, 0, 0, 0.12) !important;
        }
        .dashboard-page-vibe div[class*="bg-\\[#151920\\]"] p {
          color: #0d0d0d !important;
        }
        .dashboard-page-vibe div[class*="bg-\\[#151920\\]"] p[class*="text-white/65"] {
          color: #8a8a8a !important;
        }
        .dashboard-page-vibe .dashboard-stat-card-title {
          color: #6b6b6b !important;
        }
        .dashboard-page-vibe div[class*="bg-\\[#151920\\]"] div[class*="bg-white"] {
          background: #f0f0f0 !important;
          border-color: #e0e0e0 !important;
        }
        .dashboard-page-vibe button.dashboard-quick-action-btn {
          background: #ffffff !important;
          border: 1px solid #e0e0e0 !important;
          color: #0d0d0d !important;
          transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease;
        }
        .dashboard-page-vibe button.dashboard-quick-action-btn:hover:not(:disabled),
        .dashboard-page-vibe button.dashboard-quick-action-btn:active:not(:disabled) {
          background: #f4f4f4 !important;
          border-color: #d0d0d0 !important;
          color: #0d0d0d !important;
        }
      `}</style>

      <header className="px-4 md:px-10 py-4 md:py-8 flex justify-between items-center sticky top-0 bg-white/95 backdrop-blur-md z-20 border-b border-black/10 lg:top-0">
        <div className="hidden sm:block relative group flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search anything..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full bg-white border border-black/10 rounded-2xl py-3 px-4 text-xs tracking-wider focus:outline-none focus:border-black/20 transition-all placeholder:text-black/40 text-[#0d0d0d]"
          />
        </div>
      </header>

      {loading ? (
        <div className="p-10 flex justify-center items-center h-[50vh]">
          <span
            className="text-sm tracking-[0.04em] dashboard-muted animate-pulse font-light"
          >
            Synchronizing Dashboard...
          </span>
        </div>
      ) : fetchError ? (
        <div className="p-10 flex justify-center items-center h-[50vh]">
          <span
            className="text-sm tracking-[0.04em] text-red-600 font-light"
          >
            {fetchError}
          </span>
        </div>
      ) : (
        <div className="p-4 md:p-10 space-y-6 md:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          {/* Expired Member Alerts */}
          {expiredAlerts.length > 0 && (
            <div className="space-y-3">
              {expiredAlerts.map((alert) => (
                <div key={alert.id} className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start justify-between shadow-sm animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="text-rose-500 mt-0.5 flex-shrink-0" size={20} />
                    <div>
                      <p className="font-semibold text-sm">Expired Member Scan Detected</p>
                      <p className="text-sm mt-0.5">
                        ⚠️ <strong>{alert.name}</strong> checked in but their subscription expired on <strong>{alert.date ? new Date(alert.date).toLocaleDateString() : "an unknown date"}</strong>. Consider following up.
                      </p>
                    </div>
                  </div>
                  <button onClick={() => dismissAlert(alert.id)} className="text-rose-400 hover:text-rose-600 transition-colors flex-shrink-0 p-1">
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}

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

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-10">
            <div className="order-2 lg:order-2 lg:col-span-2">
              <MembershipChart data={chartData} />
            </div>
            <div className="dashboard-card dashboard-quick-actions-card order-1 lg:order-1 border p-8 rounded-2xl flex flex-col shadow-lg shadow-black/5">
              <h3 className="dashboard-header-title text-lg font-medium text-[#0d0d0d] tracking-tight mb-8">
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

          {/* New Attendance Dashboard Card */}
          <section className="pb-10">
            <AttendanceDashboardCard userId={currentUserId} />
          </section>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
