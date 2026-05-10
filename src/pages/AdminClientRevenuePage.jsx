import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import ConfirmRevenueLogRemovalModal from "../components/ConfirmRevenueLogRemovalModal";

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return `Rs ${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const loadRevenueEntries = async () => {
  if (!supabase) {
    throw new Error("Supabase client not initialized.");
  }

  const { data, error } = await supabase.rpc("list_admin_client_revenue_entries");
  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
};

const AdminClientRevenuePage = () => {
  const navigate = useNavigate();

  const [loadingRevenue, setLoadingRevenue] = useState(true);
  const [revenueError, setRevenueError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [entries, setEntries] = useState([]);

  const [clientName, setClientName] = useState("");
  const [amount, setAmount] = useState("");
  const [entryToDelete, setEntryToDelete] = useState(null);

  const totalTrackedRevenue = useMemo(
    () => entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
    [entries],
  );

  const refreshRevenueEntries = async () => {
    setLoadingRevenue(true);
    setRevenueError(null);
    try {
      const nextEntries = await loadRevenueEntries();
      setEntries(nextEntries);
    } catch (error) {
      console.error("Failed to load revenue entries:", error);
      setRevenueError(error?.message || "Failed to load tracked revenue.");
    } finally {
      setLoadingRevenue(false);
    }
  };

  useEffect(() => {
    refreshRevenueEntries();
  }, []);

  const handleAddRevenue = async (event) => {
    event.preventDefault();
    const trimmedClientName = clientName.trim();
    const numericAmount = Number(amount);

    if (!trimmedClientName) {
      setRevenueError("Client name is required.");
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      setRevenueError("Amount must be a non-negative number.");
      return;
    }

    setSubmitting(true);
    setRevenueError(null);

    try {
      const { error } = await supabase.rpc("add_admin_client_revenue_entry", {
        p_client_name: trimmedClientName,
        p_amount: numericAmount,
      });

      if (error) {
        throw error;
      }

      setClientName("");
      setAmount("");
      await refreshRevenueEntries();
    } catch (error) {
      console.error("Failed to add revenue entry:", error);
      setRevenueError(error?.message || "Failed to save revenue entry.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEntry = async () => {
    if (!entryToDelete?.id) return;

    setIsDeleting(true);
    setRevenueError(null);

    try {
      const { data, error } = await supabase.rpc("delete_admin_client_revenue_entry", {
        p_entry_id: entryToDelete.id,
      });

      if (error) {
        throw error;
      }

      if (data === false) {
        setEntryToDelete(null);
        throw new Error("Revenue log not found.");
      }

      setEntryToDelete(null);
      await refreshRevenueEntries();
    } catch (error) {
      console.error("Failed to delete revenue entry:", error);
      setRevenueError(error?.message || "Failed to delete revenue entry.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="app-page h-[100dvh] overflow-y-auto overflow-x-hidden custom-scrollbar"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <header className="px-4 md:px-10 py-4 md:py-8 flex justify-between items-center sticky top-0 bg-[#0B0E14]/80 backdrop-blur-md z-20 border-b border-white/5 lg:top-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/admin")}
            className="native-inline-btn text-white/70 hover:text-white"
            aria-label="Back to Admin"
          >
            <ArrowLeft size={17} />
          </button>
          <h1 className="dm-sans-light-008 text-[12px] text-white/90">Client Credentials & Revenue Tracker</h1>
        </div>
      </header>

      <div className="p-4 md:p-10 space-y-6 md:space-y-8">
        <section className="rounded-2xl border border-white/10 bg-[#151921] p-5 md:p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="dm-sans-light-008 text-[12px] text-white/90 uppercase tracking-[0.14em]">
              Manual Revenue Tracker
            </h2>
            <p className="text-[11px] text-white/60 dm-sans-light-008">
              Total Tracked: <span className="text-white/90">{formatCurrency(totalTrackedRevenue)}</span>
            </p>
          </div>

          <form onSubmit={handleAddRevenue} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="space-y-1.5 md:col-span-1">
              <label className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55">
                Client Name
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                placeholder="Enter client name"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-white/25"
                required
              />
            </div>

            <div className="space-y-1.5 md:col-span-1">
              <label className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55">
                Amount Earned
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-white/25"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl border border-white/15 bg-white/[0.05] hover:bg-white/[0.09] px-4 py-2.5 text-[11px] text-white/90 transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={14} />
              {submitting ? "Saving..." : "Add Revenue"}
            </button>
          </form>

          {revenueError && (
            <div className="rounded-xl border border-red-300/20 bg-red-500/[0.04] p-3 text-[11px] text-red-200/90">
              {revenueError}
            </div>
          )}

          <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="hidden md:grid md:grid-cols-4 border-b border-white/10 bg-white/[0.02]">
            <div className="px-4 py-3 dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55">
              Client Name
            </div>
            <div className="px-4 py-3 dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55">
              Amount
            </div>
            <div className="px-4 py-3 dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55">
              Added On
            </div>
            <div className="px-4 py-3 dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55 text-right">
              Action
            </div>
          </div>

          {loadingRevenue ? (
            <div className="px-4 py-4 text-[11px] text-white/55">Loading revenue entries...</div>
          ) : entries.length === 0 ? (
            <div className="px-4 py-4 text-[11px] text-white/55">No entries yet. Add your first client revenue above.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {entries.map((entry) => (
                <div key={entry.id} className="grid grid-cols-1 md:grid-cols-4">
                  <div className="px-4 py-3 text-[11px] text-white/85">{entry.client_name || "-"}</div>
                  <div className="px-4 py-3 text-[11px] text-white/80">{formatCurrency(entry.amount)}</div>
                  <div className="px-4 py-3 text-[11px] text-white/65">{formatDateTime(entry.created_at)}</div>
                  <div className="px-4 py-3 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setEntryToDelete(entry)}
                      className="native-inline-btn inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-red-300/85 hover:text-red-200"
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </section>
      </div>

      <ConfirmRevenueLogRemovalModal
        isOpen={Boolean(entryToDelete)}
        clientName={entryToDelete?.client_name}
        amountLabel={entryToDelete ? formatCurrency(entryToDelete.amount) : ""}
        onCancel={() => {
          if (!isDeleting) {
            setEntryToDelete(null);
          }
        }}
        onConfirm={handleDeleteEntry}
        isRemoving={isDeleting}
      />
    </div>
  );
};

export default AdminClientRevenuePage;
