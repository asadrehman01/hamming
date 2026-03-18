import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import CustomerModal from '../components/CustomerModal';
import ClientDocsModal from '../components/ClientDocsModal';

const CustomersPage = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const menuRef = useRef(null);

  // Initial mock data as requested
  const mockCustomers = [
    { id: 'mock-1', first_name: 'Shayaan', last_name: 'Shaikh', email: 'shayaan@example.com', phone: '1234567890', created_at: new Date().toISOString() },
    { id: 'mock-2', first_name: 'Ayaan', last_name: 'Shaikh', email: 'ayaan@example.com', phone: '0987654321', created_at: new Date().toISOString() },
  ];

  useEffect(() => {
    fetchCustomers();
    
    // Click outside to close menu
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNewModal = () => {
    setEditingCustomer(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (customer) => {
    setEditingCustomer(customer);
    setIsModalOpen(true);
    setActiveMenuId(null);
  };

  const handleOpenDocsModal = (customer) => {
    setEditingCustomer(customer);
    setIsDocsModalOpen(true);
    setActiveMenuId(null);
  };

  const handleCustomerSaved = (savedCustomer) => {
    if (editingCustomer) {
      setCustomers(customers.map(c => c.id === savedCustomer.id ? savedCustomer : c));
    } else {
      setCustomers([savedCustomer, ...customers]);
    }
  };

  const toggleMenu = (e, id) => {
    e.stopPropagation();
    setActiveMenuId(activeMenuId === id ? null : id);
  };

  const displayCustomers = customers.length > 0 ? customers : (loading ? [] : mockCustomers);

  return (
    <div className="min-h-screen bg-black flex flex-col font-body text-white">
      {/* Navigation Bar */}
      <nav className="p-8 flex justify-between items-center border-b border-white/10">
        <div className="cursor-pointer" onClick={() => navigate('/dashboard')}>
          <h1 className="font-logo text-3xl tracking-tight">Hamming<sup>©</sup></h1>
        </div>
        <div className="flex gap-8 items-center">
          <span className="text-[10px] tracking-[0.2em] uppercase font-mono text-white/40">HMG / CRM / CUSTOMERS</span>
          <button 
            onClick={handleOpenNewModal}
            className="bg-white text-black px-6 py-2 text-[10px] tracking-[0.2em] uppercase font-bold hover:bg-white/80 transition-all active:scale-[0.98]"
          >
            New Application
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-8 md:p-12 lg:p-24 overflow-x-auto">
        <div className="w-full max-w-[1200px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <div className="mb-12">
            <h2 className="text-5xl md:text-7xl font-logo tracking-tighter text-white uppercase">
              Customer Directory
            </h2>
            <div className="w-24 h-[1px] bg-white/20 mt-6" />
          </div>

          <div className="border border-white/10">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="p-6 text-[10px] tracking-[0.2em] uppercase font-mono text-white/40">Name</th>
                  <th className="p-6 text-[10px] tracking-[0.2em] uppercase font-mono text-white/40">Email</th>
                  <th className="p-6 text-[10px] tracking-[0.2em] uppercase font-mono text-white/40">Phone</th>
                  <th className="p-6 text-[10px] tracking-[0.2em] uppercase font-mono text-white/40">Membership</th>
                  <th className="p-6 text-[10px] tracking-[0.2em] uppercase font-mono text-white/40 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayCustomers.map((customer) => (
                  <tr key={customer.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                    <td className="p-6">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium tracking-tight uppercase">
                          {customer.first_name} {customer.last_name}
                        </span>
                        <span className="text-[9px] text-white/20 font-mono tracking-widest mt-1">ID: {customer.id.substring(0, 8).toUpperCase()}</span>
                      </div>
                    </td>
                    <td className="p-6 text-sm text-white/60 font-body lowercase tracking-tight">
                      {customer.email}
                    </td>
                    <td className="p-6 text-sm text-white/60 font-mono tracking-tight">
                      {customer.phone}
                    </td>
                    <td className="p-6">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-white tracking-widest uppercase font-bold">
                          {customer.membership_duration || 'N/A'}
                        </span>
                        <span className="text-[9px] text-white/40 font-mono mt-1">
                          UNTIL {customer.membership_end_date ? new Date(customer.membership_end_date).toLocaleDateString() : '---'}
                        </span>
                      </div>
                    </td>
                    <td className="p-6 text-right relative">
                      <button 
                        onClick={(e) => toggleMenu(e, customer.id)}
                        className="text-white/40 hover:text-white transition-colors p-2"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <circle cx="8" cy="3" r="1.5" />
                          <circle cx="8" cy="8" r="1.5" />
                          <circle cx="8" cy="13" r="1.5" />
                        </svg>
                      </button>

                      {activeMenuId === customer.id && (
                        <div 
                          ref={menuRef}
                          className="absolute right-6 top-12 z-10 w-48 bg-[#1A1A1A] border border-white/10 shadow-3xl animate-in fade-in zoom-in-95 duration-200"
                        >
                          <button
                            onClick={() => handleOpenEditModal(customer)}
                            className="w-full text-left p-4 text-[10px] tracking-[0.2em] uppercase font-mono text-white/60 hover:text-white hover:bg-white/5 transition-colors border-b border-white/5"
                          >
                            Edit Information
                          </button>
                          <button
                            onClick={() => handleOpenDocsModal(customer)}
                            className="w-full text-left p-4 text-[10px] tracking-[0.2em] uppercase font-mono text-white/60 hover:text-white hover:bg-white/5 transition-colors border-b border-white/5"
                          >
                            Client Docs
                          </button>
                          <button
                            disabled
                            className="w-full text-left p-4 text-[10px] tracking-[0.2em] uppercase font-mono text-white/20 cursor-not-allowed"
                          >
                            View Analytics
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {loading && customers.length === 0 && (
              <div className="p-24 text-center">
                <span className="text-[10px] tracking-[0.5em] uppercase text-white/20 animate-pulse font-mono font-medium">Synchronizing Workspace...</span>
              </div>
            )}
            
            {!loading && displayCustomers.length === 0 && (
              <div className="p-24 text-center text-white/20 flex flex-col items-center gap-4">
                <span className="text-[10px] tracking-[0.3em] uppercase font-mono font-medium">No Customer Records Found</span>
                <button 
                  onClick={handleOpenNewModal}
                  className="text-[10px] tracking-[0.2em] uppercase font-medium text-white/60 hover:text-white underline underline-offset-4"
                >
                  Create Initial Application
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-8 flex justify-between items-center opacity-40">
        <div className="text-[10px] tracking-widest text-white uppercase font-medium">
          Workspace Access / CRM Layer
        </div>
        <div className="text-[10px] tracking-widest text-white uppercase font-mono">
          SYSTEM.UPTIME 99.9%
        </div>
      </footer>

      {/* Customer Modal */}
      <CustomerModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onCustomerSaved={handleCustomerSaved}
        initialData={editingCustomer}
      />

      {/* Client Documents Modal */}
      <ClientDocsModal
        isOpen={isDocsModalOpen}
        onClose={() => setIsDocsModalOpen(false)}
        customer={editingCustomer}
        onDocsUpdated={handleCustomerSaved}
      />
    </div>
  );
};

export default CustomersPage;
