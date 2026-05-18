import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { getUserWithRetry } from "../lib/authUser";
import { Link, useNavigate } from "react-router-dom";
import {
  ACCESS_MODE,
  setAccessMode,
  hasAdminPassword,
  setAdminPassword,
  verifyAdminPassword,
  forceResetAdminPassword,
} from "../lib/accessControl";
import ForgotAdminPasswordModal from "../components/ForgotAdminPasswordModal";

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
  const [showForgotAdminModal, setShowForgotAdminModal] = useState(false);
  const resetTimeoutRef = useRef(null);

  const [resetAdminPassword, setResetAdminPassword] = useState("");
  const [resetAdminPasswordConfirm, setResetAdminPasswordConfirm] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState(null);
  const [resetSuccess, setResetSuccess] = useState(false);

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
      {awaitingAdminSetup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-white p-6 border border-black/10 shadow-2xl rounded-2xl">
            <h2 className="text-[#0d0d0d] text-lg font-semibold tracking-tight">
              Create Admin Password
            </h2>
            <p className="text-[10px] tracking-widest text-[#8a8a8a] mt-1">
              Required for future admin logins
            </p>
            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-2xl p-3">
                <p className="text-red-700 text-[10px] tracking-wide">{error}</p>
              </div>
            )}
            <form onSubmit={handleSetupAdminPassword} className="mt-6 space-y-4">
              <div>
                <input
                  type="password"
                  placeholder="NEW ADMIN Password"
                  className="w-full bg-[#fbfbfb] border border-[#e6e6e6] px-4 py-3 text-[#0d0d0d] placeholder:text-[#b6b6b6] rounded-2xl text-base sm:text-[11px] tracking-wider focus:outline-none focus:border-[#d6d6d6]"
                  value={adminPassword}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  required
                />
                <p className="text-[8px] text-[#8a8a8a] mt-1">
                  Minimum {MIN_PASSWORD_LENGTH} characters required
                </p>
              </div>
              <input
                type="password"
                placeholder="CONFIRM ADMIN Password"
                className="w-full bg-[#fbfbfb] border border-[#e6e6e6] px-4 py-3 text-[#0d0d0d] placeholder:text-[#b6b6b6] rounded-2xl text-base sm:text-[11px] tracking-wider focus:outline-none focus:border-[#d6d6d6]"
                value={adminPasswordConfirm}
                onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                required
              />
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-[#0d0d0d] text-white py-2 text-[10px] tracking-[0.2em] disabled:opacity-50 rounded-2xl"
                >
                  {loading ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelAdminSetup}
                  className="flex-1 border border-[#e6e6e6] text-[#0d0d0d] py-2 text-[10px] tracking-[0.2em] rounded-2xl"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    // 2. Start the auth task in parallel
    (async () => {
      try {
        const { data: signInData, error: signInError } =
          await supabase.auth.signInWithPassword({ email, password });

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

  const handleResetAdminPassword = async (e) => {
    e.preventDefault();
    setResetError(null);
    setResetSuccess(false);
    if (!resetAdminPassword || !resetAdminPasswordConfirm) {
      setResetError("Both password fields are required");
      return;
    }
    if (resetAdminPassword !== resetAdminPasswordConfirm) {
      {showForgotAdminModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-white p-6 border border-black/10 shadow-2xl rounded-2xl">
            <h2 className="text-[#0d0d0d] text-lg font-semibold tracking-tight">Reset Admin Password</h2>
            <p className="text-[10px] tracking-widest text-[#8a8a8a] mt-1">Create a new secure admin password</p>
            {resetSuccess ? (
              <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                <p className="text-emerald-600 text-sm font-medium">Admin password reset successfully!</p>
                <p className="text-[10px] text-emerald-500/70 mt-2">You can now login with your new admin password.</p>
              </div>
            ) : (
              <form onSubmit={handleResetAdminPassword} className="mt-6 space-y-4">
                {resetError && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-3">
                    <p className="text-red-700 text-[10px]">{resetError}</p>
                  </div>
                )}
                <div>
                  <label className="text-[9px] tracking-widest text-[#8a8a8a] block mb-1">New Admin Password</label>
                  <input
                    type="password"
                    placeholder="New admin password"
                    className="w-full bg-[#fbfbfb] border border-[#e6e6e6] px-4 py-3 text-[#0d0d0d] placeholder:text-[#b6b6b6] rounded-2xl focus:outline-none focus:border-[#d6d6d6]"
                    value={resetAdminPassword}
                    onChange={(e) => setResetAdminPassword(e.target.value)}
                    required
                  />
                  <p className="text-[8px] text-[#8a8a8a] mt-1">Minimum {MIN_PASSWORD_LENGTH} characters required</p>
                </div>
                <div>
                  <label className="text-[9px] tracking-widest text-[#8a8a8a] block mb-1">Confirm Password</label>
                  <input
                    type="password"
                    placeholder="Confirm password"
                    className="w-full bg-[#fbfbfb] border border-[#e6e6e6] px-4 py-3 text-[#0d0d0d] placeholder:text-[#b6b6b6] rounded-2xl focus:outline-none focus:border-[#d6d6d6]"
                    value={resetAdminPasswordConfirm}
                    onChange={(e) => setResetAdminPasswordConfirm(e.target.value)}
                    required
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={resetLoading} className="flex-1 bg-[#0d0d0d] text-white py-2 text-[10px] tracking-[0.2em] disabled:opacity-50 rounded-2xl">{resetLoading ? "Resetting..." : "Reset Password"}</button>
                  <button type="button" onClick={() => { setShowForgotAdminModal(false); setResetError(null); setResetSuccess(false); setResetAdminPassword(""); setResetAdminPasswordConfirm(""); }} className="flex-1 border border-[#e6e6e6] text-[#0d0d0d] py-2 text-[10px] tracking-[0.2em] rounded-2xl">Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
                  >
                    {" "}
                    Admin{" "}
                  </button>{" "}
                </div>{" "}
                <div className="space-y-1">
                  <input
                    type="email"
                    placeholder="Email address"
                    className="w-full bg-[#fbfbfb] border border-[#e6e6e6] px-4 py-3 text-[#0d0d0d] placeholder:text-[#b6b6b6] rounded-2xl text-base sm:text-[11px] tracking-wider transition-colors focus:outline-none focus:border-[#d6d6d6]"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      className={`password-visibility-control ${showPassword ? "password-revealed" : ""} w-full bg-[#fbfbfb] border border-[#e6e6e6] px-4 py-3 pr-10 text-[#0d0d0d] placeholder:text-[#b6b6b6] rounded-2xl text-base sm:text-[11px] tracking-wider transition-colors focus:outline-none focus:border-[#d6d6d6]`}
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
                        className={`admin-password-input password-visibility-control ${showAdminPassword ? "password-revealed" : ""} w-full bg-[#fbfbfb] border border-[#e6e6e6] px-4 py-3 pr-10 text-[#0d0d0d] placeholder:text-[#b6b6b6] rounded-2xl text-base sm:text-[11px] tracking-wider transition-colors focus:outline-none focus:border-[#d6d6d6]`}
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
      {showForgotAdminModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          {" "}
          <div className="w-full max-w-md bg-white p-6 border border-black/10 shadow-2xl rounded-2xl">
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

