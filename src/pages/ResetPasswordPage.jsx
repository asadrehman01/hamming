import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { postPublicApi } from "../lib/publicApi";

const INVALID_LINK_MESSAGE = "Invalid reset link.";
const SUCCESS_MESSAGE = "Your password has been updated. You can now log in.";

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token = useMemo(
    () => String(searchParams.get("token") || "").trim(),
    [searchParams],
  );

  const [checkingSession, setCheckingSession] = useState(true);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      if (!supabase) {
        if (active) {
          setCheckingSession(false);
        }
        return;
      }

      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;

        if (data?.session) {
          navigate("/dashboard", { replace: true });
          return;
        }
      } finally {
        if (active) {
          setCheckingSession(false);
        }
      }
    };

    checkSession();

    return () => {
      active = false;
    };
  }, [navigate]);

  const passwordRules = {
    minLength: newPassword.length >= 8,
    hasUppercase: /[A-Z]/.test(newPassword),
    hasNumber: /\d/.test(newPassword),
    hasSpecial: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/?]/.test(newPassword),
  };

  const allRulesMet = Object.values(passwordRules).every(Boolean);
  const passwordsMatch =
    newPassword.length > 0 && confirmPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = Boolean(token) && allRulesMet && passwordsMatch && !loading;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!token) {
      setError(INVALID_LINK_MESSAGE);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await postPublicApi("/api/auth/reset-password", {
        token,
        newPassword,
        confirmPassword,
      });

      setSuccess(true);
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#0B0E14] text-white flex items-center justify-center text-sm tracking-[0.04em] text-white/40 font-light" style={{ fontFamily: "DM Sans, sans-serif" }}>
        Loading...
      </div>
    );
  }

  if (!token) {
    return (
      <div className="app-page min-h-screen bg-black flex items-center justify-center p-4 sm:p-8 md:p-12 font-body">
        <div className="w-full max-w-[760px] bg-[#E8E0D5] shadow-2xl p-8 md:p-12">
          <h1 className="font-logo font-bold text-5xl text-[#0A0A0A] leading-none tracking-tight normal-case">
            Hamming
          </h1>
          <div className="mt-10 space-y-6 max-w-lg">
            <p className="text-[#0A0A0A] text-lg">{INVALID_LINK_MESSAGE}</p>
            <button
              type="button"
              onClick={() => navigate("/login", { replace: true })}
              className="bg-[#0A0A0A] text-white py-3 px-6 text-[10px] tracking-[0.2em] font-medium hover:bg-black transition-all active:scale-[0.98]"
            >
              Go to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="app-page min-h-screen bg-black flex items-center justify-center p-4 sm:p-8 md:p-12 font-body">
        <div className="w-full max-w-[760px] bg-[#E8E0D5] shadow-2xl p-8 md:p-12">
          <h1 className="font-logo font-bold text-5xl text-[#0A0A0A] leading-none tracking-tight normal-case">
            Hamming
          </h1>
          <div className="mt-10 space-y-6 max-w-lg">
            <p className="text-[#0A0A0A] text-lg">{SUCCESS_MESSAGE}</p>
            <button
              type="button"
              onClick={() => navigate("/login", { replace: true })}
              className="bg-[#0A0A0A] text-white py-3 px-6 text-[10px] tracking-[0.2em] font-medium hover:bg-black transition-all active:scale-[0.98]"
            >
              Go to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page min-h-screen bg-black flex items-center justify-center p-4 sm:p-8 md:p-12 font-body">
      <div className="fixed top-8 right-8 text-[10px] tracking-[0.2em] text-white/40 font-mono">
        HMG / 04
      </div>
      <div className="w-full max-w-[1200px] min-h-[600px] bg-[#E8E0D5] flex flex-col md:flex-row shadow-2xl overflow-hidden relative group">
        <div className="flex-1 p-10 md:p-12 flex flex-col justify-between">
          <div>
            <h1 className="font-logo font-bold text-[4.15rem] sm:text-7xl text-[#0A0A0A] leading-none tracking-tight normal-case">
              Hamming
            </h1>
            <p className="text-[10px] mt-2 tracking-widest text-[#6B6360] font-medium">
              Reset Password
            </p>
          </div>

          <div className="w-full max-w-[360px]">
            <form onSubmit={handleSubmit} className="space-y-5">
              <p className="text-[#0A0A0A] text-[13px] leading-relaxed">
                For security, we'll send a password reset link to your registered email address.
              </p>

              <div className="space-y-1.5">
                <label className="text-[9px] tracking-widest text-[#6B6360]">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    placeholder="New password"
                    className="w-full bg-transparent border-b border-[#0A0A0A]/20 py-2 pr-9 focus:border-[#0A0A0A] outline-none text-[#0A0A0A] caret-[#0A0A0A] text-base sm:text-[11px] tracking-wider placeholder:text-[#0A0A0A]/30"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-[#6B6360] hover:text-[#0A0A0A] transition-colors"
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="grid gap-1 text-[9px] pt-1">
                  <div className={`flex items-center gap-2 ${passwordRules.minLength ? "text-emerald-600" : "text-[#6B6360]"}`}>
                    <span className={`text-[11px] ${passwordRules.minLength ? "opacity-100" : "opacity-40"}`}>✓</span>
                    Minimum 8 characters
                  </div>
                  <div className={`flex items-center gap-2 ${passwordRules.hasUppercase ? "text-emerald-600" : "text-[#6B6360]"}`}>
                    <span className={`text-[11px] ${passwordRules.hasUppercase ? "opacity-100" : "opacity-40"}`}>✓</span>
                    One uppercase letter
                  </div>
                  <div className={`flex items-center gap-2 ${passwordRules.hasNumber ? "text-emerald-600" : "text-[#6B6360]"}`}>
                    <span className={`text-[11px] ${passwordRules.hasNumber ? "opacity-100" : "opacity-40"}`}>✓</span>
                    One number
                  </div>
                  <div className={`flex items-center gap-2 ${passwordRules.hasSpecial ? "text-emerald-600" : "text-[#6B6360]"}`}>
                    <span className={`text-[11px] ${passwordRules.hasSpecial ? "opacity-100" : "opacity-40"}`}>✓</span>
                    One special character
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] tracking-widest text-[#6B6360]">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm password"
                    className="w-full bg-transparent border-b border-[#0A0A0A]/20 py-2 pr-9 focus:border-[#0A0A0A] outline-none text-[#0A0A0A] caret-[#0A0A0A] text-base sm:text-[11px] tracking-wider placeholder:text-[#0A0A0A]/30"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-[#6B6360] hover:text-[#0A0A0A] transition-colors"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {confirmPassword.length > 0 && (
                  <p className={`text-[9px] mt-1 ${passwordsMatch ? "text-emerald-600" : "text-red-600"}`}>
                    {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                  </p>
                )}
              </div>

              {error && (
                <div className="space-y-2">
                  <p className="text-red-600 text-[10px] tracking-wide">{error}</p>
                  {/(expired|invalid)/i.test(error) && (
                    <Link
                      to="/login"
                      className="text-[10px] tracking-widest text-[#0A0A0A] underline underline-offset-4 hover:opacity-80"
                    >
                      Request a new reset link
                    </Link>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full bg-[#0A0A0A] text-white py-3 px-8 text-[10px] tracking-[0.2em] font-medium hover:bg-black transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <LoaderCircle size={14} className="animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Password"
                )}
              </button>
            </form>
          </div>

          <div className="text-[10px] tracking-widest text-[#6B6360] font-medium">
            Member Access / 2026
          </div>
        </div>

        <div className="hidden md:block w-5/12 relative overflow-hidden bg-white/10">
          <img
            src="/hero.png"
            alt="Gym Interior"
            className="absolute inset-0 w-full h-full object-cover grayscale-[20%] group-hover:scale-105 transition-transform duration-[1600ms]"
          />
          <div className="absolute inset-0 bg-[#0A0A0A]/5" />
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;