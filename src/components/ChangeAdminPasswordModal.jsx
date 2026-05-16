import React, { useState, useEffect, useRef } from "react";
import { X, Eye, EyeOff, Check } from "lucide-react";
import ForgotAdminPasswordModal from "./ForgotAdminPasswordModal";
import { changeAdminPassword } from "../lib/accessControl";
import { supabase } from "../lib/supabaseClient";
import { getUserWithRetry } from "../lib/authUser";
const ChangeAdminPasswordModal = ({ isOpen, onClose }) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [userId, setUserId] = useState(null);
  const timeoutRef = useRef(null);
  const [showForgotModal, setShowForgotModal] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const getUser = async () => {
      if (!isOpen) {
        if (!cancelled) setUserId(null);
        return;
      }

      if (!cancelled) {
        setError(null);
        setSuccess(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setShowCurrentPassword(false);
        setShowNewPassword(false);
        setShowConfirmPassword(false);
        setLoading(false);
      }

      try {
        const {
          data: { user },
          error: getUserError,
        } = await getUserWithRetry(supabase);

        if (cancelled) return;

        if (getUserError) {
          console.error(
            "Failed to fetch user in ChangeAdminPasswordModal:",
            getUserError,
          );
          setUserId(null);
          setError("Unable to verify your account. Please reopen the modal.");
          return;
        }

        setUserId(user?.id ?? null);
      } catch (err) {
        if (cancelled) return;
        console.error(
          "Unexpected getUser error in ChangeAdminPasswordModal:",
          err,
        );
        setError(
          `Unable to verify your account. ${err?.message || "Please reopen the modal."}`,
        );
        setUserId(null);
      }
    };

    getUser();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const passwordRules = {
    minLength: newPassword.length >= 8,
    hasUppercase: /[A-Z]/.test(newPassword),
    hasNumber: /\d/.test(newPassword),
    hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword),
  };
  const allRulesMet = Object.values(passwordRules).every(Boolean);
  const hasTypedBothNewPasswords =
    newPassword.length > 0 && confirmPassword.length > 0;
  const passwordsMatch = hasTypedBothNewPasswords && newPassword === confirmPassword;

  const validatePassword = (password) => {
    if (password.length < 8) {
      return "Password must be at least 8 characters long";
    }
    if (!/[A-Z]/.test(password)) {
      return "Password must contain at least one uppercase letter";
    }
    if (!/\d/.test(password)) {
      return "Password must contain at least one number";
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return "Password must contain at least one special character (!@#$%^&*)";
    }
    return null;
  };

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    allRulesMet &&
    passwordsMatch;
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All fields are required");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from current password");
      return;
    }
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    setLoading(true);
    try {
      if (!userId) {
        throw new Error("Unable to verify your account. Please sign in again.");
      }

      await changeAdminPassword(userId, currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      // Close modal after 2 seconds
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 2000);
    } catch (err) {
      setError(err.message || "Failed to change password");
    } finally {
      setLoading(false);
    }
  };
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 dm-sans-light-008"
      onClick={onClose}
      role="presentation"
    >
      {" "}
      <div
        className="bg-[#151921] border border-white/10 rounded-2xl max-w-md w-full p-6 md:p-8 animate-in fade-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-admin-password-title"
      >
        {" "}
        <div className="flex items-center justify-between mb-6">
          {" "}
          <h2
            id="change-admin-password-title"
            className="text-lg md:text-xl font-medium text-white tracking-tight"
          >
            Change Admin Password
          </h2>{" "}
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors"
          >
            {" "}
            <X size={20} />{" "}
          </button>{" "}
        </div>{" "}
        {success ? (
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
            {" "}
            <p className="text-white text-sm font-medium">
              Password changed successfully!
            </p>{" "}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {" "}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                {" "}
                <p className="text-red-400 text-xs font-mono">{error}</p>{" "}
              </div>
            )}{" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.2em] font-mono text-white/40">
                Current Password
              </label>{" "}
              <div className="relative">
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full bg-white/5 border border-white/10 px-4 py-3 pr-10 text-base sm:text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                  aria-label={
                    showCurrentPassword ? "Hide current password" : "Show current password"
                  }
                >
                  {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.2em] font-mono text-white/40">
                New Password
              </label>{" "}
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full bg-white/5 border border-white/10 px-4 py-3 pr-10 text-base sm:text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                  aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>{" "}
              <div className="grid gap-1 text-[9px]">
                <div
                  className={`flex items-center gap-2 ${
                    passwordRules.minLength ? "text-emerald-400" : "text-white/40"
                  }`}
                >
                  <Check size={12} className={passwordRules.minLength ? "opacity-100" : "opacity-40"} />
                  Minimum 8 characters
                </div>
                <div
                  className={`flex items-center gap-2 ${
                    passwordRules.hasUppercase ? "text-emerald-400" : "text-white/40"
                  }`}
                >
                  <Check size={12} className={passwordRules.hasUppercase ? "opacity-100" : "opacity-40"} />
                  At least one uppercase letter
                </div>
                <div
                  className={`flex items-center gap-2 ${
                    passwordRules.hasNumber ? "text-emerald-400" : "text-white/40"
                  }`}
                >
                  <Check size={12} className={passwordRules.hasNumber ? "opacity-100" : "opacity-40"} />
                  At least one number
                </div>
                <div
                  className={`flex items-center gap-2 ${
                    passwordRules.hasSpecial ? "text-emerald-400" : "text-white/40"
                  }`}
                >
                  <Check size={12} className={passwordRules.hasSpecial ? "opacity-100" : "opacity-40"} />
                  At least one special character
                </div>
              </div>{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.2em] font-mono text-white/40">
                Confirm New Password
              </label>{" "}
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full bg-white/5 border border-white/10 px-4 py-3 pr-10 text-base sm:text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                  aria-label={
                    showConfirmPassword
                      ? "Hide confirm password"
                      : "Show confirm password"
                  }
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>{" "}
              {hasTypedBothNewPasswords && (
                <p
                  className={`text-[9px] mt-1 ${
                    passwordsMatch ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                </p>
              )}{" "}
            </div>{" "}
            <div className="flex gap-3 pt-4">
              {" "}
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 border border-white/10 text-white text-[10px] tracking-[0.2em] font-medium hover:bg-white/5 transition-colors rounded-lg"
              >
                {" "}
                Cancel{" "}
              </button>{" "}
              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="flex-1 px-4 py-3 bg-white text-black text-[10px] tracking-[0.2em] font-medium hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
              >
                {" "}
                {loading ? "Updating..." : "Update Password"}{" "}
              </button>{" "}
            </div>{" "}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="native-inline-btn text-[9px] tracking-widest text-white/40 hover:text-white"
              >
                Forgot admin password?
              </button>
            </div>
          </form>
        )}{" "}
      {showForgotModal && (
        <ForgotAdminPasswordModal
          isOpen={showForgotModal}
          onClose={() => setShowForgotModal(false)}
        />
      )}
      </div>{" "}
    </div>
  );
};
export default ChangeAdminPasswordModal;

