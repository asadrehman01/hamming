import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Calendar, History, IndianRupee, Activity } from "lucide-react";
import MemberAttendanceModal from "./MemberAttendanceModal";

const addDurationToDate = (startDate, planName) => {
  const endDate = new Date(startDate);
  const normalized = String(planName || "").toUpperCase();

  if (normalized.includes("1 YEAR")) {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else if (normalized.includes("6 MONTH")) {
    endDate.setMonth(endDate.getMonth() + 6);
  } else if (normalized.includes("3 MONTH")) {
    endDate.setMonth(endDate.getMonth() + 3);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
  }

  if (endDate.getDate() !== startDate.getDate()) {
    endDate.setDate(0);
  }

  return endDate;
};

const CustomerDetailsModal = ({ isOpen, onClose, customer }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAttendance, setShowAttendance] = useState(false);

  const parseDateOnly = (value) => {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      return new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const normalizePhone = (value) => String(value || "").replace(/\D/g, "");

  useEffect(() => {
    if (!isOpen || !customer) return;

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const customerPhone = normalizePhone(customer.phone);
        const { data: relatedCustomers, error: relatedCustomersError } = await supabase
          .from("customers")
          .select("id, created_at")
          .eq("gym_id", customer.gym_id)
          .eq("phone", customerPhone);

        if (relatedCustomersError) throw relatedCustomersError;

        const relatedCustomerIds = Array.from(
          new Set([
            customer.id,
            ...((relatedCustomers || []).map((row) => row.id)),
          ]),
        );

        const { data, error } = await supabase
          .from("subscriptions")
          .select("*")
          .in("customer_id", relatedCustomerIds)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setHistory((data || []).sort((left, right) => {
          const leftTime = new Date(left.created_at || 0).getTime();
          const rightTime = new Date(right.created_at || 0).getTime();
          return rightTime - leftTime;
        }));
      } catch (err) {
        console.error("Error fetching history:", err);
        setHistory([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [isOpen, customer]);

  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === "Escape") onClose();
    };

    if (isOpen) {
      window.addEventListener("keydown", handleEsc);
    }

    return () => {
      window.removeEventListener("keydown", handleEsc);
    };
  }, [isOpen, onClose]);

  const membershipMeta = useMemo(() => {
    const parsedEnd = customer?.membership_end_date
      ? parseDateOnly(customer.membership_end_date)
      : null;
    const endDate = parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const active = Boolean(endDate && endDate >= today);
    const daysLeft = endDate
      ? Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    return { endDate, active, daysLeft };
  }, [customer]);

  const oldestSubscriptionStartDate = useMemo(() => {
    if (!Array.isArray(history) || history.length === 0) return null;

    let oldest = null;
    history.forEach((record) => {
      const parsed = parseDateOnly(record.created_at);
      if (!parsed) return;
      if (!oldest || parsed.getTime() < oldest.getTime()) {
        oldest = parsed;
      }
    });

    return oldest;
  }, [history]);

  if (!isOpen || !customer) return null;

  const joinSourceDate =
    oldestSubscriptionStartDate ||
    parseDateOnly(customer.membership_start_date) ||
    parseDateOnly(customer.created_at);
  const joinDate = joinSourceDate
    ? joinSourceDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Unknown";

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#151921] border border-white/10 w-full max-w-2xl rounded-2xl shadow-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <div className="flex justify-between items-start mb-6 border-b border-white/10 pb-5">
          <div>
            <h2 className="text-2xl font-medium tracking-tight text-white">
              View Information
            </h2>
            <div className="mt-2 text-xs text-white/45 tracking-[0.08em] font-light">
              ID: {String(customer.id || "-").substring(0, 8)}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors text-[11px] tracking-[0.08em] font-light"
          >
            Close [ESC]
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-[#0a0c10] border border-white/10 rounded-xl p-4 text-center">
            <Calendar className="w-5 h-5 text-white/70 mx-auto mb-2" />
            <p className="text-[10px] tracking-[0.08em] text-white/50 font-light">Joined</p>
            <p className="text-sm font-medium text-white mt-1">{joinDate}</p>
          </div>

          <div className="bg-[#0a0c10] border border-white/10 rounded-xl p-4 text-center">
            <History className="w-5 h-5 text-white/70 mx-auto mb-2" />
            <p className="text-[10px] tracking-[0.08em] text-white/50 font-light">Current Plan</p>
            <p className="text-sm font-medium text-white mt-1">
              {customer.membership_duration || "N/A"}
            </p>
          </div>

          <div className="bg-[#0a0c10] border border-white/10 rounded-xl p-4 text-center">
            <History className="w-5 h-5 text-white/70 mx-auto mb-2" />
            <p className="text-[10px] tracking-[0.08em] text-white/50 font-light">Membership</p>
            <p className="text-sm font-medium text-white mt-1">
              {membershipMeta.active ? `${membershipMeta.daysLeft} days left` : "-"}
            </p>
          </div>
        </div>

        {/* ── Attendance launcher ── */}
        <button
          type="button"
          onClick={() => setShowAttendance(true)}
          className="w-full flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05] transition-colors px-4 py-3 mb-5 group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
              <Activity size={14} className="text-indigo-400" />
            </div>
            <div className="text-left">
              <p className="text-[12px] text-white/80 font-medium tracking-tight">Attendance</p>
              <p className="text-[10px] text-white/35 font-light">View check-in history &amp; visit stats</p>
            </div>
          </div>
          <span className="text-[10px] text-white/25 group-hover:text-white/50 transition-colors tracking-widest">
            VIEW →
          </span>
        </button>

        <div>
          <h3 className="text-xs tracking-[0.08em] text-white/65 mb-4 flex items-center gap-2 font-light">
            <History className="w-4 h-4" />
            Subscription Ledger
          </h3>

          <div className="bg-[#0a0c10] border border-white/10 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-xs tracking-[0.08em] text-white/45 font-light">
                Querying ledger...
              </div>
            ) : history.length === 0 ? (
              <div className="p-8 text-center bg-white/[0.02]">
                <p className="text-xs tracking-[0.08em] text-white/45 font-light mb-2">
                  No historical records
                </p>
                <p className="text-sm text-white/30 font-light">
                  Older subscriptions were not synced or linked to this phone number yet.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/10">
                {history.map((record, index) => {
                  const startDate = parseDateOnly(record.created_at);
                  const endDate = startDate
                    ? addDurationToDate(startDate, record.plan_name)
                    : null;
                  const isLatest = index === 0;
                  const showActive =
                    isLatest && membershipMeta.active && String(record.status || "").toUpperCase() === "ACTIVE";

                  const startLabel = startDate
                    ? startDate.toLocaleDateString("en-US", { dateStyle: "medium" })
                    : "Unknown";
                  const endLabel = endDate
                    ? endDate.toLocaleDateString("en-US", { dateStyle: "medium" })
                    : "Unknown";

                  return (
                    <div key={record.id} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-white/10 border border-white/10 text-white/80 flex items-center justify-center flex-shrink-0">
                          <IndianRupee className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{record.plan_name}</p>
                          <p className="text-[11px] text-white/55 font-light">
                            Start: {startLabel}
                          </p>
                          <p className="text-[11px] text-white/55 font-light">
                            End: {endLabel}
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-white font-medium text-sm">₹{record.amount}</p>
                        {showActive ? (
                          <p className="text-[10px] tracking-[0.08em] text-white/60 mt-1 font-light">
                            Status: Active
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    <MemberAttendanceModal
      isOpen={showAttendance}
      onClose={() => setShowAttendance(false)}
      customer={customer}
    />
  </>
  );
};

export default CustomerDetailsModal;
