import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { withTransientRetry } from "../lib/transientRequest";

const INVALID_LINK_MESSAGE = "Invalid reset link.";
const SUCCESS_MESSAGE = "Your password has been updated. You can now log in.";

const ResetPasswordPage = () => {
  const navigate = useNavigate();

  const [checkingSession, setCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);
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
        const { data } = await withTransientRetry(() => supabase.auth.getSession());
        if (!active) return;

        if (data?.session) {
          setHasValidSession(true);
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
  }, []);

  const passwordRules = {
    minLength: newPassword.length >= 8,
    hasUppercase: /[A-Z]/.test(newPassword),
    hasNumber: /\d/.test(newPassword),
    hasSpecial: /[!@#$%^&*()_+-=[\]{};':"\\|,.<>/?]/.test(newPassword),
  };

  const allRulesMet = Object.values(passwordRules).every(Boolean);
  const passwordsMatch =
    newPassword.length > 0 && confirmPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = allRulesMet && passwordsMatch && !loading;

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError(null);
    setLoading(true);

    try {
      const { error } = await withTransientRetry(() => supabase.auth.updateUser({ password: newPassword }));

      if (error) {
        throw error;
      }

      const { error: signOutError } = await withTransientRetry(() => supabase.auth.signOut());
      if (signOutError) {
        throw signOutError;
      }
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

  if (!hasValidSession) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 font-body">
        <div className="dm-sans-light-008 bg-[#151921] border border-white/10 rounded-2xl max-w-xl w-full p-7 md:p-10">
          <div className="flex items-center justify-between mb-4">
            <h1 className="font-logo font-bold text-2xl text-white">Hamming</h1>
          </div>
          <div className="mt-2 space-y-4">
            <p className="text-[13px] text-white/70">{INVALID_LINK_MESSAGE}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate("/login", { replace: true })}
                className="px-4 py-3.5 bg-white text-black text-[12px] rounded-xl hover:bg-white/90 transition-colors"
              >
                Go to login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 font-body">
        <div className="dm-sans-light-008 bg-[#151921] border border-white/10 rounded-2xl max-w-xl w-full p-7 md:p-10">
          <div className="flex items-center justify-between mb-4">
            <h1 className="font-logo font-bold text-2xl text-white">Hamming</h1>
          </div>
          <div className="mt-2 space-y-4">
            <p className="text-[13px] text-white/70">{SUCCESS_MESSAGE}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate("/login", { replace: true })}
                className="px-4 py-3.5 bg-white text-black text-[12px] rounded-xl hover:bg-white/90 transition-colors"
              >
                Go to login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 font-body">
      <div className="dm-sans-light-008 bg-[#151921] border border-white/10 rounded-2xl max-w-xl w-full p-7 md:p-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-logo font-bold text-2xl text-white">Hamming</h1>
        </div>

        <div className="w-full">
          <form onSubmit={handleSubmit} className="space-y-5">
            <p className="text-[13px] text-white/70 leading-relaxed">
              For security, we'll update your account password.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] text-white/55">New Password</label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  placeholder="New password"
                  className="w-full bg-white/5 border border-white/10 px-4 py-3.5 text-[13px] text-white/80 rounded-xl pr-9"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors"
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="grid gap-1 text-[11px] pt-1 text-white/60">
                <div className={`${passwordRules.minLength ? "text-emerald-600" : "text-white/40"}`}>
                  ✓ Minimum 8 characters
                </div>
                <div className={`${passwordRules.hasUppercase ? "text-emerald-600" : "text-white/40"}`}>
                  ✓ One uppercase letter
                </div>
                <div className={`${passwordRules.hasNumber ? "text-emerald-600" : "text-white/40"}`}>
                  ✓ One number
                </div>
                <div className={`${passwordRules.hasSpecial ? "text-emerald-600" : "text-white/40"}`}>
                  ✓ One special character
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] text-white/55">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm password"
                  className="w-full bg-white/5 border border-white/10 px-4 py-3.5 text-[13px] text-white/80 rounded-xl pr-9"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {confirmPassword.length > 0 && (
                <p className={`text-[11px] mt-1 ${passwordsMatch ? "text-emerald-600" : "text-red-500"}`}>
                  {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                </p>
              )}
            </div>

            {error && (
              <div className="space-y-2">
                <p className="text-red-500 text-[12px] tracking-wide">{error}</p>
                {/(expired|invalid)/i.test(error) && (
                  <Link
                    to="/login"
                    className="text-[11px] underline underline-offset-4 text-white/70 hover:opacity-80"
                  >
                    Request a new reset link
                  </Link>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-white text-black px-4 py-3.5 text-[12px] rounded-xl hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
      </div>
    </div>
  );
};

export default ResetPasswordPage;