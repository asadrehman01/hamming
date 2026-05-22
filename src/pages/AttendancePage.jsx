import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Fingerprint,
  Wifi,
  WifiOff,
  RefreshCw,
  Settings2,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
  UserX,
  ChevronRight,
  AlertTriangle,
  Save,
  ToggleLeft,
  ToggleRight,
  Activity,
  Link,
  Users,
  Search,
  Unlink,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { testScannerConnection, syncScanner, enrollScannerMember, unenrollScannerMember } from "../lib/backendApi";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmtDate = (ts) => {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
};

const fmtTime = (ts) => {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ts));
};

const fmtRelative = (ts) => {
  if (!ts) return "Never";
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const StatusPill = ({ connected, checking }) => {
  if (checking)
    return (
      <span className="att-pill att-pill--checking">
        <span className="att-pill__dot att-pill__dot--pulse" />
        Checking…
      </span>
    );
  if (connected)
    return (
      <span className="att-pill att-pill--online">
        <span className="att-pill__dot att-pill__dot--green" />
        Connected
      </span>
    );
  return (
    <span className="att-pill att-pill--offline">
      <span className="att-pill__dot att-pill__dot--red" />
      Offline
    </span>
  );
};

const SyncBadge = ({ lastSyncedAt }) => (
  <span className="att-sync-badge">
    <Clock size={11} />
    {fmtRelative(lastSyncedAt)}
  </span>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const AttendancePage = () => {
  const navigate = useNavigate();
  const [currentGymId, setCurrentGymId] = useState(null);
  // ── settings form state ──────────────────────────────────────────────────
  const [settings, setSettings] = useState({
    ip_address: "",
    port: 4370,
    enabled: true,
    sync_interval_minutes: 15,
    brand: "zkteco",
  });
  const [settingsId, setSettingsId] = useState(null);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  // ── connection state ─────────────────────────────────────────────────────
  const [connected, setConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null); // { device_name, serial_number }

  // ── attendance logs ──────────────────────────────────────────────────────
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterMatch, setFilterMatch] = useState("all"); // all | matched | unmatched

  // ── ui state ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("logs"); // logs | mapping | settings
  const syncTimerRef = useRef(null);

  // ── mapping state ────────────────────────────────────────────────────────
  const [unmatchedIds, setUnmatchedIds] = useState([]);
  const [customerList, setCustomerList] = useState([]);
  const [existingMaps, setExistingMaps] = useState([]);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [rowState, setRowState] = useState({});

  // ─── Load on mount ────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;

    const loadInitialData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!active) return;
        if (!user?.id) return;

        setCurrentGymId(user.id);
      } catch (error) {
        console.error("Failed to resolve attendance session:", error);
      }
    };

    loadInitialData();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!currentGymId) return;

    loadSettings(currentGymId);
    loadUnmatched(currentGymId);
    loadCustomers(currentGymId);
    loadExistingMaps(currentGymId);
  }, [currentGymId]);

  // ─── Auto-sync polling ────────────────────────────────────────────────────
  useEffect(() => {
    if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    if (settings.enabled && settings.ip_address && connected) {
      const ms = settings.sync_interval_minutes * 60 * 1000;
      syncTimerRef.current = setInterval(() => triggerSync(true), ms);
    }
    return () => clearInterval(syncTimerRef.current);
  }, [settings.enabled, settings.ip_address, settings.sync_interval_minutes, connected]);

  // ─── Data fetchers ────────────────────────────────────────────────────────
  const loadSettings = async (gymId = currentGymId) => {
    if (!supabase) return;
    if (!gymId) return;

    const { data } = await supabase
      .from("scanner_settings")
      .select("*")
      .eq("user_id", gymId)
      .maybeSingle();

    if (data) {
      setSettingsId(data.id);
      setLastSyncedAt(data.last_synced_at);
      setSettings({
        ip_address: data.ip_address,
        port: data.port,
        enabled: data.enabled,
        sync_interval_minutes: data.sync_interval_minutes,
        brand: data.brand,
      });
    }
  };

  const loadLogs = useCallback(async () => {
    if (!supabase) return;
    if (!currentGymId) return;
    setLogsLoading(true);
    try {
      let query = supabase
        .from("attendance_logs")
        .select(`
          id, device_user_id, scanned_at, punch_type, matched, created_at,
          customers ( id, first_name, last_name, phone )
        `)
        .eq("user_id", currentGymId)
        .order("scanned_at", { ascending: false })
        .limit(200);

      if (filterDate) {
        const start = new Date(filterDate);
        const end = new Date(filterDate);
        end.setDate(end.getDate() + 1);
        query = query.gte("scanned_at", start.toISOString()).lt("scanned_at", end.toISOString());
      }
      if (filterMatch === "matched") query = query.eq("matched", true);
      if (filterMatch === "unmatched") query = query.eq("matched", false);

      const { data, error } = await query;
      if (error) throw error;
      setLogs(data ?? []);
    } finally {
      setLogsLoading(false);
    }
  }, [filterDate, filterMatch, currentGymId]);

  // ─── Save settings ────────────────────────────────────────────────────────
  const saveSettings = async (e) => {
    e.preventDefault();
    setSettingsError("");
    setSavingSettings(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const payload = { ...settings, user_id: user.id, updated_at: new Date().toISOString() };

      if (settingsId) {
        const { error } = await supabase
          .from("scanner_settings")
          .update(payload)
          .eq("id", settingsId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("scanner_settings")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        setSettingsId(data.id);
      }

      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (err) {
      setSettingsError(err.message ?? "Failed to save settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  // ─── Real connection test via backend API ────────────────────────────────
  const checkConnection = async () => {
    if (!settings.ip_address) return;
    setCheckingConnection(true);
    setConnected(false);
    setDeviceInfo(null);
    setSyncMessage("");
    try {
      const result = await testScannerConnection({
        ip: settings.ip_address.trim(),
        port: settings.port,
        brand: settings.brand,
      });
      if (result.success) {
        setConnected(true);
        setDeviceInfo({
          device_name: result.device_name,
          serial_number: result.serial_number,
          firmware_version: result.firmware_version,
          user_count: result.user_count,
          log_count: result.log_count,
        });
        setSyncMessage(`✓ Connected — ${result.device_name} (S/N: ${result.serial_number})`);
      } else {
        setConnected(false);
        setSyncMessage(`✗ ${result.error ?? "Device unreachable"}`);
      }
    } catch (err) {
      setConnected(false);
      setSyncMessage(`✗ ${err.message ?? "Connection test failed"}`);
    } finally {
      setCheckingConnection(false);
    }
  };

  // ─── Trigger sync via backend API ────────────────────────────────────────
  const triggerSync = async (silent = false) => {
    if (!settings.ip_address) return;
    if (!silent) setSyncing(true);
    if (!silent) setSyncMessage("");
    try {
      const result = await syncScanner({
        ip_address: settings.ip_address,
        port: settings.port,
        force: true, // always honour manual sync regardless of enabled flag
      });

      if (!result.success) {
        if (!silent) setSyncMessage(`✗ ${result.error ?? "Sync failed"}`);
        return;
      }

      const syncedAt = result.synced_at ?? new Date().toISOString();
      setLastSyncedAt(syncedAt);

      if (!silent) {
        const msg = result.total_on_device === 0
          ? "✓ No new records since last sync."
          : `✓ Synced ${result.inserted} new record(s) · ${result.matched} matched · ${result.skipped} duplicate(s) skipped`;
        setSyncMessage(msg);
      }

      // Refresh log table
      await loadLogs();

      // Persist last_synced_at locally if server gave us the timestamp
      if (settingsId && syncedAt) {
        await supabase
          .from("scanner_settings")
          .update({ last_synced_at: syncedAt })
          .eq("id", settingsId);
      }
    } catch (err) {
      if (!silent) setSyncMessage(`✗ ${err.message ?? "Sync failed"}`);
    } finally {
      if (!silent) setSyncing(false);
    }
  };

  // ─── Mapping helpers ──────────────────────────────────────────────────────
  const getRow = (uid) => rowState[uid] ?? { search: "", selected: null, open: false, saving: false };
  const setRow = (uid, patch) => setRowState((prev) => ({ ...prev, [uid]: { ...getRow(uid), ...patch } }));

  const filteredCustomers = (uid) => {
    const q = (getRow(uid).search || "").toLowerCase();
    if (!q) return customerList.slice(0, 6);
    return customerList
      .filter((c) => `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase().includes(q) || (c.phone || "").includes(q))
      .slice(0, 6);
  };

  const loadUnmatched = async (gymId = currentGymId) => {
    if (!supabase) return;
    if (!gymId) return;
    setMappingLoading(true);
    try {
      const { data } = await supabase
        .from("unmatched_scans")
        .select("device_user_id, scanned_at")
        .eq("user_id", gymId)
        .eq("resolved", false)
        .order("scanned_at", { ascending: false });
      const grouped = {};
      for (const row of data ?? []) {
        if (!grouped[row.device_user_id]) {
          grouped[row.device_user_id] = { device_user_id: row.device_user_id, scan_count: 0, last_seen: row.scanned_at };
        }
        grouped[row.device_user_id].scan_count++;
      }
      setUnmatchedIds(Object.values(grouped).sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen)));
    } finally {
      setMappingLoading(false);
    }
  };

  const loadCustomers = async (gymId = currentGymId) => {
    if (!supabase) return;
    if (!gymId) return;
    const { data } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone")
      .eq("gym_id", gymId)
      .order("first_name");
    setCustomerList(data ?? []);
  };

  const loadExistingMaps = async (gymId = currentGymId) => {
    if (!supabase) return;
    if (!gymId) return;
    const { data } = await supabase
      .from("scanner_member_map")
      .select("device_user_id, customer_id, created_at, customers(id, first_name, last_name, phone)")
      .eq("user_id", gymId)
      .order("created_at", { ascending: false });
    setExistingMaps(data ?? []);
  };

  const enrollMember = async (deviceUserId) => {
    const row = getRow(deviceUserId);
    if (!row.selected) return;
    setRow(deviceUserId, { saving: true });
    try {
      const result = await enrollScannerMember({ device_user_id: deviceUserId, customer_id: row.selected.id });
      if (!result.success) throw new Error(result.error || "Enrollment failed");
      setUnmatchedIds((prev) => prev.filter((u) => u.device_user_id !== deviceUserId));
      setExistingMaps((prev) => [{ device_user_id: deviceUserId, customer_id: row.selected.id, created_at: new Date().toISOString(), customers: row.selected }, ...prev]);
      setRow(deviceUserId, { search: "", selected: null, open: false, saving: false });
      setSyncMessage(`✓ Device ${deviceUserId} linked — ${result.backfilled ?? 0} historical record(s) backfilled.`);
    } catch (err) {
      setSyncMessage(`✗ ${err.message}`);
      setRow(deviceUserId, { saving: false });
    }
  };

  const unenrollMember = async (deviceUserId) => {
    try {
      await unenrollScannerMember({ device_user_id: deviceUserId });
      setExistingMaps((prev) => prev.filter((m) => m.device_user_id !== deviceUserId));
      setSyncMessage(`✓ Device ${deviceUserId} unlinked.`);
      await loadUnmatched();
    } catch (err) {
      setSyncMessage(`✗ ${err.message}`);
    }
  };

  // ─── Stats ───────────────────────────────────────────────────────────────
  const totalToday = logs.filter((l) => {
    const d = new Date(l.scanned_at);
    const n = new Date();
    return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
  }).length;
  const matchedCount = logs.filter((l) => l.matched).length;
  const unmatchedCount = logs.filter((l) => !l.matched).length;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="app-page attendance-page-vibe p-6 md:p-10 overflow-y-auto h-full">
      <style>{` 
@import url("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=DM+Sans:wght@400;500;600&display=swap");
.attendance-page-vibe { background-color: #ffffff !important; color: #0d0d0d; min-height: 100vh; }
.attendance-page-vibe h1, .attendance-page-vibe h2, .attendance-page-vibe h3, .attendance-page-vibe .attendance-header-title { font-family: 'Playfair Display', serif !important; font-weight: 400; color: #0d0d0d; letter-spacing: 0.02em; }
.attendance-page-vibe .attendance-subtle { color: #666666; }
.attendance-page-vibe [class*="text-white/"] { color: #666666 !important; }
.attendance-page-vibe [class*="text-white"] { color: #0d0d0d !important; }
.attendance-page-vibe [style*="color: rgba(255,255,255"] { color: #0d0d0d !important; }
.attendance-page-vibe .att-empty, .attendance-page-vibe .att-info-box, .attendance-page-vibe .att-settings-card, .attendance-page-vibe .att-map-row, .attendance-page-vibe .att-unmatched-alert, .attendance-page-vibe .att-unmatched-alert__body, .attendance-page-vibe .att-map-row__picker, .attendance-page-vibe .att-map-row__uid { color: #0d0d0d !important; }
.attendance-page-vibe .att-empty p, .attendance-page-vibe .att-empty span, .attendance-page-vibe .att-info-box .text-white/45, .attendance-page-vibe .att-info-box .text-white/60 { color: #666666 !important; }
.attendance-page-vibe .att-stat-card { background: #fafafa; border: 1px solid rgba(0,0,0,0.12); border-radius: 12px; padding: 16px; }
.attendance-page-vibe .att-stat-card__label { color: #6b6b6b; }
.attendance-page-vibe .att-stat-card__value { color: #0d0d0d; }
.attendance-page-vibe .att-table-wrap { background: #fafafa; border: 1px solid rgba(0,0,0,0.12); border-radius: 12px; padding: 0.5rem; }
.attendance-page-vibe .att-settings-card, .attendance-page-vibe .att-info-box, .attendance-page-vibe .att-map-row, .attendance-page-vibe .att-unmatched-alert { background: #fafafa; border: 1px solid rgba(0,0,0,0.12); }
.attendance-page-vibe .att-empty { background: transparent; }
.attendance-page-vibe input, .attendance-page-vibe select, .attendance-page-vibe textarea { background-color: #ffffff !important; color: #0d0d0d !important; border-color: rgba(0,0,0,0.12) !important; }
.attendance-page-vibe button { border-color: rgba(0,0,0,0.12) !important; }
/* Override tab/button/filter styles from global dark theme */
.attendance-page-vibe .att-tabs { background: rgba(0,0,0,0.02) !important; border-color: rgba(0,0,0,0.06) !important; }
.attendance-page-vibe .att-tab { color: #666666 !important; background: transparent !important; border-color: transparent !important; }
.attendance-page-vibe .att-tab--active { background: rgba(0,0,0,0.03) !important; border-color: rgba(0,0,0,0.06) !important; color: #0d0d0d !important; }
.attendance-page-vibe .att-tab svg { color: inherit !important; }
.attendance-page-vibe .att-btn { color: #0d0d0d !important; background: transparent !important; }
.attendance-page-vibe .att-btn--primary { background: rgba(16,185,129,0.08) !important; border-color: rgba(0,0,0,0.06) !important; color: #0d0d0d !important; }
.attendance-page-vibe .att-btn--ghost { background: transparent !important; border-color: rgba(0,0,0,0.04) !important; color: #666666 !important; }
.attendance-page-vibe .att-filter-tab { color: #666666 !important; background: transparent !important; border-color: transparent !important; }
.attendance-page-vibe .att-filter-tab--active { background: rgba(0,0,0,0.03) !important; border-color: rgba(0,0,0,0.06) !important; color: #0d0d0d !important; }
.attendance-page-vibe .att-btn svg, .attendance-page-vibe .att-filter-tab svg { color: inherit !important; }
.attendance-page-vibe .att-uid { background: #f5f5f5 !important; color: #333 !important; border-color: rgba(0,0,0,0.06) !important; }
/* Hover states - ensure hover doesn't switch to white from global dark CSS */
.attendance-page-vibe .att-tab:hover:not(.att-tab--active):not(:disabled) { color: #444444 !important; background: rgba(0,0,0,0.03) !important; border-color: rgba(0,0,0,0.06) !important; }
.attendance-page-vibe .att-btn:hover:not(:disabled) { transform: translateY(-1px) !important; color: #0d0d0d !important; background: rgba(0,0,0,0.03) !important; }
.attendance-page-vibe .att-btn--primary:hover:not(:disabled) { background: rgba(16,185,129,0.12) !important; border-color: rgba(16,185,129,0.2) !important; color: #0d0d0d !important; box-shadow: none !important; }
.attendance-page-vibe .att-btn--ghost:hover:not(:disabled) { background: rgba(0,0,0,0.03) !important; color: #444444 !important; border-color: rgba(0,0,0,0.06) !important; }
.attendance-page-vibe .att-filter-tab:hover:not(:disabled) { color: #444444 !important; background: rgba(0,0,0,0.03) !important; border-color: rgba(0,0,0,0.06) !important; }

/* Scanner settings card specific overrides */
.attendance-page-vibe .att-settings-card { color: #0d0d0d !important; }
.attendance-page-vibe .att-settings-card .att-label { color: #0d0d0d !important; }
.attendance-page-vibe .att-settings-card .att-hint { color: #666666 !important; }
.attendance-page-vibe .att-settings-card .att-feedback { color: inherit !important; }
.attendance-page-vibe .att-settings-card .att-toggle-btn svg { color: #0d0d0d !important; }
.attendance-page-vibe .att-settings-card .att-brand-badge { color: #6b6b6b !important; background: rgba(99,102,241,0.06) !important; border-color: rgba(99,102,241,0.12) !important; }
.attendance-page-vibe .att-input::placeholder { color: rgba(0,0,0,0.35) !important; }
.attendance-page-vibe .att-input, .attendance-page-vibe .att-select { background: #ffffff !important; color: #0d0d0d !important; border-color: rgba(0,0,0,0.12) !important; }
.attendance-page-vibe .att-selected-customer .att-member-name, .attendance-page-vibe .att-member-name, .attendance-page-vibe .att-member-phone { color: #0d0d0d !important; }

/* Subtle separators between settings sections */
.attendance-page-vibe .att-divider { border-top: 1px solid rgba(0,0,0,0.06) !important; margin: 16px 0 !important; }
.attendance-page-vibe .att-settings-card .att-settings-row + .att-settings-row { border-top: 1px solid rgba(0,0,0,0.04) !important; padding-top: 16px !important; margin-top: 16px !important; }
.attendance-page-vibe .att-settings-card .att-settings-row + .att-divider { margin-top: 8px !important; }
`}</style>
      <div className="w-full max-w-[1100px] mx-auto space-y-8">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="flex flex-col md:flex-row md:items-end gap-4 justify-between">
          <div className="space-y-1">
              <p className="text-[10px] tracking-[0.25em] font-mono attendance-subtle uppercase">
                Biometrics
              </p>
              <h1 className="attendance-header-title text-4xl md:text-5xl font-medium tracking-tighter" style={{ fontFamily: "'Playfair Display', serif" }}>
                Attendance <span className="attendance-subtle">Sync</span>
              </h1>
              <p className="text-sm attendance-subtle">
                ZKTeco fingerprint scanner — live attendance log matching.
              </p>
          </div>

          {/* Connection badge + sync */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <StatusPill connected={connected} checking={checkingConnection} />
            {lastSyncedAt && <SyncBadge lastSyncedAt={lastSyncedAt} />}
            <button
              type="button"
              onClick={() => triggerSync(false)}
              disabled={syncing || !settings.ip_address}
              className="att-btn att-btn--primary"
              id="att-sync-btn"
            >
              <RefreshCw size={14} className={syncing ? "att-spin" : ""} />
              {syncing ? "Syncing…" : "Sync Now"}
            </button>
          </div>
        </header>

        {/* sync feedback */}
        {syncMessage && (
          <div className={`att-feedback ${syncMessage.startsWith("✓") ? "att-feedback--ok" : "att-feedback--err"}`}>
            {syncMessage.startsWith("✓") ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            <span>{syncMessage}</span>
          </div>
        )}
        {/* Unlinked scanner IDs banner */}
        {unmatchedIds.length > 0 && (
          <div style={{
            display:"flex",alignItems:"center",justifyContent:"space-between",
            gap:"12px",borderRadius:"10px",padding:"12px 16px",marginBottom:"8px",
            border:"1px solid rgba(245,158,11,0.22)",background:"rgba(245,158,11,0.06)"
          }}>
            <span style={{fontSize:"11px",color:"rgba(255,255,255,0.55)",letterSpacing:".05em"}}>
              <strong style={{color:"#f59e0b",fontWeight:600,fontSize:"13px"}}>{unmatchedIds.length}</strong>
              {" "}scanner ID{unmatchedIds.length !== 1 ? "s are" : " is"} unlinked.
              {" "}Link them to start tracking attendance.
            </span>
            <button
              type="button"
              onClick={() => navigate("/scanner-mapping")}
              style={{
                display:"flex",alignItems:"center",gap:"6px",whiteSpace:"nowrap",
                borderRadius:"8px",border:"1px solid rgba(245,158,11,0.3)",
                background:"rgba(245,158,11,0.1)",color:"rgba(253,186,116,0.9)",
                fontSize:"11px",letterSpacing:".06em",padding:"6px 12px",cursor:"pointer"
              }}
            >
              Go to linking page
            </button>
          </div>
        )}


        {/* ── Stats row ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Today's Visits", value: totalToday, icon: Activity, color: "#10b981" },
            { label: "Total Records", value: logs.length, icon: Fingerprint, color: "#6366f1" },
            { label: "Matched", value: matchedCount, icon: UserCheck, color: "#3b82f6" },
            { label: "Unmatched", value: unmatchedCount, icon: UserX, color: "#f59e0b" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="att-stat-card">
              <div className="att-stat-card__icon" style={{ color }}>
                <Icon size={18} />
              </div>
              <div>
                <p className="att-stat-card__value">{value}</p>
                <p className="att-stat-card__label">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Unmatched scans alert ─────────────────────────────────────────── */}
        {unmatchedIds.length > 0 && activeTab !== "mapping" && (
          <div className="att-unmatched-alert" role="alert" id="att-unmatched-alert">
            <div className="att-unmatched-alert__icon">
              <AlertTriangle size={16} />
            </div>
            <div className="att-unmatched-alert__body">
              <p className="att-unmatched-alert__title">
                {unmatchedIds.length} scanner ID{unmatchedIds.length !== 1 ? "s" : ""} haven't been linked to a member yet.
              </p>
              <p className="att-unmatched-alert__sub">
                These scans won't appear in member visit history until you map them.
              </p>
            </div>
            <button
              type="button"
              id="att-unmatched-resolve"
              className="att-unmatched-alert__btn"
              onClick={() => { setActiveTab("mapping"); loadUnmatched(); loadExistingMaps(); }}
            >
              Resolve →
            </button>
          </div>
        )}

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div className="att-tabs">
          <button type="button" className={`att-tab ${activeTab === "logs" ? "att-tab--active" : ""}`} onClick={() => setActiveTab("logs")} id="att-tab-logs">
            <Activity size={14} /> Attendance Log
          </button>
          <button type="button" className={`att-tab ${activeTab === "mapping" ? "att-tab--active" : ""}`} onClick={() => { setActiveTab("mapping"); loadUnmatched(); loadExistingMaps(); }} id="att-tab-mapping">
            <Link size={14} /> Member Mapping
            {unmatchedIds.length > 0 && <span className="att-tab-badge">{unmatchedIds.length}</span>}
          </button>
          <button type="button" className={`att-tab ${activeTab === "settings" ? "att-tab--active" : ""}`} onClick={() => setActiveTab("settings")} id="att-tab-settings">
            <Settings2 size={14} /> Scanner Settings
          </button>
        </div>

        {/* ── LOGS TAB ─────────────────────────────────────────────────────── */}
        {activeTab === "logs" && (
          <section className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="att-input att-input--sm"
                id="att-filter-date"
              />
              <div className="att-filter-tabs">
                {["all", "matched", "unmatched"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`att-filter-tab ${filterMatch === v ? "att-filter-tab--active" : ""}`}
                    onClick={() => setFilterMatch(v)}
                    id={`att-filter-${v}`}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={loadLogs}
                className="att-btn att-btn--ghost att-btn--sm"
                id="att-refresh-logs"
              >
                <RefreshCw size={12} />
                Refresh
              </button>
            </div>

            {/* Table */}
            <div className="att-table-wrap">
              {logsLoading ? (
                <div className="att-empty">
                  <RefreshCw size={20} className="att-spin text-white/30" />
                  <p>Loading records…</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="att-empty">
                  <Fingerprint size={32} className="text-white/20" />
                  <p className="text-white/40 text-sm">No attendance records yet.</p>
                  <p className="text-white/25 text-xs">
                    Configure your scanner and click <strong>Sync Now</strong>.
                  </p>
                </div>
              ) : (
                <table className="att-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Member</th>
                      <th>Scanner ID</th>
                      <th>Type</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="att-table__row">
                        <td className="att-table__time">
                          <span className="att-table__date">{fmtDate(log.scanned_at).split(",").slice(0, 2).join(",")}</span>
                          <span className="att-table__clock">{fmtTime(log.scanned_at)}</span>
                        </td>
                        <td>
                          {log.matched && log.customers ? (
                            <div className="att-member-cell">
                              <div className="att-member-avatar">
                                {(log.customers.first_name?.[0] ?? "?").toUpperCase()}
                              </div>
                              <div>
                                <p className="att-member-name">
                                  {log.customers.first_name} {log.customers.last_name}
                                </p>
                                <p className="att-member-phone">{log.customers.phone}</p>
                              </div>
                            </div>
                          ) : (
                            <span className="text-white/30 text-xs italic">Unrecognized</span>
                          )}
                        </td>
                        <td>
                          <code className="att-uid">{log.device_user_id}</code>
                        </td>
                        <td>
                          <span className={`att-punch-type att-punch-type--${log.punch_type}`}>
                            {log.punch_type === "check_in" ? "In" : log.punch_type === "check_out" ? "Out" : "?"}
                          </span>
                        </td>
                        <td>
                          {log.matched ? (
                            <span className="att-matched">
                              <CheckCircle2 size={13} /> Matched
                            </span>
                          ) : (
                            <span className="att-unmatched">
                              <AlertTriangle size={13} /> Unknown
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {/* ── SETTINGS TAB ─────────────────────────────────────────────────── */}
        {activeTab === "settings" && (
          <section className="space-y-6">
            <form onSubmit={saveSettings} className="att-settings-card space-y-6" id="att-settings-form">

              {/* Enable Scanner Integration — always visible */}
              <div className="att-settings-row">
                <div>
                  <label className="att-label">Enable Scanner Integration</label>
                  <p className="att-hint">Turn on to reveal setup options and enable background sync.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, enabled: !s.enabled }))}
                  className="att-toggle-btn"
                  id="att-toggle-enabled"
                  aria-pressed={settings.enabled}
                >
                  {settings.enabled
                    ? <ToggleRight size={32} className="text-emerald-400" />
                    : <ToggleLeft size={32} className="text-white/30" />}
                </button>
              </div>

              {/* Setup form — revealed only when integration is enabled */}
              {settings.enabled && (
                <>
                  <div className="att-divider" />

                  {/* Brand (locked to ZKTeco for now) */}
                  <div className="att-settings-row">
                    <div>
                      <label className="att-label">Scanner Brand</label>
                      <p className="att-hint">Only ZKTeco is supported in this version.</p>
                    </div>
                    <div className="att-brand-badge">
                      <Fingerprint size={16} />
                      ZKTeco
                    </div>
                  </div>

                  {/* IP + Port */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label htmlFor="att-ip" className="att-label">IP Address</label>
                      <input
                        id="att-ip"
                        type="text"
                        placeholder="192.168.1.100"
                        value={settings.ip_address}
                        onChange={(e) => setSettings((s) => ({ ...s, ip_address: e.target.value }))}
                        className="att-input"
                        required
                        pattern="^\d{1,3}(\.\d{1,3}){3}$"
                        title="Enter a valid IPv4 address"
                      />
                      <p className="att-hint">Local network IP of your ZKTeco device.</p>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="att-port" className="att-label">Port</label>
                      <input
                        id="att-port"
                        type="number"
                        min={1}
                        max={65535}
                        value={settings.port}
                        onChange={(e) => setSettings((s) => ({ ...s, port: Number(e.target.value) }))}
                        className="att-input"
                        required
                      />
                      <p className="att-hint">Default ZKTeco port is 4370.</p>
                    </div>
                  </div>

                  {/* Sync Interval */}
                  <div className="space-y-1.5">
                    <label htmlFor="att-interval" className="att-label">Auto-Sync Interval</label>
                    <div className="flex items-center gap-3">
                      <select
                        id="att-interval"
                        value={settings.sync_interval_minutes}
                        onChange={(e) => setSettings((s) => ({ ...s, sync_interval_minutes: Number(e.target.value) }))}
                        className="att-select"
                      >
                        <option value={5}>Every 5 mins</option>
                        <option value={15}>Every 15 mins</option>
                        <option value={30}>Every 30 mins</option>
                        <option value={60}>Every hour</option>
                      </select>
                    </div>
                    <p className="att-hint">How often the app polls the scanner in the background.</p>
                  </div>

                  {/* Test connection */}
                  <div className="att-settings-row att-test-connection">
                    <div>
                      <label className="att-label">Test Connection</label>
                      <p className="att-hint">Verify the scanner is reachable on your network.</p>
                    </div>
                    <button
                      type="button"
                      onClick={checkConnection}
                      disabled={checkingConnection || !settings.ip_address}
                      className="att-btn att-btn--ghost"
                      id="att-test-connection"
                    >
                      {checkingConnection ? (
                        <RefreshCw size={14} className="att-spin" />
                      ) : connected ? (
                        <Wifi size={14} className="text-emerald-400" />
                      ) : (
                        <WifiOff size={14} />
                      )}
                      {checkingConnection ? "Testing…" : connected ? "Connected" : "Test"}
                    </button>
                  </div>
                </>
              )}

              {settingsError && (
                <div className="att-feedback att-feedback--err">
                  <XCircle size={14} />
                  <span>{settingsError}</span>
                </div>
              )}

              {/* Save */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="att-btn att-btn--primary att-btn--save"
                  id="att-save-settings"
                >
                  {settingsSaved ? (
                    <>
                      <CheckCircle2 size={14} className="text-emerald-400" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save size={14} />
                      {savingSettings ? "Saving…" : "Save Settings"}
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Info box */}
            <div className="att-info-box">
              <div className="att-info-box__icon"><ChevronRight size={14} /></div>
              <div className="space-y-1 text-xs text-white/45">
                <p className="font-medium text-white/60">How matching works</p>
                <p>Go to the <strong className="text-white/60">Member Mapping</strong> tab to link device UIDs to members. Once linked, all future and historical scans are attributed automatically.</p>
              </div>
            </div>
          </section>
        )}

        {/* ── MAPPING TAB ──────────────────────────────────────────────────── */}
        {activeTab === "mapping" && (
          <section className="space-y-6">

            {/* Unmatched device IDs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs tracking-[0.2em] font-mono text-white/40 uppercase">Unmapped Device IDs</p>
                  <p className="text-xs text-white/30 mt-0.5">Link each scanner ID to a member. Historical records will be updated automatically.</p>
                </div>
                <button type="button" onClick={() => { loadUnmatched(); loadExistingMaps(); }} className="att-btn att-btn--ghost att-btn--sm">
                  <RefreshCw size={12} /> Refresh
                </button>
              </div>

              {mappingLoading ? (
                <div className="att-empty"><RefreshCw size={20} className="att-spin text-white/30" /><p>Loading…</p></div>
              ) : unmatchedIds.length === 0 ? (
                <div className="att-empty">
                  <UserCheck size={32} className="text-emerald-500/40" />
                  <p className="text-white/40 text-sm">All scanned device IDs are mapped.</p>
                  <p className="text-white/25 text-xs">Run a sync to discover new unmatched IDs.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {unmatchedIds.map(({ device_user_id, scan_count, last_seen }) => {
                    const row = getRow(device_user_id);
                    const filtered = filteredCustomers(device_user_id);
                    return (
                      <div key={device_user_id} className="att-map-row">
                        {/* Device UID */}
                        <div className="att-map-row__uid">
                          <code className="att-uid att-uid--lg">{device_user_id}</code>
                          <p className="att-map-row__meta">{scan_count} scan{scan_count !== 1 ? "s" : ""} &middot; Last {fmtDate(last_seen).split(",").slice(0, 2).join(",")}</p>
                        </div>

                        {/* Customer picker */}
                        <div className="att-map-row__picker">
                          {row.selected ? (
                            <div className="att-selected-customer">
                              <div className="att-member-avatar att-member-avatar--sm">{(row.selected.first_name?.[0] ?? "?").toUpperCase()}</div>
                              <div className="flex-1 min-w-0">
                                <p className="att-member-name truncate">{row.selected.first_name} {row.selected.last_name}</p>
                                <p className="att-member-phone">{row.selected.phone}</p>
                              </div>
                              <button type="button" onClick={() => setRow(device_user_id, { selected: null, search: "", open: false })} className="att-clear-btn"><XCircle size={13} /></button>
                            </div>
                          ) : (
                            <div className="att-search-wrap">
                              <div className="att-search-inner">
                                <Search size={13} className="att-search-icon" />
                                <input
                                  type="text"
                                  placeholder="Search by name or phone…"
                                  value={row.search}
                                  onChange={(e) => setRow(device_user_id, { search: e.target.value, open: true })}
                                  onFocus={() => setRow(device_user_id, { open: true })}
                                  onBlur={() => setTimeout(() => setRow(device_user_id, { open: false }), 150)}
                                  className="att-search-input"
                                  id={`att-search-${device_user_id}`}
                                />
                              </div>
                              {row.open && filtered.length > 0 && (
                                <div className="att-dropdown">
                                  {filtered.map((c) => (
                                    <button
                                      key={c.id}
                                      type="button"
                                      onMouseDown={() => setRow(device_user_id, { selected: c, search: "", open: false })}
                                      className="att-dropdown__item"
                                    >
                                      <div className="att-member-avatar att-member-avatar--sm">{(c.first_name?.[0] ?? "?").toUpperCase()}</div>
                                      <div>
                                        <p className="text-xs text-white font-medium">{c.first_name} {c.last_name}</p>
                                        <p className="text-[10px] text-white/40">{c.phone}</p>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Link button */}
                        <button
                          type="button"
                          onClick={() => enrollMember(device_user_id)}
                          disabled={!row.selected || row.saving}
                          className="att-btn att-btn--primary att-btn--sm flex-shrink-0"
                          id={`att-link-${device_user_id}`}
                        >
                          {row.saving ? <RefreshCw size={12} className="att-spin" /> : <Link size={12} />}
                          {row.saving ? "Linking…" : "Link"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Existing mappings */}
            {existingMaps.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs tracking-[0.2em] font-mono text-white/40 uppercase">{existingMaps.length} Active Mapping{existingMaps.length !== 1 ? "s" : ""}</p>
                <div className="att-table-wrap">
                  <table className="att-table">
                    <thead><tr><th>Device UID</th><th>Member</th><th>Enrolled</th><th></th></tr></thead>
                    <tbody>
                      {existingMaps.map((m) => (
                        <tr key={m.device_user_id} className="att-table__row">
                          <td><code className="att-uid">{m.device_user_id}</code></td>
                          <td>
                            <div className="att-member-cell">
                              <div className="att-member-avatar">{(m.customers?.first_name?.[0] ?? "?").toUpperCase()}</div>
                              <div>
                                <p className="att-member-name">{m.customers?.first_name} {m.customers?.last_name}</p>
                                <p className="att-member-phone">{m.customers?.phone}</p>
                              </div>
                            </div>
                          </td>
                          <td className="text-white/35 text-xs">{fmtDate(m.created_at).split(",").slice(0, 2).join(",")}</td>
                          <td>
                            <button type="button" onClick={() => unenrollMember(m.device_user_id)} className="att-btn att-btn--ghost att-btn--sm" id={`att-unlink-${m.device_user_id}`}>
                              <Unlink size={11} /> Unlink
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default AttendancePage;
