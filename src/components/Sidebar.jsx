import React from "react";
import PropTypes from "prop-types";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  User,
  Users,
  Mail,
  ShieldCheck,
  PlugZap,
  ReceiptText,
  Settings,
  Fingerprint,
} from "lucide-react";
// Assuming icons are from lucide-react
import {
  ACCESS_MODE,
  getAccessMode,
  RECEPTION_ALLOWED_ROUTES,
} from "../lib/accessControl";

const BugReporterIcon = ({ size = 17, className }) => (
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
    <path d="M12 20v-9" />
    <path d="M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z" />
    <path d="M14.12 3.88 16 2" />
    <path d="M21 21a4 4 0 0 0-3.81-4" />
    <path d="M21 5a4 4 0 0 1-3.55 3.97" />
    <path d="M22 13h-4" />
    <path d="M3 21a4 4 0 0 1 3.81-4" />
    <path d="M3 5a4 4 0 0 0 3.55 3.97" />
    <path d="M6 13H2" />
    <path d="m8 2 1.88 1.88" />
    <path d="M9 7.13V6a3 3 0 1 1 6 0v1.13" />
  </svg>
);

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

const Sidebar = ({ isOpen, onClose, onOpenSettings, onOpenBugReport }) => {
  const navigate = useNavigate();
  const location = useLocation();
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
    { name: "Attendance", icon: Fingerprint, path: "/attendance" },
    { name: "Migration", icon: PlugZap, path: "/migration" },
    { name: "Billing", icon: ReceiptText, path: "/billing" },
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
        className={` fixed inset-y-0 left-0 z-50 w-64 bg-[#0D0F14] border-r border-white/10 flex flex-col h-screen min-h-0 shadow-2xl transition-transform duration-300 ease-in-out text-[#B7BCC6] lg:translate-x-0 lg:static lg:block ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} `}
        style={{ fontFamily: "var(--font-sidebar)" }}
      >
        {" "}
        <div className="p-4 sm:p-8 flex justify-between items-center flex-shrink-0">
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
          <div className="relative flex items-center gap-2">
            <button
              onClick={() => {
                onOpenSettings();
                if (window.innerWidth < 1024) onClose();
              }}
              aria-label="Open settings"
              className="p-2 rounded-lg border border-white/10 bg-[#12151D] text-white/45 hover:text-white transition-colors"
            >
              <Settings size={17} />
            </button>
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
        <nav className="flex-1 min-h-0 px-2 sm:px-3 py-2 sm:py-3 space-y-1.5 overflow-y-auto overflow-x-hidden custom-scrollbar">
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
        </nav>

        <div className="sticky bottom-0 p-2 sm:p-3 border-t border-white/10 bg-[#0D0F14] pb-[max(0.75rem,env(safe-area-inset-bottom))] flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              onOpenBugReport();
              if (window.innerWidth < 1024) onClose();
            }}
            className="w-full flex items-center gap-2 sm:gap-3.5 px-2 sm:px-3.5 py-2 sm:py-3 rounded-xl border border-white/10 text-[#B2B8C5] bg-white/[0.02] hover:text-[#E7EBF3] hover:bg-white/[0.04] transition-colors dm-sans-light-008 text-xs sm:text-[11px]"
          >
            <BugReporterIcon size={16} className="text-white/55 flex-shrink-0" />
            <span className="tracking-[0.08em] text-white/85">Report a Bug</span>
          </button>
        </div>
      </aside>{" "}
    </>
  );
};

Sidebar.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  onOpenSettings: PropTypes.func,
  onOpenBugReport: PropTypes.func,
};

Sidebar.defaultProps = {
  isOpen: false,
  onClose: () => {},
  onOpenSettings: () => {},
  onOpenBugReport: () => {},
};

export default Sidebar;
