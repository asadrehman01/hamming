import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate, useLocation } from 'react-router-dom';

const VerifyOtpPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const emailParam = params.get('email');
    if (emailParam) {
      setEmail(emailParam);
    } else {
      navigate('/signup');
    }
  }, [location, navigate]);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setError("Please enter a 6-digit code.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'signup',
      });

      if (verifyError) throw verifyError;

      // Upon success, redirect to dashboard or login
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError(null);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
      });
      if (resendError) throw resendError;
      alert("Verification code resent to your email.");
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 font-body text-white">
      {/* Corner Labels */}
      <div className="fixed top-8 left-8 text-[10px] tracking-[0.2em] text-white/40 uppercase font-mono">
        Verification
      </div>
      <div className="fixed top-8 right-8 text-[10px] tracking-[0.2em] text-white/40 uppercase font-mono">
        HMG / 02-B
      </div>

      <div className="w-full max-w-[480px] bg-[#1A1A1A] border border-white/10 p-12 shadow-2xl animate-in zoom-in-95 duration-500">
        <div className="mb-12 text-center">
          <h1 className="font-logo text-5xl tracking-tight mb-2 uppercase">Verify Account</h1>
          <p className="text-[10px] tracking-[0.2em] text-white/40 uppercase font-mono">
            Check your email: {email}
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-8">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] tracking-widest uppercase font-mono text-center">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <label className="text-[10px] tracking-[0.3em] uppercase font-mono text-white/40 block text-center">Enter 6-Digit Code</label>
            <input
              type="text"
              maxLength="6"
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              className="w-full bg-white/5 border border-white/10 p-6 text-center text-4xl tracking-[0.5em] font-mono focus:outline-none focus:border-white/30 transition-all text-white placeholder:text-white/5"
              placeholder="000000"
              autoFocus
            />
          </div>

          <div className="pt-4 flex flex-col gap-4">
            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full bg-white text-black p-5 text-[11px] tracking-[0.3em] uppercase font-bold hover:bg-white/90 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Complete Registration'}
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-[9px] tracking-widest text-white/40 uppercase font-medium hover:text-white transition-colors"
            >
              {resending ? 'Sending...' : "Didn't receive code? Resend"}
            </button>
          </div>
        </form>

        <div className="mt-12 pt-8 border-t border-white/5 text-center">
          <button 
            onClick={() => navigate('/signup')}
            className="text-[9px] tracking-widest text-white/20 uppercase font-mono hover:text-white/40 transition-colors"
          >
            ← Change Email
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerifyOtpPage;
