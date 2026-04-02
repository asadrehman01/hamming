import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Link, useNavigate } from "react-router-dom";
import {
  ACCESS_MODE,
  setAccessMode,
  hasAdminPassword,
  setAdminPassword,
  verifyAdminPassword,
  forceResetAdminPassword,
} from "../lib/accessControl";
import { isMigrationOnboardingCompleted } from "../lib/migrationOnboarding";
const LoginPage = () => {
  const MIN_PASSWORD_LENGTH = 8;
  const navigate = useNavigate();
  const resetTimeoutRef = useRef(null);
  const unlockTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState(ACCESS_MODE.RECEPTION);
  const [adminPassword, setAdminPasswordInput] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");
  const [awaitingAdminSetup, setAwaitingAdminSetup] = useState(false);
  const [pendingUserId, setPendingUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForgotAdminModal, setShowForgotAdminModal] = useState(false);
  const [resetAdminPassword, setResetAdminPassword] = useState("");
  const [resetAdminPasswordConfirm, setResetAdminPasswordConfirm] =
    useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [showUnlockAnimation, setShowUnlockAnimation] = useState(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;

      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }

      if (unlockTimeoutRef.current) {
        clearTimeout(unlockTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setShowPassword(false);
    setShowAdminPassword(false);
  }, [mode]);

  const navigatePostLogin = (user) => {
    if (isMigrationOnboardingCompleted(user)) {
      navigate("/dashboard");
      return;
    }
    navigate("/integrations");
  };

  const playUnlockAndNavigate = async (user) => {
    if (!isMountedRef.current) return;
    setShowUnlockAnimation(true);

    await new Promise((resolve) => {
      unlockTimeoutRef.current = setTimeout(resolve, 4000);
    });

    if (!isMountedRef.current) return;
    navigatePostLogin(user);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!supabase) {
      setError("Supabase client not initialized.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      if (userError || !userData?.user) {
        setError(userError?.message || "Unable to fetch account details.");
        return;
      }
      if (mode === ACCESS_MODE.RECEPTION) {
        setAccessMode(ACCESS_MODE.RECEPTION);
        await playUnlockAndNavigate(userData.user);
        return;
      }
      const userId = userData.user.id;
      const adminExists = await hasAdminPassword(userId);
      if (!adminExists) {
        setPendingUserId(userId);
        setAwaitingAdminSetup(true);
        return;
      }
      if (!adminPassword) {
        setError("Enter your admin password to access admin mode.");
        await supabase.auth.signOut();
        return;
      }
      const isValidAdminPassword = await verifyAdminPassword(
        userId,
        adminPassword,
      );
      if (!isValidAdminPassword) {
        setError("Invalid admin password.");
        await supabase.auth.signOut();
        return;
      }
      setAccessMode(ACCESS_MODE.ADMIN);
      await playUnlockAndNavigate(userData.user);
    } catch (err) {
      setError(err?.message || "Login failed. Please try again.");
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore sign-out cleanup failures
      }
    } finally {
      setLoading(false);
    }
  };
  const handleSetupAdminPassword = async (e) => {
    e.preventDefault();
    if (!pendingUserId) {
      setError("Could not continue admin setup. Please login again.");
      return;
    }
    if (adminPassword.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Admin password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      );
      return;
    }
    if (adminPassword !== adminPasswordConfirm) {
      setError("Admin passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await setAdminPassword(pendingUserId, adminPassword);
      setAccessMode(ACCESS_MODE.ADMIN);
      setAwaitingAdminSetup(false);
      setPendingUserId(null);
      const { data: refreshedUser, error: getUserError } =
        await supabase.auth.getUser();
      if (getUserError || !refreshedUser?.user) {
        throw new Error(
          getUserError?.message || "Failed to fetch updated user.",
        );
      }
      await playUnlockAndNavigate(refreshedUser.user);
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
    await supabase?.auth.signOut();
  };
  const handleResetAdminPassword = async (e) => {
    e.preventDefault();
    setResetError(null);
    setResetSuccess(false);
    if (!resetAdminPassword || !resetAdminPasswordConfirm) {
      setResetError("Both password fields are required");
      return;
    }
    if (resetAdminPassword !== resetAdminPasswordConfirm) {
      setResetError("Passwords do not match");
      return;
    }
    if (resetAdminPassword.length < MIN_PASSWORD_LENGTH) {
      setResetError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
      );
      return;
    }
    setResetLoading(true);
    try {
      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setResetError("Unable to verify your credentials. Please try again.");
        setResetLoading(false);
        return;
      }

      if (!signInData?.user) {
        setResetError("Unable to verify your credentials. Please try again.");
        setResetLoading(false);
        return;
      }

      const userId = signInData.user.id;

      await forceResetAdminPassword(userId, resetAdminPassword);
      setResetSuccess(true);
      setResetAdminPassword("");
      setResetAdminPasswordConfirm("");

      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
      resetTimeoutRef.current = setTimeout(async () => {
        setShowForgotAdminModal(false);
        setResetSuccess(false);
        await supabase.auth.signOut();
      }, 2000);
    } catch (err) {
      setResetError(
        err.message || "Failed to reset admin password. Please try again.",
      );
    } finally {
      setResetLoading(false);
    }
  };
  return (
    <>
      {" "}
      <div className="app-page min-h-screen bg-black flex items-center justify-center p-4 sm:p-8 md:p-12 font-body">
        {" "}
        {/* Corner Labels */}{" "}
        <div className="fixed top-8 right-8 text-[10px] tracking-[0.2em] text-white/40 font-mono">
          {" "}
          HMG / 01{" "}
        </div>{" "}
        <div className="w-full max-w-[1200px] h-[600px] bg-[#E8E0D5] flex flex-col md:flex-row shadow-2xl overflow-hidden relative group">
          {" "}
          {/* Left Side: Branding & Form */}{" "}
          <div className="flex-1 p-12 flex flex-col justify-between">
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
            <div className="w-full max-w-[320px]">
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
                    className="login-credential-input w-full bg-transparent border-b border-[#0A0A0A]/20 py-2 focus:border-[#0A0A0A] outline-none text-[#0A0A0A] caret-[#0A0A0A] text-base sm:text-[11px] tracking-wider transition-colors placeholder:text-[#0A0A0A]/30"
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
                      className={`login-credential-input password-visibility-control ${showPassword ? "password-revealed" : ""} w-full bg-transparent border-b border-[#0A0A0A]/20 py-2 pr-9 focus:border-[#0A0A0A] outline-none text-[#0A0A0A] caret-[#0A0A0A] text-base sm:text-[11px] tracking-wider transition-colors placeholder:text-[#0A0A0A]/30`}
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
                        className={`login-credential-input admin-password-input password-visibility-control ${showAdminPassword ? "password-revealed" : ""} w-full bg-transparent border-b border-[#0A0A0A]/20 py-2 pr-9 focus:border-[#0A0A0A] outline-none text-[#0A0A0A] caret-[#0A0A0A] text-base sm:text-[11px] tracking-wider transition-colors placeholder:text-[#0A0A0A]/30`}
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
                  {mode === ACCESS_MODE.ADMIN && (
                    <button
                      type="button"
                      onClick={() => setShowForgotAdminModal(true)}
                      className="native-inline-btn text-[9px] tracking-widest text-[#6B6360] font-medium"
                    >
                      {" "}
                      Forgot Admin Password?{" "}
                    </button>
                  )}{" "}
                  {mode === ACCESS_MODE.RECEPTION && (
                    <button
                      type="button"
                      onClick={() =>
                        setError(
                          "Use the standard account recovery flow from your administrator.",
                        )
                      }
                      className="native-inline-btn text-[9px] tracking-widest text-[#6B6360] font-medium"
                    >
                      {" "}
                      Forgot Password?{" "}
                    </button>
                  )}{" "}
                  <Link
                    to="/signup"
                    className="text-[10px] tracking-widest text-[#6B6360] font-medium hover:text-[#0A0A0A] transition-colors"
                  >
                    {" "}
                    Create an Account{" "}
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
          <div className="w-full max-w-md bg-[#E8E0D5] p-6 border border-black/10 shadow-2xl">
            {" "}
            <h2 className="text-[#0A0A0A] text-lg font-semibold tracking-tight">
              Create Admin Password
            </h2>{" "}
            <p className="text-[10px] tracking-widest text-[#6B6360] mt-1">
              Required for future admin logins
            </p>{" "}
            <form
              onSubmit={handleSetupAdminPassword}
              className="mt-6 space-y-4"
            >
              {" "}
              <input
                type="password"
                placeholder="NEW ADMIN Password"
                className="w-full bg-transparent border-b border-[#0A0A0A]/20 py-2 focus:border-[#0A0A0A] outline-none text-[#0A0A0A] caret-[#0A0A0A] text-base sm:text-[11px] tracking-wider placeholder:text-[#0A0A0A]/30"
                value={adminPassword}
                onChange={(e) => setAdminPasswordInput(e.target.value)}
                required
              />{" "}
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
      {showForgotAdminModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          {" "}
          <div className="w-full max-w-md bg-[#E8E0D5] p-6 border border-black/10 shadow-2xl">
            {" "}
            <h2 className="text-[#0A0A0A] text-lg font-semibold tracking-tight">
              Reset Admin Password
            </h2>{" "}
            <p className="text-[10px] tracking-widest text-[#6B6360] mt-1">
              Create a new secure admin password
            </p>{" "}
            {resetSuccess ? (
              <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded text-center">
                {" "}
                <p className="text-emerald-600 text-sm font-medium">
                  Admin password reset successfully!
                </p>{" "}
                <p className="text-[10px] text-emerald-500/70 mt-2">
                  You can now login with your new admin password.
                </p>{" "}
              </div>
            ) : (
              <form
                onSubmit={handleResetAdminPassword}
                className="mt-6 space-y-4"
              >
                {" "}
                {resetError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded p-3">
                    {" "}
                    <p className="text-red-600 text-[10px]">
                      {resetError}
                    </p>{" "}
                  </div>
                )}{" "}
                <div>
                  {" "}
                  <label className="text-[9px] tracking-widest text-[#6B6360] block mb-1">
                    New Admin Password
                  </label>{" "}
                  <input
                    type="password"
                    placeholder="New admin password"
                    className="w-full bg-transparent border-b border-[#0A0A0A]/20 py-2 focus:border-[#0A0A0A] outline-none text-[#0A0A0A] caret-[#0A0A0A] text-base sm:text-[11px] tracking-wider placeholder:text-[#0A0A0A]/30"
                    value={resetAdminPassword}
                    onChange={(e) => setResetAdminPassword(e.target.value)}
                    required
                  />{" "}
                  <p className="text-[8px] text-[#6B6360] mt-1">
                    Minimum {MIN_PASSWORD_LENGTH} characters required
                  </p>{" "}
                </div>{" "}
                <div>
                  {" "}
                  <label className="text-[9px] tracking-widest text-[#6B6360] block mb-1">
                    Confirm Password
                  </label>{" "}
                  <input
                    type="password"
                    placeholder="Confirm password"
                    className="w-full bg-transparent border-b border-[#0A0A0A]/20 py-2 focus:border-[#0A0A0A] outline-none text-[#0A0A0A] caret-[#0A0A0A] text-base sm:text-[11px] tracking-wider placeholder:text-[#0A0A0A]/30"
                    value={resetAdminPasswordConfirm}
                    onChange={(e) =>
                      setResetAdminPasswordConfirm(e.target.value)
                    }
                    required
                  />{" "}
                </div>{" "}
                <div className="flex gap-3 pt-2">
                  {" "}
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="flex-1 bg-[#0A0A0A] text-white py-2 text-[10px] tracking-[0.2em] disabled:opacity-50"
                  >
                    {" "}
                    {resetLoading ? "Resetting..." : "Reset Password"}{" "}
                  </button>{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotAdminModal(false);
                      setResetError(null);
                      setResetSuccess(false);
                      setResetAdminPassword("");
                      setResetAdminPasswordConfirm("");
                    }}
                    className="flex-1 border border-[#0A0A0A]/20 text-[#0A0A0A] py-2 text-[10px] tracking-[0.2em]"
                  >
                    {" "}
                    Cancel{" "}
                  </button>{" "}
                </div>{" "}
              </form>
            )}{" "}
          </div>{" "}
        </div>
      )}{" "}
    </>
  );
};
export default LoginPage;
