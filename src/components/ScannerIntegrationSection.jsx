import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { postBackendApi } from "../lib/backendApi";

const ScannerIntegrationSection = () => {
  const [enabled, setEnabled] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [settings, setSettings] = useState({
    ip_address: "",
    port: 4370,
    sync_interval_minutes: 15,
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState(null); // 'success', 'error', null
  const [testError, setTestError] = useState("");
  const [testing, setTesting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [showConfirmDisable, setShowConfirmDisable] = useState(false);
  const [session, setSession] = useState(null);
  
  // Need test success at least once to save
  const [hasTestedSuccessfully, setHasTestedSuccessfully] = useState(false);

  useEffect(() => {
    let active = true;
    const loadSettings = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!currentSession) return;
        setSession(currentSession);
        
        const baseUrl = String(import.meta.env.VITE_BACKEND_API_BASE_URL || "").replace(/\/+$/, "");
        let data;
        
        try {
          if (baseUrl) {
            const res = await fetch(`${baseUrl}/api/scanner/settings`, {
              headers: { Authorization: `Bearer ${currentSession.access_token}` }
            });
            if (res.ok) {
              data = await res.json();
            }
          }
          if (!data) {
            const { data: fallbackData } = await supabase.from("scanner_settings").select("*").maybeSingle();
            data = fallbackData;
          }
        } catch (e) {
          console.error("Failed fetching settings", e);
        }

        if (!active) return;

        if (data && data.enabled) {
          setEnabled(true);
          setExpanded(true);
          setSettings({
            ip_address: data.ip_address || "",
            port: data.port || 4370,
            sync_interval_minutes: data.sync_interval_minutes || 15,
          });
          setLastSynced(data.last_sync_time);
          // Users must re-test when loading even if already enabled
          setHasTestedSuccessfully(false);
        } else {
          setEnabled(false);
          setExpanded(false);
        }
      } catch (err) {
        console.error("Error loading scanner settings:", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadSettings();
    return () => { active = false; };
  }, []);

  const handleToggle = () => {
    if (enabled) {
      setShowConfirmDisable(true);
    } else {
      setEnabled(true);
      setExpanded(true);
    }
  };

  const confirmDisable = async () => {
    setShowConfirmDisable(false);
    setEnabled(false);
    setExpanded(false);
    
    try {
      await postBackendApi("/api/scanner/settings", { enabled: false });
    } catch (err) {
      console.error("Failed to disable scanner settings:", err);
    }
  };

  const cancelDisable = () => {
    setShowConfirmDisable(false);
  };

  const handleTestConnection = async () => {
    if (!settings.ip_address.trim()) {
      setTestError("Please enter an IP address.");
      setTestStatus("error");
      return;
    }
    setTestError("");
    setTesting(true);
    setTestStatus(null);
    try {
      await postBackendApi("/api/scanner/test-connection", {
        ip: settings.ip_address,
        port: Number(settings.port)
      });
      setTestStatus("success");
      setHasTestedSuccessfully(true);
    } catch (err) {
      setTestStatus("error");
      setTestError(err.message || "Unreachable");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await postBackendApi("/api/scanner/settings", {
        enabled: true,
        ip_address: settings.ip_address,
        port: Number(settings.port),
        sync_interval_minutes: Number(settings.sync_interval_minutes)
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save scanner settings", err);
    } finally {
      setSaving(false);
    }
  };

  const handleSyncNow = async () => {
    if (!session?.user?.id) {
      alert("Please sign in to sync attendance.");
      return;
    }
    setSyncing(true);
    try {
      await postBackendApi("/api/scanner/sync-now", {});
      const now = new Date().toISOString();
      setLastSynced(now);
      
      // Update DB directly for UI consistency
      await supabase.from("scanner_settings").update({ last_sync_time: now }).eq("user_id", session.user.id);
    } catch (err) {
      console.error("Failed to sync now:", err);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#151921] mt-4 flex flex-col overflow-hidden transition-all duration-300">
      
      {/* Toggle Header Row */}
      <div className="flex items-center justify-between px-5 py-4 md:px-7 md:py-5 bg-black/10">
        <div>
          <h3 className="text-[13px] md:text-sm font-medium text-white tracking-wide">Scanner Integration</h3>
          <p className="text-[10px] text-white/60 dm-sans-light-008 mt-0.5">
            Sync attendance automatically from ZKTeco biometric devices.
          </p>
        </div>
        
        <button
          type="button"
          onClick={handleToggle}
          aria-pressed={enabled}
          className={`px-3 py-1.5 rounded-lg border text-[10px] uppercase tracking-[0.12em] transition-colors ${
            enabled
              ? "border-emerald-300/20 bg-emerald-500/[0.08] text-emerald-200/90"
              : "border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]"
          }`}
        >
          {enabled ? "Enabled" : "Disabled"}
        </button>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDisable && (
        <div className="px-5 py-4 md:px-7 bg-red-500/[0.05] border-t border-red-500/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <p className="text-[11px] text-red-200 dm-sans-light-008">
            Disabling scanner integration will stop attendance syncing. Are you sure?
          </p>
          <div className="flex items-center gap-3">
            <button onClick={cancelDisable} className="text-[11px] text-white/80 hover:text-white px-2 py-1">Cancel</button>
            <button onClick={confirmDisable} className="text-[11px] bg-red-500/20 text-red-300 hover:bg-red-500/30 px-3 py-1.5 rounded-md transition-colors">Disable</button>
          </div>
        </div>
      )}

      {/* Expandable Fields */}
      <div 
        className="transition-all duration-300 ease-in-out"
        style={{ 
          maxHeight: expanded && !showConfirmDisable ? "800px" : "0",
          opacity: expanded && !showConfirmDisable ? 1 : 0
        }}
      >
        <div className="p-5 md:p-7 border-t border-white/5 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="space-y-3">
              <label htmlFor="scanner-brand" className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/70">Scanner Brand</label>
              <select id="scanner-brand" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 focus:outline-none focus:border-white/25 appearance-none" disabled>
                <option>ZKTeco</option>
              </select>
            </div>

            <div className="space-y-3">
              <label htmlFor="scanner-ip" className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/70">Scanner IP Address</label>
              <input
                id="scanner-ip"
                type="text"
                value={settings.ip_address}
                onChange={(e) => {
                  setSettings(s => ({ ...s, ip_address: e.target.value }));
                  setTestStatus(null);
                  setHasTestedSuccessfully(false);
                }}
                className={`w-full rounded-xl border ${testStatus === 'error' && !settings.ip_address ? 'border-red-500/50' : 'border-white/10'} bg-black/20 px-3 py-2.5 text-[11px] text-white/90 placeholder:text-white/50 focus:outline-none focus:border-white/25`}
                placeholder="192.168.1.100"
              />
              {testStatus === 'error' && !settings.ip_address && (
                <p className="text-[10px] text-red-400 dm-sans-light-008">Please enter an IP address.</p>
              )}
            </div>

            <div className="space-y-3">
              <label htmlFor="scanner-port" className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/70">Port</label>
              <input
                id="scanner-port"
                type="number"
                value={settings.port}
                onChange={(e) => {
                  setSettings(s => ({ ...s, port: e.target.value }));
                  setTestStatus(null);
                  setHasTestedSuccessfully(false);
                }}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 focus:outline-none focus:border-white/25"
              />
            </div>

            <div className="space-y-3">
              <label htmlFor="sync-interval" className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/70">Sync Interval</label>
              <select 
                id="sync-interval"
                value={settings.sync_interval_minutes}
                onChange={(e) => {
                  setSettings(s => ({ ...s, sync_interval_minutes: Number(e.target.value) }));
                  setHasTestedSuccessfully(false);
                }}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 focus:outline-none focus:border-white/25"
              >
                <option value={5}>Every 5 mins</option>
                <option value={15}>Every 15 mins</option>
                <option value={30}>Every 30 mins</option>
                <option value={60}>Every hour</option>
              </select>
            </div>
            
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-4 pt-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="rounded-lg border border-white/15 bg-white/[0.05] hover:bg-white/[0.1] px-4 py-2 text-[11px] text-white/90 transition-colors disabled:opacity-50"
              >
                {testing ? "Testing..." : "Test Connection"}
              </button>
              
              {testStatus === 'success' && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true"></div>
                  Connected
                </div>
              )}
              {testStatus === 'error' && settings.ip_address && (
                <div className="flex items-center gap-1.5 text-[11px] text-red-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500" aria-hidden="true"></div>
                  {testError || "Unreachable"}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 md:ml-auto">
              {saveSuccess && (
                <span className="text-[11px] text-emerald-400 dm-sans-light-008">Scanner settings saved.</span>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !hasTestedSuccessfully}
                className="rounded-lg border border-indigo-500/30 bg-indigo-500/20 hover:bg-indigo-500/30 px-5 py-2 text-[11px] text-indigo-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
          
          {/* Status Bar */}
          <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
            <p className="text-[10px] text-white/70 dm-sans-light-008">
              Last synced: {lastSynced ? new Date(lastSynced).toLocaleString() : "Never"}
            </p>
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing || !session?.user?.id}
              className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
            >
              {syncing && (
                <svg className="animate-spin h-3 w-3 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {syncing ? "Syncing..." : "Sync now"}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};


export default ScannerIntegrationSection;
