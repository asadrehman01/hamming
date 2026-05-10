import React, { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { fetchAdminUsers } from "../lib/backendApi";

const loadAccountUsers = async () => {
  const response = await fetchAdminUsers();
  const users = Array.isArray(response?.users)
    ? response.users.map((row) => ({
        id: row.id,
        loginEmail: row.loginEmail || row.login_email || "-",
        gymName: row.gymName || row.gym_name || "MY GYM",
        createdAt: row.createdAt || row.created_at,
      }))
    : [];

  return {
    totalUsers: Number(response?.totalUsers || users.length || 0),
    users,
  };
};

const AdminPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCurrentMonthRevenue, setShowCurrentMonthRevenue] = useState(false);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalTrackedRevenue, setTotalTrackedRevenue] = useState(0);
  const [currentMonthRevenue, setCurrentMonthRevenue] = useState(0);

  const refreshRevenueStats = async () => {
    setRevenueLoading(true);
    try {
      const { data, error: revenueError } = await supabase.rpc(
        "list_admin_client_revenue_entries",
      );

      if (revenueError) {
        throw revenueError;
      }

      const rows = Array.isArray(data) ? data : [];
      const total = rows.reduce((sum, row) => sum + Number(row?.amount || 0), 0);

      const now = new Date();
      const month = now.getMonth();
      const year = now.getFullYear();
      const monthTotal = rows.reduce((sum, row) => {
        const createdAt = new Date(row?.created_at);
        if (Number.isNaN(createdAt.getTime())) return sum;
        if (createdAt.getMonth() !== month || createdAt.getFullYear() !== year) {
          return sum;
        }
        return sum + Number(row?.amount || 0);
      }, 0);

      setTotalTrackedRevenue(total);
      setCurrentMonthRevenue(monthTotal);
    } catch (loadRevenueError) {
      console.error("Failed to load revenue stats:", loadRevenueError);
    } finally {
      setRevenueLoading(false);
    }
  };

  const refreshUsers = async ({ initial = false } = {}) => {
    if (initial) {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await loadAccountUsers();
      setTotalUsers(Number(response?.totalUsers || 0));
    } catch (loadError) {
      console.error("Failed to load admin users:", loadError);
      setError(loadError?.message || "Failed to load admin data.");
    } finally {
      if (initial) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let active = true;

    const loadAdminData = async () => {
      await Promise.all([refreshUsers({ initial: true }), refreshRevenueStats()]);
    };

    loadAdminData();

    const handleGymRefresh = () => {
      if (!active) return;
      refreshUsers();
    };

    window.addEventListener("gym:updated", handleGymRefresh);

    const channel = supabase
      ?.channel("admin-users-refresh")
      ?.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gyms" },
        handleGymRefresh,
      )
      ?.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "billing_settings" },
        handleGymRefresh,
      );

    if (channel) {
      channel.subscribe();
    }

    return () => {
      active = false;
      window.removeEventListener("gym:updated", handleGymRefresh);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  return (
    <div
      className="app-page admin-page-vibe"
      style={{
        "--app-theme-page-bg": "#ffffff",
        "--app-theme-card-bg": "#fbfbfb",
        "--app-theme-card-bg-alt": "#f4f4f4",
        color: "#0d0d0d",
      }}
    >
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=DM+Sans:wght@400;500;600&display=swap");
        .admin-page-vibe {
          background: #ffffff !important;
          color: #0d0d0d !important;
          font-family: "DM Sans", system-ui, sans-serif;
          min-height: 100vh;
        }
        .admin-page-vibe.app-page {
          background: #ffffff;
        }
        .admin-page-vibe .admin-header-title {
          font-family: "Playfair Display", Georgia, serif;
        }
        .admin-page-vibe .admin-card {
          background: #fbfbfb;
          border-color: #e6e6e6;
        }
        .admin-page-vibe .admin-card:hover {
          background: #f4f4f4;
        }
        .admin-page-vibe .admin-chip {
          background: #ffffff;
          border-color: #e0e0e0;
          color: #0d0d0d;
        }
        .admin-page-vibe .admin-subtle {
          color: #8a8a8a;
        }
        .admin-page-vibe .admin-muted {
          color: #666666;
        }
      `}</style>

      <header className="px-4 md:px-10 py-4 md:py-8 flex justify-between items-center sticky top-0 bg-white/95 backdrop-blur-md z-20 border-b border-black/10 lg:top-0">
        <h1 className="admin-header-title text-[18px] tracking-[0.02em] text-[#0d0d0d]">Admin</h1>
      </header>

      <div className="p-4 md:p-10 space-y-6 md:space-y-8">
        {loading ? (
          <div className="h-[40vh] flex items-center justify-center">
            <span
              className="text-sm tracking-[0.04em] admin-muted animate-pulse font-light"
            >
              Loading admin dashboard...
            </span>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dm-sans-light-008 text-[11px] text-red-700">
            {error}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full sm:max-w-[580px]">
              <div className="admin-card w-full rounded-2xl border p-4 md:p-5 text-left">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="dm-sans-light-008 text-[10px] admin-subtle uppercase tracking-[0.16em]">
                      Active Users
                    </p>
                    <p className="text-2xl md:text-3xl font-semibold tracking-tight text-[#0d0d0d]">
                      {totalUsers}
                    </p>
                  </div>
                  <div className="admin-chip h-10 w-10 rounded-xl border flex items-center justify-center">
                    <Users size={18} />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate("/access")}
                className="admin-card w-full rounded-2xl border p-4 md:p-5 text-left transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="dm-sans-light-008 text-[10px] admin-subtle uppercase tracking-[0.16em]">
                      Access
                    </p>
                    <p className="admin-header-title text-2xl md:text-3xl font-semibold tracking-tight text-[#0d0d0d]">
                      Manage
                    </p>
                  </div>
                  <div className="admin-chip h-10 w-10 rounded-xl border flex items-center justify-center text-[16px]">
                    +
                  </div>
                </div>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-start">
              <button
                type="button"
                onClick={() => navigate("/admin/client-revenue")}
                className="admin-card w-full self-start text-left rounded-2xl border p-5 md:p-6 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-2">
                    <p className="dm-sans-light-008 text-[10px] admin-subtle uppercase tracking-[0.16em]">
                      Add Revenue
                    </p>
                    <p className="admin-header-title text-lg md:text-xl font-semibold tracking-tight text-[#0d0d0d]">
                      Credentials & Revenue
                    </p>
                  </div>
                  <div className="admin-chip h-11 w-11 rounded-xl border flex items-center justify-center text-[18px]">
                    +
                  </div>
                </div>
                <p className="dm-sans-light-008 text-[10px] admin-muted mt-4 uppercase tracking-[0.12em]">
                  Tap to open
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowCurrentMonthRevenue((prev) => !prev);
                  if (!showCurrentMonthRevenue) {
                    refreshRevenueStats();
                  }
                }}
                className="admin-card w-full self-start text-left rounded-2xl border p-5 md:p-6 transition-colors"
              >
                <p className="dm-sans-light-008 text-[10px] admin-subtle uppercase tracking-[0.16em]">
                  Revenue Calculated
                </p>
                <p className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-[#0d0d0d]">
                  {`Rs ${Number(totalTrackedRevenue || 0).toLocaleString("en-IN", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}`}
                </p>
                <p className="dm-sans-light-008 text-[10px] admin-muted mt-4 uppercase tracking-[0.12em]">
                  {showCurrentMonthRevenue
                    ? "Tap to collapse"
                    : revenueLoading
                      ? "Refreshing revenue..."
                      : "Tap to view current month revenue"}
                </p>

                {showCurrentMonthRevenue && (
                  <div className="mt-4 rounded-xl border border-black/10 bg-white px-4 py-3">
                    <p className="dm-sans-light-008 text-[10px] admin-subtle uppercase tracking-[0.12em]">
                      Current Month Revenue
                    </p>
                    <p className="mt-2 text-xl font-semibold text-[#0d0d0d]">
                      {`Rs ${Number(currentMonthRevenue || 0).toLocaleString("en-IN", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}`}
                    </p>
                  </div>
                )}
              </button>
            </div>

          </>
        )}
      </div>
    </div>
  );
};

export default AdminPage;
