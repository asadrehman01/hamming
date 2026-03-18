import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

const TransactionsPage = () => {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Fetch payments with joined subscription and customer data
      const { data, error } = await supabase
        .from('payments')
        .select(`
          id,
          amount,
          status,
          created_at,
          subscriptions (
            plan_name,
            customers (
              first_name,
              last_name
            )
          )
        `)
        .eq('gym_id', user.id) // Assuming gym_id matches user.id based on previous logic
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col font-body text-white">
      {/* Navigation Bar */}
      <nav className="p-8 flex justify-between items-center border-b border-white/10">
        <div className="cursor-pointer" onClick={() => navigate('/dashboard')}>
          <h1 className="font-logo text-3xl tracking-tight">Hamming<sup>©</sup></h1>
        </div>
        <div className="flex gap-8 items-center">
          <span className="text-[10px] tracking-[0.2em] uppercase font-mono text-white/40">HMG / CRM / TRANSACTIONS</span>
          <button 
            onClick={() => navigate('/dashboard')}
            className="bg-white/5 text-white border border-white/10 px-6 py-2 text-[10px] tracking-[0.2em] uppercase font-bold hover:bg-white/10 transition-all active:scale-[0.98]"
          >
            Back to Desk
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-8 md:p-12 lg:p-24 overflow-x-auto">
        <div className="w-full max-w-[1200px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <div className="mb-12">
            <h2 className="text-5xl md:text-7xl font-logo tracking-tighter text-white uppercase">
              Transaction History
            </h2>
            <div className="w-24 h-[1px] bg-white/20 mt-6" />
          </div>

          <div className="border border-white/10 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="p-6 text-[10px] tracking-[0.2em] uppercase font-mono text-white/40">Transaction ID</th>
                  <th className="p-6 text-[10px] tracking-[0.2em] uppercase font-mono text-white/40">Customer</th>
                  <th className="p-6 text-[10px] tracking-[0.2em] uppercase font-mono text-white/40">Amount</th>
                  <th className="p-6 text-[10px] tracking-[0.2em] uppercase font-mono text-white/40">Date</th>
                  <th className="p-6 text-[10px] tracking-[0.2em] uppercase font-mono text-white/40 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                    <td className="p-6">
                      <span className="text-[10px] text-white/40 font-mono tracking-widest uppercase">
                        #TX-{tx.id.substring(0, 8).toUpperCase()}
                      </span>
                    </td>
                    <td className="p-6">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium tracking-tight uppercase text-white/40">
                          {tx.subscriptions?.customers 
                            ? `${tx.subscriptions.customers.first_name} ${tx.subscriptions.customers.last_name}`
                            : 'N/A'}
                        </span>
                        <span className="text-[9px] text-white/20 font-mono tracking-widest mt-1">
                          Plan: {tx.subscriptions?.plan_name || 'Individual'}
                        </span>
                      </div>
                    </td>
                    <td className="p-6">
                      <span className="text-sm font-bold text-white/40 tracking-widest">
                        ₹{tx.amount || '0'}
                      </span>
                    </td>
                    <td className="p-6 text-sm text-white/40 font-mono">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-6 text-right">
                      <span className={`text-[9px] tracking-[0.2em] uppercase font-bold px-3 py-1 border ${
                        tx.status === 'completed' 
                        ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' 
                        : 'text-amber-500 bg-amber-500/10 border-amber-500/20'
                      }`}>
                        {tx.status || 'COMPLETED'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {loading && (
              <div className="p-24 text-center">
                <span className="text-[10px] tracking-[0.5em] uppercase text-white/20 animate-pulse font-mono font-medium">Downloading Ledger...</span>
              </div>
            )}
            
            {!loading && transactions.length === 0 && (
              <div className="p-24 text-center text-white/40 flex flex-col items-center gap-4">
                <span className="text-[10px] tracking-[0.3em] uppercase font-mono font-medium">No Recent Transactions Found</span>
                <span className="text-[9px] uppercase tracking-widest">Transactions will appear here once applications are processed and paid.</span>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-8 flex justify-between items-center opacity-40">
        <div className="text-[10px] tracking-widest text-white uppercase font-medium">
          FINANCIAL LAYER / LEDGER ACCESS
        </div>
        <div className="text-[10px] tracking-widest text-white uppercase font-mono">
          SECURE ENCRYPTION ENABLED
        </div>
      </footer>
    </div>
  );
};

export default TransactionsPage;
