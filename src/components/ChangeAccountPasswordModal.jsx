import React, { useEffect, useRef, useState } from "react";
import { Mail, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const ChangeAccountPasswordModal = ({ isOpen, onClose, email }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(false);
    setError(null);
    setSuccess(false);
  }, [isOpen]);

  const handleSendReset = async (event) => {
    event.preventDefault();
    if (isMountedRef.current) {
      setError(null);
    }

    if (!supabase) {
      if (isMountedRef.current) {
        setError("Authentication is not configured.");
      }
      return;
    }

    if (!email) {
      if (isMountedRef.current) {
        setError("No account email found for this user.");
      }
      return;
    }

    if (isMountedRef.current) {
      setLoading(true);
    }

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${window.location.origin}/login`,
        },
      );

      if (resetError) throw resetError;
      if (isMountedRef.current) {
        setSuccess(true);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err?.message || "Failed to send reset email.");
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="dm-sans-light-008 bg-[#151921] border border-white/10 rounded-2xl max-w-xl w-full p-7 md:p-10 animate-in fade-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl md:text-2xl text-white">
            Change Password
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {success ? (
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
            <p className="text-white text-[13px]">
              Password reset email sent.
            </p>
            <p className="text-[12px] text-white/65 mt-2">
              Check {email} and follow the link to set your new login password.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSendReset} className="space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <p className="text-red-400 text-[12px]">{error}</p>
              </div>
            )}

            <div className="space-y-2.5">
              <label className="text-[11px] text-white/55">
                Account Email
              </label>
              <div className="w-full bg-white/5 border border-white/10 px-4 py-3.5 text-[13px] text-white/80 rounded-xl flex items-center gap-2.5">
                <Mail size={16} className="text-white/40" />
                <span className="truncate">{email || "Not available"}</span>
              </div>
            </div>

            <p className="text-[12px] text-white/60 leading-relaxed">
              This sends a secure reset link to your email so you can update your
              regular login password.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3.5 border border-white/10 text-white text-[12px] hover:bg-white/5 transition-colors rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !email}
                className="flex-1 px-4 py-3.5 bg-white text-black text-[12px] hover:bg-white/90 transition-colors disabled:opacity-50 rounded-xl"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ChangeAccountPasswordModal;
