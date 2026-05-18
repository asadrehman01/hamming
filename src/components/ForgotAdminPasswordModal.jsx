import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { postPublicApi } from "../lib/publicApi";

const SUCCESS_MESSAGE = "If this email is registered, a reset link has been sent.";

const isValidEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

const ForgotAdminPasswordModal = ({ isOpen, onClose, defaultEmail = "" }) => {
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

    const trimmed = String(email || "").trim();
    if (!isValidEmail(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      await postPublicApi("/api/admin-password-reset", {
        action: "request",
        email: trimmed,
      });
      setSuccess(true);
    } catch (err) {
      setError(err?.message || "Unable to send reset link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="dm-sans-light-008 bg-[#151921] border border-white/10 rounded-2xl max-w-md w-full p-7 md:p-10 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="forgot-admin-password-title"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2
              id="forgot-admin-password-title"
              className="text-white text-lg font-semibold tracking-tight"
            >
              Forgot Admin Password
            </h2>
            <p className="text-[11px] text-white/60 mt-1">
              Enter your account email address
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div className="mt-6 p-4 bg-white/5 border border-white/10 rounded-xl text-center">
            <p className="text-white text-[12px] tracking-wide">
              {SUCCESS_MESSAGE}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-red-400 text-[12px] tracking-wide">{error}</p>
              </div>
            )}
            <div>
              <label className="text-[11px] text-white/55 block mb-1" htmlFor="forgot-admin-email">
                Account Email Address
              </label>
              <input
                id="forgot-admin-email"
                type="email"
                placeholder="name@company.com"
                className="w-full bg-white/5 border border-white/10 px-4 py-3.5 text-[13px] text-white/80 rounded-xl placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-3 bg-white text-black text-[10px] tracking-[0.2em] font-medium hover:bg-white/90 transition-colors disabled:opacity-50 rounded-xl"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 border border-white/10 text-white text-[10px] tracking-[0.2em] font-medium hover:bg-white/5 transition-colors rounded-xl"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotAdminPasswordModal;
