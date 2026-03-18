import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const ClientDocsModal = ({ isOpen, onClose, customer, onDocsUpdated }) => {
  const [photo, setPhoto] = useState(null);
  const [aadhaar, setAadhaar] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [aadhaarPreview, setAadhaarPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSignedUrls = async () => {
      if (customer && isOpen) {
        try {
          if (customer.photo_url) {
            // Extract path from public URL if needed, or assume it's stored as a path
            // For now, let's assume photo_url stores the path or we can derive it
            const photoPath = extractPath(customer.photo_url);
            const { data: photoData, error: photoError } = await supabase.storage
              .from('customer-docs')
              .createSignedUrl(photoPath, 3600); // 1 hour
            if (!photoError) setPhotoPreview(photoData.signedUrl);
          } else {
            setPhotoPreview(null);
          }

          if (customer.aadhaar_url) {
            const aadhaarPath = extractPath(customer.aadhaar_url);
            const { data: aadhaarData, error: aadhaarError } = await supabase.storage
              .from('customer-docs')
              .createSignedUrl(aadhaarPath, 3600);
            if (!aadhaarError) setAadhaarPreview(aadhaarData.signedUrl);
          } else {
            setAadhaarPreview(null);
          }
        } catch (err) {
          console.error('Error fetching signed URLs:', err);
        }
      }
    };

    fetchSignedUrls();
  }, [customer, isOpen]);

  const extractPath = (url) => {
    if (!url) return '';
    // If it's a full URL, we need to extract the path after 'customer-docs/'
    if (url.includes('customer-docs/')) {
      return url.split('customer-docs/')[1];
    }
    return url; // Assume it's already a path
  };

  if (!isOpen || !customer) return null;

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (file) {
      if (type === 'photo') {
        setPhoto(file);
        setPhotoPreview(URL.createObjectURL(file));
      } else {
        setAadhaar(file);
        setAadhaarPreview(URL.createObjectURL(file));
      }
    }
  };

  const uploadFile = async (file, type) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${customer.id}/${type}_${Date.now()}.${fileExt}`;
    // Path: gym_id/customer_id/doc_type_timestamp.ext
    const filePath = `${customer.gym_id}/${fileName}`;

    const { error: uploadError, data } = await supabase.storage
      .from('customer-docs')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // Use a signed URL or public URL depending on the bucket accessibility
    // Since the bucket is private, we will either need a signed URL 
    // or rely on the Supabase session to fetch the source directly.
    // For now, let's use the public URL but the policy will restrict access.
    const { data: { publicUrl } } = supabase.storage
      .from('customer-docs')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSave = async () => {
    setUploading(true);
    setError(null);

    try {
      let newPhotoUrl = customer.photo_url;
      let newAadhaarUrl = customer.aadhaar_url;

      if (photo) {
        newPhotoUrl = await uploadFile(photo, 'photo');
      }

      if (aadhaar) {
        newAadhaarUrl = await uploadFile(aadhaar, 'aadhaar');
      }

      const { data, error: updateError } = await supabase
        .from('customers')
        .update({
          photo_url: newPhotoUrl,
          aadhaar_url: newAadhaarUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', customer.id)
        .select()
        .single();

      if (updateError) throw updateError;

      onDocsUpdated(data);
      onClose();
    } catch (err) {
      console.error('Error uploading docs:', err);
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-[#1A1A1A] border border-white/10 w-full max-w-2xl p-8 shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="font-logo text-3xl tracking-tight text-white uppercase">Client Documents</h2>
            <p className="text-[10px] tracking-widest text-white/40 uppercase font-mono mt-1">
              Customer: {customer.first_name} {customer.last_name}
            </p>
          </div>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* Photo Upload */}
          <div className="space-y-4">
            <label className="text-[10px] tracking-[0.2em] uppercase font-mono text-white/40 block">Client Photo</label>
            <div className="aspect-square bg-white/5 border border-dashed border-white/10 flex items-center justify-center relative overflow-hidden group">
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center p-6 space-y-2">
                  <svg className="mx-auto w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-[9px] uppercase tracking-widest text-white/20 block">Select Image</span>
                </div>
              )}
              <input 
                type="file" 
                accept="image/*" 
                onChange={(e) => handleFileChange(e, 'photo')}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
          </div>

          {/* Aadhaar Upload */}
          <div className="space-y-4">
            <label className="text-[10px] tracking-[0.2em] uppercase font-mono text-white/40 block">Aadhaar Card (Front/Back)</label>
            <div className="aspect-[1.58/1] bg-white/5 border border-dashed border-white/10 flex items-center justify-center relative overflow-hidden group">
              {aadhaarPreview ? (
                <img src={aadhaarPreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center p-6 space-y-2">
                  <svg className="mx-auto w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-[9px] uppercase tracking-widest text-white/20 block">Select Document</span>
                </div>
              )}
              <input 
                type="file" 
                accept="image/*,application/pdf" 
                onChange={(e) => handleFileChange(e, 'aadhaar')}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={handleSave}
            disabled={uploading || (!photo && !aadhaar)}
            className="flex-1 bg-white text-black p-5 text-[10px] tracking-[0.3em] uppercase font-bold hover:bg-white/90 transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {uploading ? 'UPLOADING...' : 'SAVE DOCUMENTS'}
          </button>
        </div>
        
        <p className="mt-4 text-[9px] tracking-[0.1em] text-center text-white/20 uppercase font-mono">
          All documents are encrypted and stored securely in our private workspace.
        </p>
      </div>
    </div>
  );
};

export default ClientDocsModal;
