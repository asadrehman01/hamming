import { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";
import Layout from "./components/Layout";
import AppErrorBoundary from "./components/AppErrorBoundary";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import MembershipPage from "./pages/MembershipPage";
import CustomersPage from "./pages/CustomersPage";
import TrainersPage from "./pages/TrainersPage";
import RevenuePage from "./pages/RevenuePage";
import TransactionsPage from "./pages/TransactionsPage";
import CommunicationsPage from "./pages/CommunicationsPage";
import IntegrationsPage from "./pages/IntegrationsPage";
import AutoMigrationPage from "./pages/AutoMigrationPage";
import BillingPage from "./pages/BillingPage";
import AttendancePage from "./pages/AttendancePage";
import ScannerMappingPage from "./pages/ScannerMappingPage";
import AdminPage from "./pages/AdminPage";
import AdminClientRevenuePage from "./pages/AdminClientRevenuePage";
import AdminAccessPage from "./pages/AdminAccessPage";
import SignupPage from "./pages/SignupPage";
import ResetAdminPasswordPage from "./pages/ResetAdminPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import { supabase } from "./lib/supabaseClient";
import { isCurrentUserAccessAllowed } from "./lib/appAccess";
import {
  getAccessMode,
  clearAccessMode,
  canAccessPath,
} from "./lib/accessControl";

const RequireAuth = ({ session }) => {
  const location = useLocation();
  if (!session) {
    return location.pathname === "/login" ? null : <Navigate to="/login" replace />;
  }
  return <Outlet />;
};

const RequireModeAccess = () => {
  const location = useLocation();
  const mode = getAccessMode();

  if (!mode) {
    return location.pathname === "/login" ? null : <Navigate to="/login" replace />;
  }

  if (!canAccessPath(mode, location.pathname)) {
    return location.pathname === "/dashboard" ? null : <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const applySessionWithAccessCheck = async (candidateSession) => {
      if (!active) return;

      if (!candidateSession) {
        setSession(null);
        clearAccessMode();
        return;
      }

      let accessAllowed = false;
      let verificationError = null;
      try {
        accessAllowed = await isCurrentUserAccessAllowed();
      } catch (accessError) {
        verificationError = accessError;
        console.error("Failed to verify app access status:", accessError);
      }

      if (!accessAllowed) {
        if (verificationError) {
          return;
        }
        if (supabase) {
          await supabase.auth.signOut();
        }
        if (!active) return;
        clearAccessMode();
        setSession(null);
        return;
      }

      if (!active) return;
      setSession(candidateSession ?? null);
    };

    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, nextSession) => {
        if (event === 'INITIAL_SESSION') {
          await applySessionWithAccessCheck(nextSession ?? null);
          if (active) setAuthLoading(false);
        } else {
          applySessionWithAccessCheck(nextSession ?? null);
        }
      },
    );

    return () => {
      active = false;
      listener?.subscription.unsubscribe();
    };
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0B0E14] text-white flex items-center justify-center text-sm tracking-[0.04em] text-white/40 font-light" style={{ fontFamily: 'DM Sans, sans-serif' }}>
        Loading...
      </div>
    );
  }

  return (
    <AppErrorBoundary>
      <Router>
        <Routes>
          <Route
            path="/login"
            element={
              session && getAccessMode() ? (
                window.location.pathname === "/dashboard" ? null : <Navigate to="/dashboard" replace />
              ) : (
                <LoginPage />
              )
            }
          />
          <Route
            path="/signup"
            element={
              session && getAccessMode() ? (
                window.location.pathname === "/dashboard" ? null : <Navigate to="/dashboard" replace />
              ) : (
                <SignupPage />
              )
            }
          />
          <Route path="/reset-admin-password" element={<ResetAdminPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route element={<RequireAuth session={session} />}>
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/client-revenue" element={<AdminClientRevenuePage />} />
            <Route path="/admin/access" element={<AdminAccessPage />} />
            <Route path="/access" element={<AdminAccessPage />} />
            <Route element={<RequireModeAccess />}>
              <Route element={<Layout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/membership" element={<MembershipPage />} />
                <Route path="/customers" element={<CustomersPage />} />
                <Route path="/trainers" element={<TrainersPage />} />
                <Route path="/revenue" element={<RevenuePage />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route
                  path="/communications"
                  element={<CommunicationsPage />}
                />
                <Route path="/migration" element={<IntegrationsPage />} />
                <Route path="/integrations" element={<Navigate to="/migration" replace />} />
                <Route path="/billing" element={<BillingPage />} />
                <Route path="/attendance" element={<AttendancePage />} />
                <Route path="/scanner-mapping" element={<ScannerMappingPage />} />
                <Route path="/auto-migration" element={<AutoMigrationPage />} />
                <Route
                  path="/onboarding-migration"
                  element={<AutoMigrationPage onboarding />}
                />
              </Route>
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AppErrorBoundary>
  );
}

export default App;
