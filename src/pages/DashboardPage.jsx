import React from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

const DashboardPage = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-black flex flex-col font-body text-white">
      {/* Navigation Bar */}
      <nav className="p-8 flex justify-between items-center border-b border-white/10">
        <div>
          <h1 className="font-logo text-3xl tracking-tight">Hamming<sup>©</sup></h1>
        </div>
        <div className="flex gap-8 items-center">
          <span className="text-[10px] tracking-[0.2em] uppercase font-mono text-white/40">HMG / DASH</span>
          <button 
            onClick={handleLogout}
            className="text-[10px] tracking-[0.2em] uppercase font-medium hover:text-white/60 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-8 md:p-12 lg:p-24 flex flex-col items-center justify-center">
        <div className="w-full max-w-[1200px] text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <h2 className="text-7xl md:text-9xl font-logo tracking-tighter text-white">
            Dashboard
          </h2>
          <p className="text-[10px] tracking-[0.3em] uppercase text-white/40 max-w-lg mx-auto leading-relaxed">
            Welcome to the 3rd Edition workspace. Features and services will be available here shortly as we continue to build our vision.
          </p>
          <div className="pt-12 flex flex-col items-center gap-6">
            <button 
              onClick={() => navigate('/customers')}
              className="bg-white text-black px-8 py-3 text-[10px] tracking-[0.3em] uppercase font-bold hover:bg-white/90 transition-all active:scale-[0.98] w-full max-w-[280px]"
            >
              Customer Directory
            </button>
            <button 
              onClick={() => navigate('/transactions')}
              className="bg-white/5 text-white border border-white/10 px-8 py-3 text-[10px] tracking-[0.3em] uppercase font-bold hover:bg-white/10 transition-all active:scale-[0.98] w-full max-w-[280px]"
            >
              Transactions
            </button>
            <div className="w-24 h-[1px] bg-white/20" />
          </div>
        </div>
      </main>

      {/* Footer / Corner Info */}
      <footer className="p-8 flex justify-between items-center">
        <div className="text-[10px] tracking-widest text-white/20 uppercase font-medium">
          Workspace Access / 2026
        </div>
        <div className="text-[10px] tracking-widest text-white/20 uppercase font-mono">
          V 3.0.1
        </div>
      </footer>
    </div>
  );
};

export default DashboardPage;
