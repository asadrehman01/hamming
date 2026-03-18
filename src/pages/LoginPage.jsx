import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Link, useNavigate } from 'react-router-dom';

const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!supabase) {
      setError("Supabase client not initialized.");
      return;
    }
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError(signInError.message);
    } else {
      navigate('/dashboard');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 sm:p-8 md:p-12 font-body">
      {/* Corner Labels */}
      <div className="fixed top-8 left-8 text-[10px] tracking-[0.2em] text-white/40 uppercase font-mono">
        Inspirations
      </div>
      <div className="fixed top-8 right-8 text-[10px] tracking-[0.2em] text-white/40 uppercase font-mono">
        HMG / 01
      </div>

      <div className="w-full max-w-[1200px] h-[600px] bg-[#E8E0D5] flex flex-col md:flex-row shadow-2xl overflow-hidden relative group">

        {/* Left Side: Branding & Form */}
        <div className="flex-1 p-12 flex flex-col justify-between">
          <div>
            <h1 className="font-logo text-7xl text-[#0A0A0A] leading-none tracking-tight">
              Hamming<sup>©</sup>
            </h1>
            <p className="text-[10px] mt-2 uppercase tracking-widest text-[#6B6360] font-medium">
              3rd Edition
            </p>
          </div>

          <div className="w-full max-w-[320px]">
            <form onSubmit={handleLogin} className="space-y-6">
              {error && (
                <p className="text-red-600 text-[10px] uppercase tracking-wider mb-4">{error}</p>
              )}
              <div className="space-y-1">
                <input
                  type="email"
                  placeholder="EMAIL ADDRESS"
                  className="w-full bg-transparent border-b border-[#0A0A0A]/20 py-2 focus:border-[#0A0A0A] outline-none text-[11px] tracking-wider transition-colors placeholder:text-[#0A0A0A]/30"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <input
                  type="password"
                  placeholder="PASSWORD"
                  className="w-full bg-transparent border-b border-[#0A0A0A]/20 py-2 focus:border-[#0A0A0A] outline-none text-[11px] tracking-wider transition-colors placeholder:text-[#0A0A0A]/30"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col space-y-4 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-[#0A0A0A] text-white py-3 px-8 text-[10px] tracking-[0.2em] uppercase font-medium hover:bg-black transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Sign In'}
                </button>
                <a href="#" className="text-[9px] tracking-widest text-[#6B6360] uppercase font-medium hover:text-[#0A0A0A] transition-colors">
                  Forgot Password?
                </a>
                <Link to="/signup" className="text-[9px] tracking-widest text-[#6B6360] uppercase font-medium hover:text-[#0A0A0A] transition-colors">
                  Create an Account
                </Link>
              </div>
            </form>
          </div>

          <div className="text-[10px] tracking-widest text-[#6B6360] uppercase font-medium">
            Member Access / 2026
          </div>
        </div>

        {/* Right Side: Hero Image */}
        <div className="hidden md:block w-5/12 relative overflow-hidden bg-white/10">
          <img
            src="/hero.png"
            alt="Gym Interior"
            className="absolute inset-0 w-full h-full object-cover grayscale-[20%] group-hover:scale-105 transition-transform duration-[2s]"
          />
          <div className="absolute inset-0 bg-[#0A0A0A]/5" />
        </div>

      </div>
    </div>
  );
};

export default LoginPage;
