/**
 * src/components/MemberAttendanceModal.jsx
 * Secondary modal showing full attendance history for one member.
 * Opens on top of CustomerDetailsModal (z-[60]).
 */
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { X, Fingerprint, TrendingUp, Clock, Calendar, BarChart2 } from "lucide-react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const fmt = (ts, opts) =>
  ts ? new Intl.DateTimeFormat("en-IN", opts).format(new Date(ts)) : "—";

// ─────────────────────────────────────────────────────────────────────────────
const MemberAttendanceModal = ({ isOpen, onClose, customer }) => {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !customer?.id) return;
    let alive = true;
    setLoading(true);
    setLogs([]);
    supabase
      .from("attendance_logs")
      .select("scanned_at, punch_type, status")
      .eq("customer_id", customer.id)
      .order("scanned_at", { ascending: false })
      .then(({ data }) => {
        if (!alive) return;
        setLogs(data ?? []);
        setLoading(false);
      });
    const handleEsc = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => { alive = false; window.removeEventListener("keydown", handleEsc); };
  }, [isOpen, customer, onClose]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const totalVisits = logs.length;
  const thisMonth   = logs.filter((l) => new Date(l.scanned_at) >= monthStart).length;
  const lastSeen    = logs.length > 0 ? logs[0].scanned_at : null;

  // ── Weekly chart buckets (last 8 weeks, oldest → newest) ──────────────────
  const weekBuckets = Array.from({ length: 8 }, (_, i) => {
    const offset    = 7 - i; // 7 weeks ago … 0 weeks ago
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() - offset * 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const count = logs.filter((l) => {
      const d = new Date(l.scanned_at);
      return d >= weekStart && d < weekEnd;
    }).length;
    const label = weekStart.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
    return { label, count };
  });
  const maxCount = Math.max(...weekBuckets.map((w) => w.count), 1);

  if (!isOpen || !customer) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#0f1117] border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl max-h-[88vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Fingerprint size={16} className="text-indigo-400" />
            <h3 className="text-base font-medium text-white tracking-tight">
              Attendance — {customer.first_name} {customer.last_name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/35 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {loading ? (
            <div className="flex items-center justify-center py-16 text-white/30 text-sm">
              Loading attendance…
            </div>
          ) : (
            <>
              {/* ── Stat cards ──────────────────────────────────────────── */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: TrendingUp, label: "All-time visits", value: totalVisits, color: "text-indigo-400" },
                  { icon: Calendar,   label: "This month",      value: thisMonth,   color: "text-emerald-400" },
                  {
                    icon: Clock,
                    label: "Last seen",
                    value: lastSeen
                      ? fmt(lastSeen, { day: "numeric", month: "short" })
                      : "Never",
                    color: "text-amber-400",
                  },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div
                    key={label}
                    className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-center"
                  >
                    <Icon size={15} className={`mx-auto mb-1.5 ${color}`} />
                    <p className="text-[10px] text-white/40 tracking-[.06em] mb-1">{label}</p>
                    <p className="text-lg font-semibold text-white leading-tight">{value}</p>
                  </div>
                ))}
              </div>

              {logs.length === 0 ? (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] py-12 text-center">
                  <Fingerprint size={28} className="mx-auto mb-3 text-white/15" />
                  <p className="text-white/40 text-sm">No attendance records yet.</p>
                  <p className="text-white/25 text-xs mt-1">
                    Make sure this member's scanner ID is linked.
                  </p>
                </div>
              ) : (
                <>
                  {/* ── Weekly bar chart ──────────────────────────────── */}
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <BarChart2 size={13} className="text-white/40" />
                      <span className="text-[10px] text-white/45 tracking-[.08em] uppercase">
                        Visits per week — last 8 weeks
                      </span>
                    </div>
                    <div className="flex items-end justify-between gap-1.5 h-24">
                      {weekBuckets.map(({ label, count }) => {
                        const pct = (count / maxCount) * 100;
                        return (
                          <div key={label} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                            <span className="text-[8px] text-white/40 tabular-nums">
                              {count > 0 ? count : ""}
                            </span>
                            <div
                              className="w-full rounded-sm transition-all duration-500"
                              style={{
                                height: `${Math.max(pct, count > 0 ? 8 : 2)}%`,
                                background: count > 0
                                  ? "linear-gradient(to top, #6366f1, #818cf8)"
                                  : "rgba(255,255,255,0.06)",
                              }}
                            />
                            <span
                              className="text-[7px] text-white/30 truncate w-full text-center"
                              title={label}
                            >
                              {label.split(" ")[0]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Check-in list ─────────────────────────────────── */}
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
                      <Clock size={12} className="text-white/40" />
                      <span className="text-[10px] text-white/45 tracking-[.08em] uppercase">
                        Check-in history
                      </span>
                    </div>
                    <div className="divide-y divide-white/[0.05] max-h-60 overflow-y-auto">
                      {logs.map((log, i) => {
                        const d   = new Date(log.scanned_at);
                        const day = DAYS[d.getDay()];
                        return (
                          <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] text-white/30 w-7 text-center font-mono">
                                {day}
                              </span>
                              <span className="text-[11px] text-white/70">
                                {fmt(log.scanned_at, { day: "numeric", month: "short", year: "numeric" })}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[11px] text-white/50 font-mono">
                                {fmt(log.scanned_at, { hour: "2-digit", minute: "2-digit", hour12: true })}
                              </span>
                              {log.status === "expired_member" && (
                                <span className="text-[8px] text-amber-400/80 border border-amber-400/20 bg-amber-400/[0.07] rounded px-1.5 py-0.5">
                                  expired
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MemberAttendanceModal;
