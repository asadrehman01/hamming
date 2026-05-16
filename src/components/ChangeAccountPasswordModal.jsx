import React, { useEffect, useMemo, useRef, useState } from "react";
import { Mail, RefreshCw, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const ChangeAccountPasswordModal = ({ isOpen, onClose, email }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const isMountedRef = useRef(false);
  const cooldownTimerRef = useRef(null);

  const maskedEmail = useMemo(() => {
    if (!email || typeof email !== "string") return "Not available";
    const trimmed = email.trim();
    const [localPart, domainPart] = trimmed.split("@");
    if (!localPart || !domainPart) return trimmed;

    const visiblePrefix = localPart.slice(0, Math.min(2, localPart.length));
    const maskedLocal = `${visiblePrefix}${"*".repeat(Math.max(localPart.length - visiblePrefix.length, 2))}`;
    return `${maskedLocal}@${domainPart}`;
  }, [email]);

  const clearCooldownTimer = () => {
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
  };

  const startCooldown = () => {
    clearCooldownTimer();
    setCooldownSeconds(60);
    cooldownTimerRef.current = setInterval(() => {
      setCooldownSeconds((current) => {
        if (current <= 1) {
          clearCooldownTimer();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearCooldownTimer();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(false);
    setError(null);
    setSuccess(false);
    setCooldownSeconds(0);
    clearCooldownTimer();
  }, [isOpen]);

  const handleSendReset = async (event) => {
    event.preventDefault();
    if (isMountedRef.current) {
      setError(null);
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
      const { data: { session } } = await supabase.auth.getSession();
      const sessionEmail = session?.user?.email;

      if (!sessionEmail) {
        throw new Error("Missing auth session. Please sign in again.");
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(sessionEmail, {
        redirectTo: window.location.origin + "/reset-password",
      });

      if (resetError) {
        console.log("[ChangeAccountPasswordModal] JSON error:", JSON.stringify(resetError, null, 2));
        throw resetError;
      }

      if (isMountedRef.current) {
        setSuccess(true);
        startCooldown();
      }
    } catch (err) {
      console.log("[ChangeAccountPasswordModal] fetch error object:", err);
      if (isMountedRef.current) {
        setError("Something went wrong. Please try again.");
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
          <h2 className="text-xl md:text-2xl text-white">Change Password</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5">
          <p className="text-[12px] text-white/60 leading-relaxed">
            For security, we'll send a password reset link to your registered email address.
          </p>

          <div className="space-y-2.5">
            <label className="text-[11px] text-white/55">Account Email</label>
            <div className="w-full bg-white/5 border border-white/10 px-4 py-3.5 text-[13px] text-white/80 rounded-xl flex items-center gap-2.5">
              <Mail size={16} className="text-white/40" />
              <span className="truncate">{maskedEmail}</span>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <p className="text-red-400 text-[12px]">
                {typeof error === "string"
                  ? error
                  : error?.message || String(error)}
              </p>
            </div>
          )}

          {success ? (
            <div className="space-y-3">
              <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
                <p className="text-white text-[13px]">
                  Reset link sent to your email. Check your inbox — the link expires in 15 minutes.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSendReset}
                disabled={loading || cooldownSeconds > 0 || !email}
                className="w-full px-4 py-3.5 bg-white text-black text-[12px] hover:bg-white/90 transition-colors disabled:opacity-50 rounded-xl flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                    Sending...
                  </>
                ) : cooldownSeconds > 0 ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Resend in {cooldownSeconds}s
                  </>
                ) : (
                  "Resend"
                )}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSendReset}
              disabled={loading || !email}
              className="w-full px-4 py-3.5 bg-white text-black text-[12px] hover:bg-white/90 transition-colors disabled:opacity-50 rounded-xl flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Reset Link"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChangeAccountPasswordModal;
