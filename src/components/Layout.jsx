import React, { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import { KeyRound, LogOut, Menu, Settings, X } from "lucide-react";
import ChangeAdminPasswordModal from "./ChangeAdminPasswordModal";
import ChangeAccountPasswordModal from "./ChangeAccountPasswordModal";
import BugReportModal from "./BugReportModal";
import { supabase } from "../lib/supabaseClient";
import { getUserWithRetry } from "../lib/authUser";
import { ACCESS_MODE, clearAccessMode, getAccessMode } from "../lib/accessControl";
import { isMigrationOnboardingCompleted } from "../lib/migrationOnboarding";
import OnboardingProgressBar from "./OnboardingProgressBar";

const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(false);
  const [showAccountPasswordModal, setShowAccountPasswordModal] = useState(false);
  const [showBugReportModal, setShowBugReportModal] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [billingStepComplete, setBillingStepComplete] = useState(false);
  const [migrationStepComplete, setMigrationStepComplete] = useState(false);
  const [userLoaded, setUserLoaded] = useState(false);
  const mobileSettingsTriggerRef = useRef(null);
  const mobileSettingsPanelRef = useRef(null);
  const accessMode = getAccessMode();
  const isAdminMode = accessMode === ACCESS_MODE.ADMIN;

  useEffect(() => {
    let isMounted = true;
    const checkOnboarding = async () => {
      if (!supabase) {
        if (isMounted) {
          setUserLoaded(true);
        }
        return;
      }

      const {
        data: { user },
      } = await getUserWithRetry(supabase);
      if (!isMounted) return;
      setAccountEmail(user?.email || "");
      if (!user) {
        setBillingStepComplete(false);
        setMigrationStepComplete(false);
        setUserLoaded(true);
        return;
      }

      const { data: billing } = await supabase
        .from("billing_settings")
        .select("gym_display_name, contact_email, contact_phone, address_line1, receipt_enabled")
        .eq("gym_id", user.id)
        .maybeSingle();

      const billingSettingsDone = Boolean(
        billing?.gym_display_name &&
          billing?.address_line1 &&
          (billing?.contact_email || billing?.contact_phone)
      );

      const migrationDone = isMigrationOnboardingCompleted(user);

      setBillingStepComplete(billingSettingsDone);
      setMigrationStepComplete(migrationDone);
      setUserLoaded(true);
    };

    checkOnboarding();

    const { data: listener } = supabase?.auth.onAuthStateChange(
      (_event, _session) => {
        checkOnboarding();
      }
    ) ?? { data: { subscription: { unsubscribe: () => {} } } };

    const handleRefresh = (event) => {
      const detail = event?.detail || {};
      const hasBillingFlag = typeof detail.billingStepComplete === "boolean";
      const hasMigrationFlag = typeof detail.migrationStepComplete === "boolean";

      if (hasBillingFlag) {
        setBillingStepComplete(detail.billingStepComplete);
      }

      if (hasMigrationFlag) {
        setMigrationStepComplete(detail.migrationStepComplete);
      }

      if (hasBillingFlag || hasMigrationFlag) {
        return;
      }
      checkOnboarding();
    };

    window.addEventListener("onboarding:refresh", handleRefresh);

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
      window.removeEventListener("onboarding:refresh", handleRefresh);
    };
  }, []);

  useEffect(() => {
    if (!userLoaded) return;

    if (!billingStepComplete) {
      if (location.pathname !== "/billing") {
        navigate("/billing", { replace: true });
      }
      return;
    }

    if (!migrationStepComplete) {
      if (location.pathname !== "/onboarding-migration") {
        navigate("/onboarding-migration", { replace: true });
      }
    }
  }, [billingStepComplete, migrationStepComplete, location.pathname, navigate, userLoaded]);

  useEffect(() => {
    if (!showSettingsPanel) return;

    const handleClickOutside = (event) => {
      const insideMobilePanel = mobileSettingsPanelRef.current?.contains(event.target);
      const insideMobileTrigger =
        mobileSettingsTriggerRef.current?.contains(event.target);

      if (!insideMobilePanel && !insideMobileTrigger) {
        setShowSettingsPanel(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSettingsPanel]);

  useEffect(() => {
    if (!isAdminMode && showAdminPasswordModal) {
      setShowAdminPasswordModal(false);
    }
  }, [isAdminMode, showAdminPasswordModal]);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (err) {
      console.error("Failed to sign out:", err);
      window.alert(
        `Failed to sign out: ${err?.message || "Please try again."}`,
      );
    } finally {
      clearAccessMode();
      setShowSettingsPanel(false);
      navigate("/login");
    }
  };

  if (!userLoaded) {
    return null;
  }

  return (
    <div className="h-[100dvh] flex flex-col lg:flex-row font-body overflow-hidden bg-[#0B0E14] text-white selection:bg-emerald-500/20">
      {/* Mobile Top Bar */}
      <header className="lg:hidden relative flex-shrink-0 flex items-center justify-between p-4 z-30 bg-[#0F1115] border-b border-white/5">
        <h1 className="font-logo font-bold text-xl tracking-tighter normal-case text-white">
          Hamming
        </h1>
        <div className="flex items-center gap-1.5">
          <button
            ref={mobileSettingsTriggerRef}
            type="button"
            aria-label="Open settings"
            aria-haspopup="dialog"
            onClick={() => setShowSettingsPanel(true)}
            className="sidebar-settings-trigger p-2 rounded-lg border border-white/10 bg-[#12151D] transition-colors text-white/45 hover:text-white"
          >
            <Settings size={22} />
          </button>
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={isSidebarOpen}
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 transition-colors text-white/40 hover:text-white"
          >
            <Menu size={24} />
          </button>
        </div>
      </header>

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onOpenSettings={() => setShowSettingsPanel(true)}
        onOpenBugReport={() => setShowBugReportModal(true)}
      />

      <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative max-w-full">
        <Outlet />
        {(!billingStepComplete || !migrationStepComplete) && (
          <OnboardingProgressBar
            billingStepComplete={billingStepComplete}
            migrationStepComplete={migrationStepComplete}
          />
        )}
      </main>

      {showSettingsPanel && (
        <>
          {/* Mobile backdrop */}
          <div className="lg:hidden fixed inset-0 bg-black/35 z-[60]" onClick={() => setShowSettingsPanel(false)} role="presentation" />
          
          {/* Settings panel - mobile AND desktop */}
          <div
            ref={mobileSettingsPanelRef}
            className="fixed z-[61] lg:z-40 dm-sans-light-008 bg-[#151921] border border-white/10 rounded-xl shadow-2xl p-2 w-[250px] lg:w-[268px] lg:top-4 lg:left-[calc(16rem+1rem)] lg:right-auto top-[56px] right-3"
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
          >
            <div className="flex items-center justify-between mb-1.5 px-1">
              <h2 className="text-[11px] text-white/85">Settings</h2>
              <button
                type="button"
                onClick={() => setShowSettingsPanel(false)}
                className="sidebar-settings-trigger p-1 text-white/45 hover:text-white"
                aria-label="Close settings"
              >
                <X size={13} />
              </button>
            </div>

            <div className="space-y-1.5">
              {isAdminMode && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminPasswordModal(true);
                    setShowSettingsPanel(false);
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] text-white/85 transition-colors flex items-center gap-2"
                >
                  <KeyRound size={13} className="text-white/70" />
                  <span className="text-[10px]">Change Admin Password</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setShowAccountPasswordModal(true);
                  setShowSettingsPanel(false);
                }}
                className="w-full text-left px-2.5 py-2 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] text-white/85 transition-colors flex items-center gap-2"
              >
                <KeyRound size={13} className="text-white/70" />
                <span className="text-[10px]">Change Password ({accountEmail || "No account email"})</span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full text-left px-2.5 py-2 rounded-lg border border-red-300/15 bg-red-400/[0.04] hover:bg-red-400/[0.08] text-red-300/90 transition-colors flex items-center gap-2"
              >
                <LogOut size={13} />
                <span className="text-[10px]">Logout</span>
              </button>
            </div>
          </div>
        </>
      )}

      {isAdminMode && (
        <ChangeAdminPasswordModal
          isOpen={showAdminPasswordModal}
          onClose={() => setShowAdminPasswordModal(false)}
        />
      )}

      <ChangeAccountPasswordModal
        isOpen={showAccountPasswordModal}
        onClose={() => setShowAccountPasswordModal(false)}
        email={accountEmail}
      />

      <BugReportModal
        isOpen={showBugReportModal}
        onClose={() => setShowBugReportModal(false)}
        accountEmail={accountEmail}
      />
    </div>
  );
};

export default Layout;

