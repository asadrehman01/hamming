import React, { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import { KeyRound, LogOut, Menu, Settings } from "lucide-react";
import ChangeAdminPasswordModal from "./ChangeAdminPasswordModal";
import { supabase } from "../lib/supabaseClient";
import { clearAccessMode } from "../lib/accessControl";

const Layout = () => {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const settingsMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        settingsMenuRef.current &&
        !settingsMenuRef.current.contains(event.target)
      ) {
        setShowSettingsMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

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
      setShowSettingsMenu(false);
      navigate("/login");
    }
  };

  return (
    <div className="h-[100dvh] flex flex-col lg:flex-row font-body overflow-hidden bg-[#0B0E14] text-white selection:bg-emerald-500/20">
      {/* Mobile Top Bar */}
      <header className="lg:hidden relative flex-shrink-0 flex items-center justify-between p-4 z-30 bg-[#0F1115] border-b border-white/5">
        <h1 className="font-logo font-bold text-xl tracking-tighter normal-case text-white">
          Hamming
        </h1>
        <div className="flex items-center gap-1.5" ref={settingsMenuRef}>
          <button
            type="button"
            aria-label="Open settings"
            aria-expanded={showSettingsMenu}
            onClick={() => setShowSettingsMenu((prev) => !prev)}
            className="p-2 transition-colors text-white/40 hover:text-white"
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

          {showSettingsMenu && (
            <div className="absolute top-full right-4 mt-2 w-44 bg-[#12151D] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-40">
              <button
                type="button"
                onClick={() => {
                  setShowPasswordModal(true);
                  setShowSettingsMenu(false);
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left text-[11px] tracking-[0.08em] text-[#C9CFDB] hover:bg-white/5"
              >
                <KeyRound size={14} />
                <span>Change Password</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left text-[11px] tracking-[0.08em] text-red-300/90 hover:bg-red-500/10"
              >
                <LogOut size={14} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative max-w-full">
        <Outlet />
      </main>

      <ChangeAdminPasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />
    </div>
  );
};

export default Layout;
