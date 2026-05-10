import React, { useEffect, useState } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { fetchAdminUsers } from "../lib/backendApi";

const loadAccountUsers = async () => {
  const response = await fetchAdminUsers();

  return Array.isArray(response?.users)
    ? response.users.map((row) => ({
        id: row.id || `${row.loginEmail || row.login_email || "unknown"}-${row.gymName || row.gym_name || "gym"}`,
        loginEmail: row.loginEmail || row.login_email || "-",
        gymName: row.gymName || row.gym_name || "MY GYM",
        accessAllowed:
          row.accessAllowed !== undefined
            ? row.accessAllowed === true
            : row.access_allowed === true,
      }))
    : [];
};

const AdminAccessPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [users, setUsers] = useState([]);
  const [updatingUserId, setUpdatingUserId] = useState("");

  const refreshUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const nextUsers = await loadAccountUsers();
      setUsers(nextUsers);
    } catch (loadError) {
      console.error("Failed to load account access list:", loadError);
      setError(loadError?.message || "Failed to load account access list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUsers();

    const handleGymRefresh = () => {
      refreshUsers();
    };

    window.addEventListener("gym:updated", handleGymRefresh);

    const channel = supabase
      ?.channel("admin-access-refresh")
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
      window.removeEventListener("gym:updated", handleGymRefresh);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const handleToggleAccess = async (userId, nextAllowed) => {
    setUpdatingUserId(userId);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("set_user_access", {
        p_user_id: userId,
        p_is_allowed: nextAllowed,
      });

      if (rpcError) {
        throw rpcError;
      }

      if (data !== nextAllowed) {
        throw new Error("Failed to update user access status.");
      }

      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user.id === userId ? { ...user, accessAllowed: nextAllowed } : user,
        ),
      );
    } catch (updateError) {
      console.error("Failed to update user access:", updateError);
      setError(updateError?.message || "Failed to update user access.");
    } finally {
      setUpdatingUserId("");
    }
  };

  const activeUsersCount = users.filter((user) => user.accessAllowed).length;

  return (
    <div className="app-page min-h-[100dvh] overflow-y-auto custom-scrollbar">
      <header className="px-4 md:px-10 py-4 md:py-8 flex items-center justify-between sticky top-0 bg-[#0B0E14]/80 backdrop-blur-md z-20 border-b border-white/5 lg:top-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/admin")}
            className="native-inline-btn text-white/70 hover:text-white"
            aria-label="Back to Admin"
          >
            <ArrowLeft size={17} />
          </button>
          <h1 className="dm-sans-light-008 text-[12px] text-white/90">Access</h1>
        </div>
      </header>

      <div className="p-4 md:p-10 space-y-6 md:space-y-8">
        <div className="w-full md:max-w-[320px] rounded-2xl border border-white/10 bg-[#151921] p-4 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="dm-sans-light-008 text-[10px] text-white/55 uppercase tracking-[0.16em]">
                Active Users
              </p>
              <p className="text-2xl md:text-3xl font-semibold tracking-tight text-white">
                {activeUsersCount}
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center text-white/80">
              <Users size={18} />
            </div>
          </div>
        </div>

        <section className="rounded-2xl border border-white/10 bg-[#151921] overflow-hidden">
          <div className="hidden md:grid md:grid-cols-3 border-b border-white/10 bg-white/[0.02]">
            <div className="px-4 py-3 dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55">
              Account Email
            </div>
            <div className="px-4 py-3 dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55">
              Gym Name
            </div>
            <div className="px-4 py-3 dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55 text-right">
              Access
            </div>
          </div>

          {loading ? (
            <div className="px-4 py-4 text-[11px] text-white/55">Loading account access list...</div>
          ) : error ? (
            <div className="px-4 py-4 text-[11px] text-red-200/90 bg-red-500/[0.04] border-t border-red-300/20">
              {error}
            </div>
          ) : users.length === 0 ? (
            <div className="px-4 py-4 text-[11px] text-white/55">No active user accounts found.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {users.map((row) => (
                <div key={row.id || `${row.loginEmail}-${row.gymName}`} className="grid grid-cols-1 md:grid-cols-3">
                  <div className="px-4 py-3 text-[11px] text-white/85 break-all">{row.loginEmail}</div>
                  <div className="px-4 py-3 text-[11px] text-white/70">{row.gymName}</div>
                  <div className="px-4 py-3 flex items-center justify-start md:justify-end">
                    <button
                      type="button"
                      disabled={updatingUserId === row.id}
                      onClick={() => handleToggleAccess(row.id, !row.accessAllowed)}
                      className={`px-3 py-1.5 rounded-lg border text-[10px] uppercase tracking-[0.12em] transition-colors ${
                        row.accessAllowed
                          ? "border-emerald-300/20 bg-emerald-500/[0.08] text-emerald-200/90 hover:bg-emerald-500/[0.14]"
                          : "border-red-300/20 bg-red-500/[0.08] text-red-200/90 hover:bg-red-500/[0.14]"
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      {updatingUserId === row.id
                        ? "Updating..."
                        : row.accessAllowed
                          ? "Allowed"
                          : "Denied"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default AdminAccessPage;
