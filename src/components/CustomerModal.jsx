import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const CustomerModal = ({ isOpen, onClose, onCustomerSaved, initialData = null }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [duration, setDuration] = useState('1 MONTH');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Memoized date calculation
  const calculateEndDate = useCallback((start, dur) => {
    if (!start) return '';
    const date = new Date(start);
    const [amount, unit] = dur.split(' ');
    
    if (unit === 'MONTH' || unit === 'MONTHS') {
      date.setMonth(date.getMonth() + parseInt(amount));
    } else if (unit === 'YEAR') {
      date.setFullYear(date.getFullYear() + 1);
    }
    
    // Format to YYYY-MM-DD for date input
    return date.toISOString().split('T')[0];
  }, []);

  useEffect(() => {
    if (initialData) {
      setFirstName(initialData.first_name || '');
      setLastName(initialData.last_name || '');
      setEmail(initialData.email || '');
      setPhone(initialData.phone || '');
      setDuration(initialData.membership_duration || '1 MONTH');
      setStartDate(initialData.membership_start_date || '');
      setEndDate(initialData.membership_end_date || '');
    } else {
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
      setDuration('1 MONTH');
      const today = new Date().toISOString().split('T')[0];
      setStartDate(today);
      setEndDate(calculateEndDate(today, '1 MONTH'));
    }
  }, [initialData, isOpen, calculateEndDate]);

  // Handle start date or duration change
  useEffect(() => {
    if (startDate && duration) {
      setEndDate(calculateEndDate(startDate, duration));
    }
  }, [startDate, duration, calculateEndDate]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      let gymId;
      if (!initialData) {
        let { data: gymData, error: gymError } = await supabase
          .from('gyms')
          .select('id')
          .eq('id', user.id)
          .single();

        if (gymError && gymError.code === 'PGRST116') {
          const { data: newGym, error: createGymError } = await supabase
            .from('gyms')
            .insert([{ id: user.id, name: 'MY GYM' }])
            .select()
            .single();
          
          if (createGymError) throw createGymError;
          gymId = newGym.id;
        } else if (gymError) {
          throw gymError;
        } else {
          gymId = gymData.id;
        }
      }

      const payload = { 
        first_name: firstName, 
        last_name: lastName, 
        email, 
        phone,
        membership_duration: duration,
        membership_start_date: startDate,
        membership_end_date: endDate,
        updated_at: new Date().toISOString()
      };

      let resultData;
      if (initialData) {
        const { data, error: updateError } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', initialData.id)
          .select();

        if (updateError) throw updateError;
        resultData = data[0];
      } else {
        const { data, error: insertError } = await supabase
          .from('customers')
          .insert([{ ...payload, gym_id: gymId }])
          .select();

        if (insertError) throw insertError;
        resultData = data[0];
      }

      onCustomerSaved(resultData);
      onClose();
    } catch (err) {
      console.error('Error saving customer:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-[#1A1A1A] border border-white/10 w-full max-w-lg p-8 shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="flex justify-between items-center mb-8">
          <h2 className="font-logo text-3xl tracking-tight text-white uppercase">
            {initialData ? 'Update Information' : 'New Application'}
          </h2>
          <button 
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors uppercase text-[10px] tracking-widest font-mono"
          >
            Close [ESC]
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] tracking-widest uppercase font-mono">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] tracking-[0.2em] uppercase font-mono text-white/40 block">First Name</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-4 text-white text-sm focus:outline-none focus:border-white/30 transition-colors font-body"
                placeholder="SHAYAAN"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] tracking-[0.2em] uppercase font-mono text-white/40 block">Last Name</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-4 text-white text-sm focus:outline-none focus:border-white/30 transition-colors font-body"
                placeholder="SHAIKH"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] tracking-[0.2em] uppercase font-mono text-white/40 block">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-4 text-white text-sm focus:outline-none focus:border-white/30 transition-colors font-body"
                placeholder="HELLO@HAMMING.CO"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] tracking-[0.2em] uppercase font-mono text-white/40 block">Phone Number</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-4 text-white text-sm focus:outline-none focus:border-white/30 transition-colors font-body"
                placeholder="+91 00000 00000"
              />
            </div>
          </div>

          <div className="w-full h-[1px] bg-white/10 my-4" />

          <div className="space-y-2">
            <label className="text-[10px] tracking-[0.2em] uppercase font-mono text-white/40 block">Membership Duration</label>
            <div className="relative">
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-4 text-white text-sm focus:outline-none focus:border-white/30 transition-colors font-body appearance-none cursor-pointer"
              >
                <option value="1 MONTH" className="bg-[#1A1A1A] text-white">1 MONTH</option>
                <option value="3 MONTHS" className="bg-[#1A1A1A] text-white">3 MONTHS</option>
                <option value="6 MONTHS" className="bg-[#1A1A1A] text-white">6 MONTHS</option>
                <option value="1 YEAR" className="bg-[#1A1A1A] text-white">1 YEAR</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/20">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 4L6 8L10 4" />
                </svg>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] tracking-[0.2em] uppercase font-mono text-white/40 block">Start Date</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-4 text-white text-sm focus:outline-none focus:border-white/30 transition-colors font-body [color-scheme:dark]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] tracking-[0.2em] uppercase font-mono text-white/40 block">End Date (Auto)</label>
              <input
                type="date"
                readOnly
                value={endDate}
                className="w-full bg-white/5 border border-white/10 p-4 text-white/40 text-sm focus:outline-none font-body cursor-not-allowed [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black p-5 text-[10px] tracking-[0.3em] uppercase font-bold hover:bg-white/90 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'PROCESSING...' : (initialData ? 'SAVE CHANGES' : 'SUBMIT APPLICATION')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CustomerModal;
