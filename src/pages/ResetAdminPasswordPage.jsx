import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { postPublicApi } from "../lib/publicApi";

const INVALID_MESSAGE =
  "This link has expired or has already been used. Please request a new one.";

const ResetAdminPasswordPage = () => {
  const [params] = useSearchParams();
  const token = useMemo(() => String(params.get("token") || "").trim(), [params]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError(INVALID_MESSAGE);
      return;
    }

    if (!newPassword || !confirmPassword) {
      setError("Both password fields are required.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await postPublicApi("/api/admin-password-reset", {
        action: "reset",
        token,
        newPassword,
      });
      setSuccess(true);
    } catch (err) {
      setError(err?.message || INVALID_MESSAGE);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-page min-h-screen bg-black flex items-center justify-center p-4 sm:p-8 md:p-12 font-body">
      <div className="fixed top-8 right-8 text-[10px] tracking-[0.2em] text-white/40 font-mono">
        HMG / 03
      </div>
      <div className="w-full max-w-[960px] h-[520px] bg-[#151921] border border-white/10 flex flex-col md:flex-row shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex-1 p-10 md:p-12 flex flex-col justify-between">
          <div>
            <h1 className="font-logo font-bold text-6xl text-white leading-none tracking-tight normal-case">
              Hamming
            </h1>
            <p className="text-[10px] mt-2 tracking-widest text-white/60 font-medium">
              Reset Admin Password
            </p>
          </div>

          <div className="w-full max-w-[360px]">
            {success ? (
              <div className="space-y-4">
                <p className="text-white text-[11px] tracking-wider leading-relaxed">
                  Admin password updated. You can close this page.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                    <p className="text-red-400 text-[10px] tracking-wide">
                      {error}
                    </p>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[9px] tracking-widest text-white/40">
                    New Admin Password
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      placeholder="New admin password"
                      className="w-full bg-white/5 border border-white/10 px-4 py-3 pr-10 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors rounded-xl text-base sm:text-[11px] tracking-wider"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                      aria-label={
                        showNewPassword ? "Hide new password" : "Show new password"
                      }
                    >
                      {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] tracking-widest text-white/40">
                    Confirm Admin Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirm admin password"
                      className="w-full bg-white/5 border border-white/10 px-4 py-3 pr-10 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors rounded-xl text-base sm:text-[11px] tracking-wider"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
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
                  </div>
                </div>

                <div className="flex flex-col space-y-4 pt-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-white text-black py-3 px-8 text-[10px] tracking-[0.2em] font-medium hover:bg-white/90 transition-all active:scale-[0.98] disabled:opacity-50 rounded-xl"
                  >
                    {loading ? "Updating..." : "Update Admin Password"}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="text-[10px] tracking-widest text-white/40 font-medium">
            Admin Access / 2026
          </div>
        </div>

        <div className="hidden md:block w-5/12 relative overflow-hidden bg-white/10">
          <img
            src="/hero.png"
            alt="Gym Interior"
            className="absolute inset-0 w-full h-full object-cover grayscale-[20%]"
          />
          <div className="absolute inset-0 bg-[#0A0A0A]/5" />
        </div>
      </div>
    </div>
  );
};

export default ResetAdminPasswordPage;
