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
        className="dm-sans-light-008 bg-[#E8E0D5] border border-black/10 rounded-2xl max-w-md w-full p-7 md:p-10 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="forgot-admin-password-title"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2
              id="forgot-admin-password-title"
              className="text-[#0A0A0A] text-lg font-semibold tracking-tight"
            >
              Forgot Admin Password
            </h2>
            <p className="text-[11px] text-[#6B6360] mt-1">
              Enter your account email address
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#6B6360] hover:text-[#0A0A0A] transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div className="mt-6 p-4 bg-white/40 border border-black/10 rounded-xl text-center">
            <p className="text-[#0A0A0A] text-[12px] tracking-wide">
              {SUCCESS_MESSAGE}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="bg-white/40 border border-black/10 rounded-xl p-3">
                <p className="text-[#0A0A0A] text-[12px] tracking-wide">{error}</p>
              </div>
            )}
            <div>
              <label className="text-[11px] text-[#6B6360] block mb-1" htmlFor="forgot-admin-email">
                Account Email Address
              </label>
              <input
                id="forgot-admin-email"
                type="email"
                placeholder="name@company.com"
                className="w-full bg-transparent border-b border-black/15 px-0 py-3 text-[13px] text-[#0A0A0A] placeholder:text-[#0A0A0A]/30 focus:outline-none focus:border-[#0A0A0A]"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-[#0A0A0A] text-white py-3 px-4 text-[10px] tracking-[0.2em] rounded-xl hover:bg-black disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-black/10 text-[#0A0A0A] py-3 px-4 text-[10px] tracking-[0.2em] rounded-xl hover:bg-white/40"
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
