/**
 * src/pages/ScannerMappingPage.jsx
 * "Link Scanner Members" — dedicated page for resolving unmatched scanner IDs
 */
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Link2, Zap, CheckCircle2, Search, ChevronLeft,
  Fingerprint, Calendar, BarChart2, Loader2,
} from "lucide-react";
import { fetchUnmappedIds, mapScannerMember, autoMapScannerMembers } from "../lib/backendApi";

// ─────────────────────────────────────────────────────────────────────────────
const fmtDate = (ts) => {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  }).format(new Date(ts));
};

// ─────────────────────────────────────────────────────────────────────────────
// Single row component
// ─────────────────────────────────────────────────────────────────────────────
const UnmappedRow = ({ row, customers, onLinked }) => {
  const [search, setSearch]           = useState("");
  const [selectedId, setSelectedId]   = useState("");
  const [linking, setLinking]         = useState(false);
  const [linked, setLinked]           = useState(null); // { logged: number }
  const [exiting, setExiting]         = useState(false);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.gym_member_id ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").includes(q)
    );
  });

  const handleLink = async () => {
    if (!selectedId) return;
    setLinking(true);
    try {
      const res = await mapScannerMember({
        device_user_id: row.device_user_id,
        customer_id:    selectedId,
      });
      setLinked({ logged: res.retroactive_count ?? 0 });
      // Animate out after 2 seconds
      setTimeout(() => {
        setExiting(true);
        setTimeout(() => onLinked(row.device_user_id), 500);
      }, 2000);
    } catch (err) {
      alert(err.message || "Failed to link member. Please try again.");
    } finally {
      setLinking(false);
    }
  };

  // Success state
  if (linked) {
    return (
      <div
        className="sm-row sm-row--success"
        style={{ opacity: exiting ? 0 : 1, transform: exiting ? "translateY(-6px)" : "none", transition: "opacity 0.4s, transform 0.4s" }}
      >
        <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-[12px] text-emerald-300 font-medium">Linked.</p>
          <p className="text-[11px] text-white/45 mt-0.5">
            {linked.logged > 0
              ? `${linked.logged} historical check-in${linked.logged !== 1 ? "s" : ""} have been logged.`
              : "No historical scans to retroactively log."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="sm-row">
      {/* Left: device info */}
      <div className="sm-row__info">
        <div className="sm-row__id-chip">
          <Fingerprint size={13} />
          <span>ID {row.device_user_id}</span>
        </div>
        <div className="sm-row__meta">
          <span title="Total scans">
            <BarChart2 size={11} className="inline mr-1 opacity-60" />
            {row.scan_count} scan{row.scan_count !== 1 ? "s" : ""}
          </span>
          <span title="First scan">
            <Calendar size={11} className="inline mr-1 opacity-60" />
            {fmtDate(row.first_seen)} – {fmtDate(row.last_seen)}
          </span>
        </div>
      </div>

      {/* Right: customer search + link */}
      <div className="sm-row__controls">
        <div className="sm-search-wrap">
          <Search size={12} className="sm-search-icon" />
          <input
            type="text"
            placeholder="Search member…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm-search-input"
          />
        </div>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="sm-select"
        >
          <option value="">— Select member —</option>
          {filtered.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.gym_member_id ? `  [${c.gym_member_id}]` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleLink}
          disabled={!selectedId || linking}
          className="sm-link-btn"
        >
          {linking ? <Loader2 size={13} className="sm-spin" /> : <Link2 size={13} />}
          {linking ? "Linking…" : "Link"}
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
const ScannerMappingPage = () => {
  const navigate = useNavigate();

  const [unmapped,     setUnmapped]     = useState([]);
  const [customers,    setCustomers]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [autoMapping,  setAutoMapping]  = useState(false);
  const [toast,        setToast]        = useState(null); // { msg, type }

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { unmapped: u, customers: c } = await fetchUnmappedIds();
      setUnmapped(u ?? []);
      setCustomers(c ?? []);
    } catch (err) {
      showToast(err.message || "Failed to load data.", "err");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAutoMap = async () => {
    setAutoMapping(true);
    try {
      const { auto_mapped, still_unmatched } = await autoMapScannerMembers();
      showToast(
        `${auto_mapped} member${auto_mapped !== 1 ? "s" : ""} auto-linked` +
        (still_unmatched > 0 ? `, ${still_unmatched} still need manual linking` : ". All done!"),
        "ok"
      );
      // Reload to reflect resolved rows
      await loadData();
    } catch (err) {
      showToast(err.message || "Auto-link failed.", "err");
    } finally {
      setAutoMapping(false);
    }
  };

  const handleLinked = (deviceUserId) => {
    setUnmapped((prev) => prev.filter((r) => r.device_user_id !== deviceUserId));
  };

  return (
    <div className="app-page p-4 md:px-10 md:pt-10 pb-20">
      <style>{`
        /* ── Scanner Mapping Page styles ── */
        .sm-back { display:flex;align-items:center;gap:6px;color:rgba(255,255,255,0.45);font-size:11px;letter-spacing:.06em;cursor:pointer;border:none;background:none;padding:0;margin-bottom:24px;transition:color .2s; }
        .sm-back:hover { color:rgba(255,255,255,0.8); }
        .sm-banner { display:flex;align-items:center;justify-content:space-between;gap:12px;border-radius:12px;border:1px solid rgba(245,158,11,0.18);background:rgba(245,158,11,0.05);padding:14px 18px;margin-bottom:28px; }
        .sm-banner__text { font-size:12px;color:rgba(255,255,255,0.6);letter-spacing:.05em; }
        .sm-banner__count { font-size:22px;font-weight:600;color:#f59e0b;letter-spacing:-.02em; }
        .sm-auto-btn { display:flex;align-items:center;gap:6px;border-radius:10px;border:1px solid rgba(99,102,241,0.3);background:rgba(99,102,241,0.12);color:rgba(180,182,255,0.9);font-size:11px;letter-spacing:.06em;padding:8px 16px;cursor:pointer;transition:background .2s; }
        .sm-auto-btn:hover:not(:disabled) { background:rgba(99,102,241,0.22); }
        .sm-auto-btn:disabled { opacity:0.55;cursor:not-allowed; }
        .sm-toast { position:fixed;bottom:28px;right:24px;z-index:9999;border-radius:10px;padding:10px 16px;font-size:11px;letter-spacing:.05em;max-width:340px;border:1px solid;animation:sm-toast-in .25s ease; }
        .sm-toast--ok { border-color:rgba(16,185,129,0.3);background:rgba(16,185,129,0.12);color:#6ee7b7; }
        .sm-toast--err { border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.1);color:#fca5a5; }
        @keyframes sm-toast-in { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .sm-list { display:flex;flex-direction:column;gap:12px; }
        .sm-row { border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02);padding:16px 18px;display:flex;flex-direction:column;gap:14px;transition:opacity .4s,transform .4s; }
        @media(min-width:768px){ .sm-row { flex-direction:row;align-items:flex-start;justify-content:space-between;gap:20px; } }
        .sm-row--success { display:flex;align-items:flex-start;gap:12px;border-radius:12px;border:1px solid rgba(16,185,129,0.2);background:rgba(16,185,129,0.05);padding:14px 18px; }
        .sm-row__info { display:flex;flex-direction:column;gap:8px;min-width:0; }
        .sm-row__id-chip { display:inline-flex;align-items:center;gap:6px;border-radius:6px;border:1px solid rgba(99,102,241,0.3);background:rgba(99,102,241,0.1);color:rgba(180,182,255,0.85);font-size:12px;font-family:monospace;padding:4px 10px; }
        .sm-row__meta { display:flex;flex-wrap:wrap;gap:12px;font-size:10px;color:rgba(255,255,255,0.35);letter-spacing:.04em; }
        .sm-row__controls { display:flex;flex-direction:column;gap:8px;width:100%; }
        @media(min-width:768px){ .sm-row__controls { width:340px;flex-shrink:0; } }
        .sm-search-wrap { position:relative; }
        .sm-search-icon { position:absolute;left:10px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,0.3);pointer-events:none; }
        .sm-search-input { width:100%;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(0,0,0,0.25);color:rgba(255,255,255,0.85);font-size:11px;padding:7px 10px 7px 28px;outline:none;transition:border-color .2s;box-sizing:border-box; }
        .sm-search-input:focus { border-color:rgba(255,255,255,0.25); }
        .sm-select { width:100%;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(0,0,0,0.25);color:rgba(255,255,255,0.85);font-size:11px;padding:7px 10px;outline:none;cursor:pointer; }
        .sm-link-btn { display:flex;align-items:center;justify-content:center;gap:6px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.85);font-size:11px;letter-spacing:.06em;padding:8px;cursor:pointer;transition:background .2s;width:100%; }
        .sm-link-btn:hover:not(:disabled) { background:rgba(255,255,255,0.12); }
        .sm-link-btn:disabled { opacity:0.5;cursor:not-allowed; }
        .sm-spin { animation:spin 1s linear infinite; }
        @keyframes spin { to{transform:rotate(360deg)} }
        .sm-empty { display:flex;flex-direction:column;align-items:center;gap:16px;padding:64px 24px;text-align:center; }
        .sm-empty__icon { width:56px;height:56px;border-radius:50%;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);display:flex;align-items:center;justify-content:center; }
      `}</style>

      <div className="w-full max-w-3xl mx-auto">

        {/* Back */}
        <button className="sm-back" onClick={() => navigate("/attendance")}>
          <ChevronLeft size={14} />
          Back to Attendance
        </button>

        {/* Header */}
        <header className="space-y-1 mb-8">
          <p className="text-xs tracking-[0.2em] text-white/45" style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 300 }}>
            Scanner
          </p>
          <h1 className="text-4xl md:text-5xl font-medium tracking-tighter text-white" style={{ fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif" }}>
            Link Scanner Members
          </h1>
          <p className="text-sm text-white/50" style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 300 }}>
            Match unrecognised device IDs to your members to start tracking attendance.
          </p>
        </header>

        {loading ? (
          <div className="sm-empty">
            <Loader2 size={28} className="sm-spin text-white/30" />
            <p className="text-white/40 text-sm">Loading scanner IDs…</p>
          </div>
        ) : unmapped.length === 0 ? (
          /* Empty state */
          <div className="sm-empty">
            <div className="sm-empty__icon">
              <CheckCircle2 size={24} className="text-emerald-400" />
            </div>
            <p className="text-white/70 text-base font-medium">All scanner members are linked.</p>
            <p className="text-white/35 text-sm">No unresolved device IDs remain. Attendance is tracking normally.</p>
          </div>
        ) : (
          <>
            {/* Banner + Auto-link */}
            <div className="sm-banner">
              <div>
                <p className="sm-banner__count">{unmapped.length}</p>
                <p className="sm-banner__text">
                  unmatched scanner ID{unmapped.length !== 1 ? "s" : ""} need linking
                </p>
              </div>
              <button
                type="button"
                className="sm-auto-btn"
                onClick={handleAutoMap}
                disabled={autoMapping}
              >
                {autoMapping ? <Loader2 size={13} className="sm-spin" /> : <Zap size={13} />}
                {autoMapping ? "Auto-linking…" : "Auto-link"}
              </button>
            </div>

            {/* Row list */}
            <div className="sm-list">
              {unmapped.map((row) => (
                <UnmappedRow
                  key={row.device_user_id}
                  row={row}
                  customers={customers}
                  onLinked={handleLinked}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`sm-toast sm-toast--${toast.type}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
};

export default ScannerMappingPage;
