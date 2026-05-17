import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { getUserWithRetry } from "../lib/authUser";
import SecureImage from "./SecureImage";

const TrainerModal = ({
  isOpen,
  onClose,
  onTrainerSaved,
  initialData = null,
}) => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [aadhaarPhoto, setAadhaarPhoto] = useState(null);
  const [aadhaarPreview, setAadhaarPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);
  const aadhaarInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      setFirstName(initialData.first_name || "");
      setLastName(initialData.last_name || "");
      setEmail(initialData.email || "");
      setPhone(initialData.phone || "");
      setPhotoPreview(initialData.photo_url || null);
      setAadhaarPreview(initialData.aadhaar_url || null);
    } else {
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setPhotoPreview(null);
      setAadhaarPreview(null);
    }

    setPhoto(null);
    setAadhaarPhoto(null);
    setError(null);
  }, [isOpen, initialData]);

  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleEsc);
    }

    return () => {
      window.removeEventListener("keydown", handleEsc);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    return () => {
      if (photoPreview && photoPreview.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
      if (aadhaarPreview && aadhaarPreview.startsWith("blob:")) {
        URL.revokeObjectURL(aadhaarPreview);
      }
    };
  }, [photoPreview, aadhaarPreview]);

  if (!isOpen) return null;

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError("Photo size should be less than 2MB");
      return;
    }

    setError(null);
    if (photoPreview && photoPreview.startsWith("blob:")) {
      URL.revokeObjectURL(photoPreview);
    }

    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleAadhaarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image document.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("Document size should be less than 2MB");
      return;
    }

    setError(null);
    if (aadhaarPreview && aadhaarPreview.startsWith("blob:")) {
      URL.revokeObjectURL(aadhaarPreview);
    }

    setAadhaarPhoto(file);
    setAadhaarPreview(URL.createObjectURL(file));
  };

  const uploadFile = async (file, gymId, trainerId, kind) => {
    const fileExt = file.name.split(".").pop();
    const filePath = `${gymId}/trainers/${trainerId}/${kind}_${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("customer-docs")
      .upload(filePath, file, { cacheControl: "3600", upsert: true });

    if (uploadError) throw uploadError;
    return filePath;
  };

  const deleteFile = async (filePath) => {
    if (!filePath) return;

    const { error: removeError } = await supabase.storage
      .from("customer-docs")
      .remove([filePath]);

    if (removeError) {
      console.error("Failed to cleanup uploaded file:", removeError?.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !email.trim() ||
      !phone.trim()
    ) {
      setError("Please fill all required fields.");
      return;
    }

    setLoading(true);
    setError(null);
    const uploadedPaths = [];

    try {
      const {
        data: { user },
        error: userError,
      } = await getUserWithRetry(supabase);

      if (userError) throw userError;
      if (!user?.id) throw new Error("User not authenticated");

      const gymId = initialData?.gym_id || user.id;
      const baseId = initialData?.id || `new_${Date.now()}`;

      let photoUrl = initialData?.photo_url || null;
      let aadhaarUrl = initialData?.aadhaar_url || null;

      if (photo) {
        photoUrl = await uploadFile(photo, gymId, baseId, "photo");
        uploadedPaths.push(photoUrl);
      }

      if (aadhaarPhoto) {
        aadhaarUrl = await uploadFile(aadhaarPhoto, gymId, baseId, "aadhaar");
        uploadedPaths.push(aadhaarUrl);
      }

      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        photo_url: photoUrl,
        aadhaar_url: aadhaarUrl,
        updated_at: new Date().toISOString(),
      };

      let savedRow;
      if (initialData?.id) {
        const { data, error: updateError } = await supabase
          .from("trainers")
          .update(payload)
          .eq("id", initialData.id)
          .select()
          .single();

        if (updateError) throw updateError;
        savedRow = data;
      } else {
        const { data, error: insertError } = await supabase
          .from("trainers")
          .insert([{ ...payload, gym_id: gymId }])
          .select()
          .single();

        if (insertError) throw insertError;
        savedRow = data;
      }

      onTrainerSaved(savedRow);
      onClose();
    } catch (err) {
      for (const path of uploadedPaths) {
        // Roll back newly uploaded files when DB write fails.
        await deleteFile(path);
      }
      console.error("Failed to save trainer:", {
        message: err?.message,
        code: err?.code,
      });
      setError(err.message || "Failed to save trainer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl bg-[#1A1A1A] border border-white/10 shadow-2xl">
        <div className="p-5 sm:p-8 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="font-logo text-2xl sm:text-3xl tracking-tight text-white normal-case">
              {initialData ? "Edit Trainer" : "New Trainer"}
            </h2>
            <p className="text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/35 mt-1">
              Trainer Information
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="native-inline-btn text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/50 hover:text-white"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-8 space-y-6">
          {error && (
            <div className="p-3 border border-red-500/30 bg-red-500/10 text-red-400 text-[10px] tracking-[0.08em] dm-sans-light-008">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full bg-transparent border-b border-white/15 py-2 text-sm text-white placeholder:text-white/25 outline-none dm-sans-light-008"
              required
            />
            <input
              type="text"
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full bg-transparent border-b border-white/15 py-2 text-sm text-white placeholder:text-white/25 outline-none dm-sans-light-008"
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent border-b border-white/15 py-2 text-sm text-white placeholder:text-white/25 outline-none lowercase dm-sans-light-008"
              required
            />
            <input
              type="text"
              placeholder="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-transparent border-b border-white/15 py-2 text-sm text-white placeholder:text-white/25 outline-none dm-sans-light-008"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-3">
              <p className="text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/40">
                Photo
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="native-inline-btn w-full"
              >
                <div className="h-36 border border-dashed border-white/15 bg-white/[0.03] flex items-center justify-center overflow-hidden">
                  {photoPreview ? (
                    photoPreview.startsWith("blob:") ? (
                      <img
                        src={photoPreview}
                        alt="Trainer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <SecureImage
                        filePath={photoPreview}
                        className="w-full h-full"
                      />
                    )
                  ) : (
                    <span className="text-[10px] text-white/30 tracking-[0.08em] dm-sans-light-008">
                      Select photo
                    </span>
                  )}
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />
            </div>

            <div className="space-y-3">
              <p className="text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/40">
                Id Document
              </p>
              <button
                type="button"
                onClick={() => aadhaarInputRef.current?.click()}
                className="native-inline-btn w-full"
              >
                <div className="h-36 border border-dashed border-white/15 bg-white/[0.03] flex items-center justify-center overflow-hidden">
                  {aadhaarPreview ? (
                    aadhaarPreview.startsWith("blob:") ? (
                      <img
                        src={aadhaarPreview}
                        alt="Document"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <SecureImage
                        filePath={aadhaarPreview}
                        className="w-full h-full"
                      />
                    )
                  ) : (
                    <span className="text-[10px] text-white/30 tracking-[0.08em] dm-sans-light-008">
                      Select document
                    </span>
                  )}
                </div>
              </button>
              <input
                ref={aadhaarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAadhaarChange}
                className="hidden"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="modal-submit-btn w-full py-4 text-[10px] tracking-[0.08em] dm-sans-light-008 font-medium disabled:opacity-40"
          >
            {loading
              ? "Saving..."
              : initialData
                ? "Save trainer"
                : "Create trainer"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default TrainerModal;

