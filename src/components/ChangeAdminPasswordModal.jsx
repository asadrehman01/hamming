import React, { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { changeAdminPassword } from "../lib/accessControl";
import { supabase } from "../lib/supabaseClient";
import { getUserWithRetry } from "../lib/authUser";
const ChangeAdminPasswordModal = ({ isOpen, onClose }) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [userId, setUserId] = useState(null);
  const timeoutRef = useRef(null);

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

  const validatePassword = (password) => {
    if (password.length < 8) {
      return "Password must be at least 8 characters long";
    }
    if (!/[A-Z]/.test(password)) {
      return "Password must contain at least one uppercase letter";
    }
    if (!/[a-z]/.test(password)) {
      return "Password must contain at least one lowercase letter";
    }
    if (!/\d/.test(password)) {
      return "Password must contain at least one number";
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return "Password must contain at least one special character (!@#$%^&*)";
    }
    return null;
  };
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
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full bg-white/5 border border-white/10 px-4 py-3 text-base sm:text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors rounded-lg"
              />{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.2em] font-mono text-white/40">
                New Password
              </label>{" "}
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full bg-white/5 border border-white/10 px-4 py-3 text-base sm:text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors rounded-lg"
              />{" "}
              <p className="text-[9px] text-white/40 mt-1">
                Must contain: 8+ chars, uppercase, lowercase, number, and
                special character
              </p>{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.2em] font-mono text-white/40">
                Confirm New Password
              </label>{" "}
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full bg-white/5 border border-white/10 px-4 py-3 text-base sm:text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors rounded-lg"
              />{" "}
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
                disabled={loading}
                className="flex-1 px-4 py-3 bg-white text-black text-[10px] tracking-[0.2em] font-medium hover:bg-white/90 transition-colors disabled:opacity-50 rounded-lg"
              >
                {" "}
                {loading ? "Updating..." : "Update Password"}{" "}
              </button>{" "}
            </div>{" "}
          </form>
        )}{" "}
      </div>{" "}
    </div>
  );
};
export default ChangeAdminPasswordModal;

