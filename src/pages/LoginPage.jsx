import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { getUserWithRetry } from "../lib/authUser";
import { Link, useNavigate } from "react-router-dom";
import { LoaderCircle, X } from "lucide-react";
import {
  ACCESS_MODE,
  setAccessMode,
  hasAdminPassword,
  setAdminPassword,
  verifyAdminPassword,
} from "../lib/accessControl";
import { postPublicApi } from "../lib/publicApi";
import { withTransientRetry } from "../lib/transientRequest";

const RESET_SUCCESS_MESSAGE =
  "If this email is registered, a reset link has been sent. Check your inbox.";
const RESET_ERROR_MESSAGE = "Something went wrong. Please try again.";

const ForgotPasswordModal = ({
  isOpen,
  onClose,
  defaultEmail = "",
  onSubmit,
  title = "Reset Password",
  description = "Enter the account email address",
}) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setEmail(defaultEmail || "");
    setLoading(false);
    setError(null);
    setSuccess(false);
  }, [defaultEmail, isOpen]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const trimmedEmail = String(email || "").trim();
    if (!trimmedEmail) {
      setError(RESET_ERROR_MESSAGE);
      return;
    }

    setLoading(true);
    try {
      await onSubmit(trimmedEmail);
      setSuccess(true);
    } catch {
      setError(RESET_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[#0A0A0A]">
              {title}
            </h2>
            <p className="mt-1 text-[10px] tracking-widest text-[#6B6360]">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#6B6360] transition-colors hover:text-[#0A0A0A]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div className="mt-6 rounded-2xl border border-black/10 bg-[#eef1f4] p-4">
            <p className="text-[12px] leading-relaxed tracking-wide text-[#0A0A0A]">
              {RESET_SUCCESS_MESSAGE}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3">
                <p className="text-[11px] tracking-wide text-red-600">{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="forgot-password-email" className="text-[9px] tracking-widest text-[#6B6360]">
                Email Address
              </label>
              <input
                id="forgot-password-email"
                type="email"
                placeholder="name@company.com"
                className="w-full rounded-2xl border border-[#d4d9de] bg-[#eef1f4] px-4 py-3 text-base tracking-wider text-[#0A0A0A] placeholder:text-[#6f7780] outline-none transition-colors focus:border-[#c6ccd3] sm:text-[11px]"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0A0A0A] px-4 py-3 text-[10px] tracking-[0.2em] text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <LoaderCircle size={14} className="animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Reset Link"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

const ForgotAdminPasswordModal = ({ isOpen, onClose, defaultEmail = "" }) => (
  <ForgotPasswordModal
    isOpen={isOpen}
    onClose={onClose}
    defaultEmail={defaultEmail}
    title="Forgot admin password?"
    description="Enter your admin account email address"
    onSubmit={async (email) => {
      await postPublicApi("/api/admin-password-reset", {
        email,
        action: "request",
      });
    }}
  />
);

const LoginPage = () => {
  const MIN_PASSWORD_LENGTH = 8;
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState(ACCESS_MODE.RECEPTION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Admin-specific state
  const [adminPassword, setAdminPasswordInput] = useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");
  const [awaitingAdminSetup, setAwaitingAdminSetup] = useState(false);
  const [pendingUserId, setPendingUserId] = useState(null);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [showForgotAdminModal, setShowForgotAdminModal] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showUnlockAnimation, setShowUnlockAnimation] = useState(false);

  const [authComplete, setAuthComplete] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);
  const [authResult, setAuthResult] = useState(null);

  useEffect(() => {
    console.log(`[${new Date().toISOString()}] LoginPage mounted`);
    return () => {
      console.log(`[${new Date().toISOString()}] LoginPage unmounted`);
    };
  }, []);

  useEffect(() => {
    if (authComplete && animationComplete && authResult) {
      console.log(`[${new Date().toISOString()}] Synchronizing navigation. Both authComplete and animationComplete are true!`);
      setShowUnlockAnimation(false);
      setLoading(false);

      if (!authResult.success) {
        setError(authResult.error);
        try {
          supabase.auth.signOut();
        } catch {
          // ignore
        }
        // Reset states for subsequent login attempts
        setAuthComplete(false);
        setAnimationComplete(false);
        setAuthResult(null);
        return;
      }

      if (authResult.needsSetup) {
        setPendingUserId(authResult.userId);
        setAwaitingAdminSetup(true);
        setError(null);
        // Reset states
        setAuthComplete(false);
        setAnimationComplete(false);
        setAuthResult(null);
        return;
      }

      // Successful Reception or Admin login navigation
      console.log(`[${new Date().toISOString()}] LoginPage handleLogin: animation completed, navigating to /dashboard`);
      setAccessMode(authResult.mode);
      navigate("/dashboard");
    }
  }, [authComplete, animationComplete, authResult, navigate]);

  const playUnlockAndNavigate = async (modeToSet) => {
    setShowUnlockAnimation(true);
    setTimeout(() => {
      setShowUnlockAnimation(false);
      setAccessMode(modeToSet);
      console.log(`[${new Date().toISOString()}] playUnlockAndNavigate: animation completed, navigating to /dashboard`);
      navigate("/dashboard");
    }, 4000);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Reset tracking states
    setAuthComplete(false);
    setAnimationComplete(false);
    setAuthResult(null);

    // Start the lock animation immediately
    setShowUnlockAnimation(true);

    // 1. Start the animation timer
    setTimeout(() => {
      console.log(`[${new Date().toISOString()}] Animation cycle complete (4000ms elapsed)`);
      setAnimationComplete(true);
    }, 4000);

    // 2. Start the auth task in parallel
    (async () => {
      try {
        const { data: signInData, error: signInError } =
          await withTransientRetry(() => supabase.auth.signInWithPassword({ email, password }));

        if (signInError || !signInData?.user) {
          throw new Error(signInError?.message || "Invalid credentials");
        }

        const userId = signInData.user.id;

        // Check access control status
        const { data: accessData, error: accessError } = await supabase
          .from("user_access")
          .select("access_granted")
          .eq("user_id", userId)
          .maybeSingle();

        if (accessError) {
          console.error("Failed to fetch user access status on login:", accessError);
        } else if (accessData && accessData.access_granted === false) {
          await supabase.auth.signOut();
          throw new Error("Your account access has been revoked. Please contact your administrator.");
        }

        if (mode === ACCESS_MODE.ADMIN) {
          const adminExists = await hasAdminPassword(userId);
          if (!adminExists) {
            setAuthResult({ success: true, needsSetup: true, userId, user: signInData.user });
            setAuthComplete(true);
            return;
          }

          if (!adminPassword) {
            await supabase.auth.signOut();
            throw new Error("Enter your admin password to access admin mode.");
          }

          const isValidAdminPassword = await verifyAdminPassword(userId, adminPassword);
          if (!isValidAdminPassword) {
            await supabase.auth.signOut();
            throw new Error("Invalid admin password.");
          }

          setAuthResult({ success: true, mode: ACCESS_MODE.ADMIN, user: signInData.user });
          setAuthComplete(true);
        } else {
          setAuthResult({ success: true, mode: ACCESS_MODE.RECEPTION, user: signInData.user });
          setAuthComplete(true);
        }
      } catch (err) {
        setAuthResult({ success: false, error: err?.message || "Login failed. Please try again." });
        setAuthComplete(true);
      }
    })();
  };

  const handleSetupAdminPassword = async (e) => {
    e.preventDefault();
    if (!pendingUserId) {
      setError("Could not continue admin setup. Please login again.");
      return;
    }
    if (adminPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Admin password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      return;
    }
    if (adminPassword !== adminPasswordConfirm) {
      setError("Admin passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await setAdminPassword(pendingUserId, adminPassword);
      setAwaitingAdminSetup(false);
      setPendingUserId(null);
      const { data: refreshedUser, error: getUserError } = await getUserWithRetry(supabase);
      if (getUserError || !refreshedUser?.user) {
        throw new Error(getUserError?.message || "Failed to fetch updated user.");
      }
      await playUnlockAndNavigate(ACCESS_MODE.ADMIN);
    } catch (setupError) {
      setError(setupError.message || "Failed to save admin password.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAdminSetup = async () => {
    setAwaitingAdminSetup(false);
    setPendingUserId(null);
    setAdminPasswordInput("");
    setAdminPasswordConfirm("");
    setError(null);
    try {
      await supabase?.auth.signOut();
    } catch {
      // ignore
    }
  };

  return (
    <>
      <div className="app-page min-h-screen bg-black flex items-center justify-center p-4 sm:p-8 md:p-12 font-body">
        {" "}
        {/* Corner Labels */}{" "}
        <div className="fixed top-8 right-8 text-[10px] tracking-[0.2em] text-white/40 font-mono">
          {" "}
          HMG / 01{" "}
        </div>{" "}
        <div className="w-full max-w-[1200px] min-h-[600px] bg-white flex flex-col md:flex-row shadow-2xl overflow-hidden relative group rounded-2xl">
          {" "}
          {/* Left Side: Branding & Form */}{" "}
          <div className="flex-1 p-8 sm:p-12 flex flex-col justify-center md:justify-between">
            {" "}
            <div className="flex flex-col items-center md:items-start text-center md:text-left">
              {" "}
              <h1 className="font-logo font-bold text-[4.15rem] sm:text-7xl text-[#0A0A0A] leading-none tracking-tight normal-case">
                {" "}
                Hamming{" "}
              </h1>{" "}
              <p className="text-[10px] mt-2 tracking-widest text-[#6B6360] font-medium">
                {" "}
                3rd Edition{" "}
              </p>{" "}
            </div>{" "}
            <div className="w-full max-w-[320px] mx-auto md:mx-0">
              {" "}
              <form onSubmit={handleLogin} className="space-y-6">
                {" "}
                {error && (
                  <p className="text-red-600 text-[10px] tracking-wider mb-4">
                    {error}
                  </p>
                )}{" "}
                <div className="grid grid-cols-2 gap-2">
                  {" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode(ACCESS_MODE.RECEPTION);
                      setError(null);
                    }}
                    className={`py-2 text-[9px] tracking-[0.2em] transition-colors ${mode === ACCESS_MODE.RECEPTION ? "bg-[#0A0A0A] text-white" : "text-[#6B6360] hover:text-[#0A0A0A]"}`}
                  >
                    {" "}
                    Reception{" "}
                  </button>{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode(ACCESS_MODE.ADMIN);
                      setError(null);
                    }}
                    className={`py-2 text-[9px] tracking-[0.2em] transition-colors ${mode === ACCESS_MODE.ADMIN ? "bg-[#0A0A0A] text-white" : "text-[#6B6360] hover:text-[#0A0A0A]"}`}
                  >
                    {" "}
                    Admin{" "}
                  </button>{" "}
                </div>{" "}
                <div className="space-y-1">
                  {" "}
                  <input
                    type="email"
                    placeholder="Email address"
                    className="login-credential-input w-full bg-[#eef1f4] border border-[#d4d9de] px-4 py-3 rounded-2xl focus:border-[#c6ccd3] outline-none text-[#0A0A0A] caret-[#0A0A0A] text-base sm:text-[11px] tracking-wider transition-colors placeholder:text-[#6f7780]"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />{" "}
                </div>{" "}
                <div className="space-y-1">
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      className={`login-credential-input password-visibility-control ${showPassword ? "password-revealed" : ""} w-full bg-[#eef1f4] border border-[#d4d9de] px-4 py-3 pr-10 rounded-2xl focus:border-[#c6ccd3] outline-none text-[#0A0A0A] caret-[#0A0A0A] text-base sm:text-[11px] tracking-wider transition-colors placeholder:text-[#6f7780]`}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="native-inline-btn absolute right-0 top-1/2 -translate-y-1/2 text-[#6B6360] hover:text-[#0A0A0A] transition-colors"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="lucide lucide-eye-off-icon lucide-eye-off"
                          aria-hidden="true"
                        >
                          <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                          <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                          <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                          <path d="m2 2 20 20" />
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="lucide lucide-eye-icon lucide-eye"
                          aria-hidden="true"
                        >
                          <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>{" "}
                {mode === ACCESS_MODE.ADMIN && (
                  <div className="space-y-1">
                    <div className="relative">
                      <input
                        type={showAdminPassword ? "text" : "password"}
                        placeholder="Admin Password"
                        className={`login-credential-input admin-password-input password-visibility-control ${showAdminPassword ? "password-revealed" : ""} w-full bg-[#eef1f4] border border-[#d4d9de] px-4 py-3 pr-10 rounded-2xl focus:border-[#c6ccd3] outline-none text-[#0A0A0A] caret-[#0A0A0A] text-base sm:text-[11px] tracking-wider transition-colors placeholder:text-[#6f7780]`}
                        value={adminPassword}
                        onChange={(e) => setAdminPasswordInput(e.target.value)}
                        autoComplete="new-password"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminPassword((prev) => !prev)}
                        className="native-inline-btn absolute right-0 top-1/2 -translate-y-1/2 text-[#6B6360] hover:text-[#0A0A0A] transition-colors"
                        aria-label={
                          showAdminPassword ? "Hide password" : "Show password"
                        }
                        title={
                          showAdminPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showAdminPassword ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="lucide lucide-eye-off-icon lucide-eye-off"
                            aria-hidden="true"
                          >
                            <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                            <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                            <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                            <path d="m2 2 20 20" />
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="lucide lucide-eye-icon lucide-eye"
                            aria-hidden="true"
                          >
                            <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <p className="text-[8px] text-[#6B6360] tracking-widest mt-1 opacity-70">
                      {" "}
                      First admin login will ask you to set this password.{" "}
                    </p>{" "}
                  </div>
                )}{" "}
                <div
                  className={`flex flex-col space-y-4 pt-4 ${mode === ACCESS_MODE.RECEPTION ? "pb-6" : ""}`}
                >
                  {" "}
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-[#0A0A0A] text-white py-3 px-8 text-[10px] tracking-[0.2em] font-medium hover:bg-black transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {" "}
                    {loading
                      ? "Processing..."
                      : `Sign In as ${mode === ACCESS_MODE.ADMIN ? "Admin" : "Reception"}`}{" "}
                  </button>{" "}
                  <button
                    type="button"
                    onClick={() => setShowForgotPasswordModal(true)}
                    className="native-inline-btn text-[9px] tracking-widest text-[#6B6360] font-medium"
                  >
                    {" "}
                    Forgot password?{" "}
                  </button>{" "}
                  <button
                    type="button"
                    onClick={() => setShowForgotAdminModal(true)}
                    className="native-inline-btn text-[9px] tracking-widest text-[#6B6360] font-medium"
                  >
                    {" "}
                    Forgot admin password?{" "}
                  </button>{" "}
                  <Link
                    to="/signup"
                    className="text-[9px] tracking-widest text-[#6B6360] font-medium hover:text-[#0A0A0A] transition-colors"
                  >
                    Don't have an account? Create one
                  </Link>{" "}
                </div>{" "}
              </form>{" "}
            </div>{" "}
            <div className="text-[9px] tracking-widest text-[#6B6360] font-medium">
              {" "}
              Member Access / 2026{" "}
            </div>{" "}
          </div>{" "}
          {/* Right Side: Hero Image */}{" "}
          <div className="hidden md:block w-5/12 relative overflow-hidden bg-white/10">
            {" "}
            <img
              src="/hero.png"
              alt="Gym Interior"
              className="absolute inset-0 w-full h-full object-cover grayscale-[20%] group-hover:scale-105 transition-transform duration-[1600ms]"
            />{" "}
            <div className="absolute inset-0 bg-[#0A0A0A]/5" />{" "}
          </div>{" "}
        </div>{" "}
      </div>{" "}
      {showUnlockAnimation && (
        <div className="login-unlock-overlay" role="status" aria-live="polite">
          <div className="login-unlock-shell">
            <div className="login-unlock-lock-body">
              <div className="login-unlock-light-recess">
                <div className="login-unlock-status-bar" />
              </div>

              <div className="login-unlock-ring-disc">
                <div className="login-unlock-ring-plate" />
                <svg
                  className="login-unlock-ring-svg"
                  viewBox="0 0 84 84"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <circle
                    className="login-unlock-ring-circle"
                    cx="42"
                    cy="42"
                    r="36"
                  />
                </svg>
                <div className="login-unlock-ring-hub" />
              </div>

              <div className="login-unlock-handle-wrap">
                <div className="login-unlock-handle-bar" />
              </div>

              <div className="login-unlock-bottom-strip" />
            </div>
            <p className="login-unlock-copy">Unlocking access...</p>
          </div>
        </div>
      )}
      {awaitingAdminSetup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          {" "}
          <div className="w-full max-w-md bg-white p-6 border border-black/10 shadow-2xl rounded-2xl">
            {" "}
            <h2 className="text-[#0A0A0A] text-lg font-semibold tracking-tight">
              Create Admin Password
            </h2>{" "}
            <p className="text-[10px] tracking-widest text-[#6B6360] mt-1">
              Required for future admin logins
            </p>{" "}
            {error && (
              <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded p-3">
                {" "}
                <p className="text-red-600 text-[10px] tracking-wide">
                  {error}
                </p>{" "}
              </div>
            )}{" "}
            <form
              onSubmit={handleSetupAdminPassword}
              className="mt-6 space-y-4"
            >
              {" "}
              <div>
                <input
                  type="password"
                  placeholder="NEW ADMIN Password"
                  className="w-full bg-transparent border-b border-[#0A0A0A]/20 py-2 focus:border-[#0A0A0A] outline-none text-[#0A0A0A] caret-[#0A0A0A] text-base sm:text-[11px] tracking-wider placeholder:text-[#0A0A0A]/30"
                  value={adminPassword}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  required
                />{" "}
                <p className="text-[8px] text-[#6B6360] mt-1">
                  Minimum {MIN_PASSWORD_LENGTH} characters required
                </p>{" "}
              </div>{" "}
              <input
                type="password"
                placeholder="CONFIRM ADMIN Password"
                className="w-full bg-transparent border-b border-[#0A0A0A]/20 py-2 focus:border-[#0A0A0A] outline-none text-[#0A0A0A] caret-[#0A0A0A] text-base sm:text-[11px] tracking-wider placeholder:text-[#0A0A0A]/30"
                value={adminPasswordConfirm}
                onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                required
              />{" "}
              <div className="flex gap-3 pt-2">
                {" "}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-[#0A0A0A] text-white py-2 text-[10px] tracking-[0.2em] disabled:opacity-50"
                >
                  {" "}
                  {loading ? "Saving..." : "Save"}{" "}
                </button>{" "}
                <button
                  type="button"
                  onClick={handleCancelAdminSetup}
                  className="flex-1 border border-[#0A0A0A]/20 text-[#0A0A0A] py-2 text-[10px] tracking-[0.2em]"
                >
                  {" "}
                  Cancel{" "}
                </button>{" "}
              </div>{" "}
            </form>{" "}
          </div>{" "}
        </div>
      )}{" "}
      <ForgotPasswordModal
        isOpen={showForgotPasswordModal}
        onClose={() => setShowForgotPasswordModal(false)}
        defaultEmail={email}
        title="Forgot password?"
        description="Enter your account email address"
        onSubmit={async (emailAddress) => {
          const { error: resetError } = await withTransientRetry(() =>
            supabase.auth.resetPasswordForEmail(emailAddress, {
              redirectTo: window.location.origin + "/reset-password",
            }),
          );

          if (resetError) {
            throw resetError;
          }
        }}
      />
      <ForgotAdminPasswordModal
        isOpen={showForgotAdminModal}
        onClose={() => setShowForgotAdminModal(false)}
        defaultEmail={email}
      />
    </>
  );
};
export default LoginPage;

