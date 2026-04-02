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
import SignupPage from "./pages/SignupPage";
import DashboardPage from "./pages/DashboardPage";
import MembershipPage from "./pages/MembershipPage";
import CustomersPage from "./pages/CustomersPage";
import TrainersPage from "./pages/TrainersPage";
import RevenuePage from "./pages/RevenuePage";
import TransactionsPage from "./pages/TransactionsPage";
import CommunicationsPage from "./pages/CommunicationsPage";
import IntegrationsPage from "./pages/IntegrationsPage";
import AutoMigrationPage from "./pages/AutoMigrationPage";
import { supabase } from "./lib/supabaseClient";
import {
  getAccessMode,
  clearAccessMode,
  canAccessPath,
} from "./lib/accessControl";

const RequireAuth = ({ session }) => {
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
};

const RequireModeAccess = () => {
  const location = useLocation();
  const mode = getAccessMode();

  if (!mode) {
    return <Navigate to="/login" replace />;
  }

  if (!canAccessPath(mode, location.pathname)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const bootstrapSession = async () => {
      if (!supabase) {
        setAuthLoading(false);
        return;
      }

      try {
        const { data } = await supabase.auth.getSession();
        if (active) {
          setSession(data.session ?? null);
          setAuthLoading(false);
        }
      } catch (error) {
        console.error("Failed to bootstrap session:", error);
        if (active) {
          setSession(null);
          setAuthLoading(false);
        }
      }
    };

    bootstrapSession();

    const { data: listener } = supabase?.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession ?? null);
        if (!nextSession) {
          clearAccessMode();
        }
      },
    ) ?? { data: { subscription: { unsubscribe: () => {} } } };

    return () => {
      active = false;
      listener.subscription.unsubscribe();
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
                <Navigate to="/dashboard" replace />
              ) : (
                <LoginPage />
              )
            }
          />
          <Route path="/signup" element={<SignupPage />} />

          <Route element={<RequireAuth session={session} />}>
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
                <Route path="/integrations" element={<IntegrationsPage />} />
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
