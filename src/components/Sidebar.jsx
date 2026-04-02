import React, { useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  User,
  Users,
  Mail,
  ShieldCheck,
  PlugZap,
  Bot,
  Settings,
  Key,
  LogOut,
} from "lucide-react";
// Assuming icons are from lucide-react
import {
  ACCESS_MODE,
  getAccessMode,
  RECEPTION_ALLOWED_ROUTES,
  clearAccessMode,
} from "../lib/accessControl";
import ChangeAdminPasswordModal from "./ChangeAdminPasswordModal";
import { supabase } from "../lib/supabaseClient";

const RevenueCombinedIcon = ({ size = 17, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 16v5" />
    <path d="M16 14v7" />
    <path d="M20 10v11" />
    <path d="m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15" />
    <path d="M4 18v3" />
    <path d="M8 14v7" />
  </svg>
);

const TransactionsLandmarkIcon = ({ size = 17, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M10 18v-7" />
    <path d="M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z" />
    <path d="M14 18v-7" />
    <path d="M18 18v-7" />
    <path d="M3 22h18" />
    <path d="M6 18v-7" />
  </svg>
);

const Sidebar = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const settingsMenuRef = useRef(null);

  React.useEffect(() => {
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
      clearAccessMode();
      navigate("/login");
    } catch (err) {
      console.error("Failed to sign out:", err);
      window.alert(`Sign-out failed: ${err?.message || "Please try again."}`);
    } finally {
      setShowSettingsMenu(false);
      onClose?.();
    }
  };
  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
    { name: "Members", icon: Users, path: "/customers" },
    { name: "Trainers", icon: User, path: "/trainers" },
    { name: "Revenue", icon: RevenueCombinedIcon, path: "/revenue" },
    {
      name: "Transactions",
      icon: TransactionsLandmarkIcon,
      path: "/transactions",
    },
    { name: "Communications", icon: Mail, path: "/communications" },
    { name: "Membership", icon: ShieldCheck, path: "/membership" },
    { name: "Integrations", icon: PlugZap, path: "/integrations" },
    { name: "Auto Migration", icon: Bot, path: "/auto-migration" },
  ];
  const accessMode = getAccessMode();
  const visibleMenuItems =
    accessMode === ACCESS_MODE.RECEPTION
      ? menuItems.filter((item) => RECEPTION_ALLOWED_ROUTES.includes(item.path))
      : menuItems;
  return (
    <>
      {" "}
      {/* Backdrop for mobile */}{" "}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}{" "}
      <aside
        className={` fixed inset-y-0 left-0 z-50 w-64 bg-[#0D0F14] border-r border-white/10 flex flex-col h-screen overflow-y-auto shadow-2xl transition-transform duration-300 ease-in-out text-[#B7BCC6] lg:translate-x-0 lg:static lg:block ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} `}
        style={{ fontFamily: "var(--font-sidebar)" }}
      >
        {" "}
        <div className="p-8 flex justify-between items-center">
          {" "}
          <div>
            {" "}
            <h1 className="font-semibold text-3xl tracking-tight text-white flex items-center gap-2 normal-case">
              {" "}
              Hamming{" "}
            </h1>{" "}
            <p className="text-[9px] tracking-[0.2em] text-[#8B93A5] mt-1 ml-1 font-light">
              3rd Edition
            </p>{" "}
          </div>{" "}
          <div
            className="relative flex items-center gap-2"
            ref={settingsMenuRef}
          >
            <button
              onClick={() => setShowSettingsMenu((prev) => !prev)}
              className="sidebar-settings-trigger p-2 text-white/40 hover:text-white transition-colors"
              aria-label="Open settings"
              aria-expanded={showSettingsMenu}
            >
              <Settings size={18} />
            </button>

            {showSettingsMenu && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-[#151921] border border-white/10 rounded-xl py-1.5 shadow-2xl z-50">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(true);
                    setShowSettingsMenu(false);
                  }}
                  className="native-inline-btn w-full text-left px-4 py-2.5 text-[10px] tracking-[0.12em] text-[#C7CEDB] flex items-center gap-2"
                >
                  <Key size={13} />
                  Change Password
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="native-inline-btn w-full text-left px-4 py-2.5 text-[10px] tracking-[0.12em] text-red-400 flex items-center gap-2"
                >
                  <LogOut size={13} />
                  Logout
                </button>
              </div>
            )}

            {/* Close button for mobile */}
            <button
              onClick={onClose}
              aria-label="Close sidebar"
              className="lg:hidden p-2 text-white/40 hover:text-white transition-colors"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>{" "}
        <nav className="flex-1 px-3 py-3 space-y-1.5">
          {" "}
          {visibleMenuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.name}
                onClick={() => {
                  navigate(item.path);
                  if (window.innerWidth < 1024) onClose();
                }}
                className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl border transition-all duration-200 group ${isActive ? "bg-white/[0.04] text-[#E7EBF3] border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]" : "text-[#B2B8C5] border-transparent hover:text-[#E7EBF3] hover:bg-white/[0.03] hover:border-white/10"}`}
              >
                {" "}
                <item.icon
                  size={17}
                  className={`transition-colors ${isActive ? "text-white" : "text-white/45 group-hover:text-white/80"}`}
                />{" "}
                <span
                  className={`text-[14px] font-light tracking-[0.01em] transition-all ${isActive ? "translate-x-0.5" : ""}`}
                >
                  {" "}
                  {item.name}{" "}
                </span>{" "}
                {isActive && (
                  <div className="ml-auto w-1 h-4 bg-white/70 rounded-full" />
                )}{" "}
              </button>
            );
          })}{" "}
        </nav>{" "}
        <ChangeAdminPasswordModal
          isOpen={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
        />{" "}
      </aside>{" "}
    </>
  );
};
export default Sidebar;
