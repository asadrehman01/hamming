import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import SecureImage from "./SecureImage";
const CustomerModal = ({
  isOpen,
  onClose,
  onCustomerSaved,
  initialData = null,
  isRenewal = false,
}) => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [duration, setDuration] = useState("1 MONTH");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [aadhaarPhoto, setAadhaarPhoto] = useState(null);
  const [aadhaarPreview, setAadhaarPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const aadhaarInputRef = useRef(null);
  // Helper to calculate end date based on plan - wrapped in useCallback for stability
  const calculateEndDate = useCallback((start, dur) => {
    if (!start || !dur) return "";
    try {
      const startDate = new Date(start);
      if (isNaN(startDate.getTime())) return "";
      // Handle invalid date input
      const endDate = new Date(startDate);
      if (dur === "1 MONTH") {
        endDate.setMonth(startDate.getMonth() + 1);
      } else if (dur === "3 MONTHS") {
        endDate.setMonth(startDate.getMonth() + 3);
      } else if (dur === "6 MONTHS") {
        endDate.setMonth(startDate.getMonth() + 6);
      } else if (dur === "1 YEAR") {
        endDate.setFullYear(startDate.getFullYear() + 1);
      }
      // Adjust for cases like January 31st -> February 28th
      if (endDate.getDate() !== startDate.getDate()) {
        endDate.setDate(0);
      }
      return endDate.toISOString().split("T")[0];
    } catch (err) {
      console.error("Error calculating end date:", err);
      return "";
    }
  }, []);
  useEffect(() => {
    if (isOpen && initialData) {
      console.log("Loading Initial Data for Edit/Renew, ID:", initialData?.id);
      setFirstName(initialData.first_name || "");
      setLastName(initialData.last_name || "");
      setEmail(initialData.email || "");
      setPhone(initialData.phone || "");
      setDuration(initialData.membership_duration || "1 MONTH");
      setStartDate(initialData.membership_start_date || "");
      setEndDate(initialData.membership_end_date || "");
      setPhotoPreview(initialData.photo_url || null);
      setPhoto(null);
      setAadhaarPreview(initialData.aadhaar_url || null);
      setAadhaarPhoto(null);
    } else if (isOpen) {
      console.log("Initializing New Application");
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setDuration("1 MONTH");
      const today = new Date().toISOString().split("T")[0];
      setStartDate(today);
      setEndDate(calculateEndDate(today, "1 MONTH"));
      setPhotoPreview(null);
      setPhoto(null);
      setAadhaarPreview(null);
      setAadhaarPhoto(null);
    }
  }, [isOpen, initialData, calculateEndDate]);
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
  // Handle start date or duration change
  useEffect(() => {
    if (startDate && duration) {
      const calculated = calculateEndDate(startDate, duration);
      console.log("Recalculating End Date:", {
        startDate,
        duration,
        result: calculated,
      });
      setEndDate(calculated);
    }
  }, [startDate, duration, calculateEndDate]);
  useEffect(() => {
    return () => {
      if (photoPreview && photoPreview.startsWith("blob:"))
        URL.revokeObjectURL(photoPreview);
      if (aadhaarPreview && aadhaarPreview.startsWith("blob:"))
        URL.revokeObjectURL(aadhaarPreview);
    };
  }, [photoPreview, aadhaarPreview]);
  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setError("Photo size should be less than 2MB");
        return;
      }
      setError(null);
      if (photoPreview && photoPreview.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
      setPhoto(file);
      const previewUrl = URL.createObjectURL(file);
      setPhotoPreview(previewUrl);
    }
  };
  const handleAadhaarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setError("Aadhaar photo size should be less than 2MB");
        return;
      }
      setError(null);
      if (aadhaarPreview && aadhaarPreview.startsWith("blob:")) {
        URL.revokeObjectURL(aadhaarPreview);
      }
      setAadhaarPhoto(file);
      const previewUrl = URL.createObjectURL(file);
      setAadhaarPreview(previewUrl);
    }
  };
  if (!isOpen) return null;
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      let gymId = initialData?.gym_id;
      if (!initialData) {
        let { data: gymData, error: gymError } = await supabase
          .from("gyms")
          .select("id")
          .eq("id", user.id)
          .single();
        if (gymError && gymError.code === "PGRST116") {
          const { data: newGym, error: createGymError } = await supabase
            .from("gyms")
            .insert([{ id: user.id, name: "MY GYM" }])
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
      let photo_url = initialData?.photo_url || null;
      if (photo) {
        const fileExt = photo.name.split(".").pop();
        const fileName = `${gymId}/${initialData?.id || "new"}/photo_${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from("customer-docs")
          .upload(filePath, photo, { cacheControl: "3600", upsert: true });
        if (uploadError) throw uploadError;
        photo_url = filePath;
      }
      let aadhaar_url = initialData?.aadhaar_url || null;
      if (aadhaarPhoto) {
        const fileExt = aadhaarPhoto.name.split(".").pop();
        const fileName = `${gymId}/${initialData?.id || "new"}/aadhaar_${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from("customer-docs")
          .upload(filePath, aadhaarPhoto, {
            cacheControl: "3600",
            upsert: true,
          });
        if (uploadError) throw uploadError;
        aadhaar_url = filePath;
      } // Fetch current pricing for the selected duration console.log('Fetching pricing for duration:', duration);
      const { data: planData, error: planError } = await supabase
        .from("membership_plans")
        .select("price")
        .eq("duration_type", duration)
        .single();
      if (planError) {
        throw new Error(`Failed to fetch pricing: ${planError.message}`);
      }
      const currentPrice = planData?.price;
      if (currentPrice == null || Number.isNaN(Number(currentPrice))) {
        throw new Error(
          `Membership plan price is missing for duration: ${duration}. Received planData: ${JSON.stringify(planData)}`,
        );
      }
      const normalizedCurrentPrice = Number(currentPrice);
      const payload = {
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        membership_duration: duration,
        membership_start_date: startDate,
        membership_end_date: endDate,
        photo_url,
        aadhaar_url,
        price_paid: normalizedCurrentPrice,
        updated_at: new Date().toISOString(),
      };
      const safePayload = {
        ...payload,
        first_name: "***",
        last_name: "***",
        email: "***",
        phone: "***",
        photo_url: "***",
        aadhaar_url: "***",
      };
      console.log("Saving Customer Payload (Sanitized):", safePayload);
      let resultData;
      if (initialData) {
        const { data, error: updateError } = await supabase
          .from("customers")
          .update(payload)
          .eq("id", initialData.id)
          .select();
        if (updateError) throw updateError;
        resultData = data[0];
        console.log("Customer Updated Successfully:", resultData);
      } else {
        const { data, error: insertError } = await supabase
          .from("customers")
          .insert([{ ...payload, gym_id: gymId }])
          .select();
        if (insertError) throw insertError;
        resultData = data[0];
        console.log("Customer Created Successfully:", resultData);
      }
      // Automatically log the transaction to the Subscriptions history ledger
      // Only do this for brand new customers OR explicit renewals, not basic profile edits.
      if (!initialData || isRenewal) {
        const subPayload = {
          gym_id: gymId,
          customer_id: resultData.id,
          plan_name: duration,
          amount: normalizedCurrentPrice,
          status: "ACTIVE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const { error: subError } = await supabase
          .from("subscriptions")
          .insert([subPayload]);
        if (subError) {
          console.error("Failed to log subscription history:", subError);
          // Non-blocking error: we still want to finish the customer save cleanly
        } else {
          console.log("Subscription History Logged.");
        }
      }
      // Google Review Auto-Sender (Only for Brand New Customers)
      if (!initialData) {
        try {
          // Replace 'RESEND' filter with query by existence of google_business_link
          const { data: integ } = await supabase
            .from("gym_integrations")
            .select("google_business_link")
            .eq("gym_id", gymId)
            .not("google_business_link", "is", null)
            .maybeSingle();
          if (integ?.google_business_link) {
            const { data: revTemplate } = await supabase
              .from("automation_templates")
              .select("subject, body_text")
              .eq("name", "GOOGLE_REVIEW_REQUEST")
              .single();
            // Validate template and recipient email
            if (
              revTemplate?.subject &&
              revTemplate?.body_text &&
              resultData.email &&
              resultData.first_name
            ) {
              const personalizedBody = revTemplate.body_text.replace(
                /{first_name}/g,
                resultData.first_name,
              );
              const personalizedSubject = revTemplate.subject.replace(
                /{first_name}/g,
                resultData.first_name,
              );
              // Await the invocation or at least catch its error
              const { error: invokeError } = await supabase.functions.invoke(
                "broadcast-email",
                {
                  body: {
                    subject: personalizedSubject,
                    message: personalizedBody,
                    recipientGroup: "INDIVIDUAL",
                    recipientEmail: resultData.email,
                    isReviewRequest: true,
                  },
                },
              );
              if (invokeError) throw invokeError;
              console.log("Instant Review Request Dispatched.");
            }
          }
        } catch (revErr) {
          console.error("Failed to auto-send review:", revErr);
        }
      }
      setLoading(false);
      onCustomerSaved(resultData);
      onClose();
    } catch (err) {
      console.error("Error saving customer:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {" "}
      <div className="bg-[#1A1A1A] border border-white/10 w-full max-w-lg p-4 md:p-6 shadow-2xl animate-in zoom-in-95 duration-300 overflow-y-auto max-h-[86vh]">
        {" "}
        <div className="flex justify-between items-center mb-4 md:mb-6">
          {" "}
          <h2 className="font-logo text-3xl tracking-tight text-white ">
            {" "}
            {initialData ? "Update Information" : "New Application"}{" "}
          </h2>{" "}
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors text-[10px] tracking-widest font-mono"
          >
            {" "}
            Close [ESC]{" "}
          </button>{" "}
        </div>{" "}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] tracking-widest font-mono">
            {" "}
            {error}{" "}
          </div>
        )}{" "}
        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
          {" "}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {" "}
            {/* Photo Upload Section */}{" "}
            <div className="flex flex-col items-center">
              {" "}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative w-20 h-20 rounded-full border border-white/10 bg-white/5 cursor-pointer group hover:border-white/30 transition-all overflow-hidden"
              >
                {" "}
                <div className="w-full h-full bg-cover bg-center flex items-center justify-center">
                  {" "}
                  {photoPreview ? (
                    photoPreview.startsWith("blob:") ? (
                      <div
                        className="w-full h-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${photoPreview})` }}
                      />
                    ) : (
                      <SecureImage
                        filePath={photoPreview}
                        className="w-full h-full"
                      />
                    )
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="text-white/20 group-hover:text-white/40 transition-colors"
                    >
                      {" "}
                      <path d="M12 5v14M5 12h14" />{" "}
                    </svg>
                  )}{" "}
                </div>{" "}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300">
                  {" "}
                  <span className="text-[8px] tracking-[0.2em] font-mono text-white font-medium pointer-events-none">
                    {" "}
                    {photoPreview ? "Change" : "Upload"}{" "}
                  </span>{" "}
                </div>{" "}
              </div>{" "}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handlePhotoChange}
                accept="image/*"
                className="hidden"
              />{" "}
              <span className="text-[8px] tracking-[0.2em] font-mono text-white/20 mt-2">
                Profile Photo
              </span>{" "}
            </div>{" "}
            {/* Aadhaar Upload Section */}{" "}
            <div className="flex flex-col items-center">
              {" "}
              <div
                onClick={() => aadhaarInputRef.current?.click()}
                className="relative w-full aspect-[1.8/1] max-w-[220px] border border-white/10 bg-white/5 cursor-pointer group hover:border-white/30 transition-all overflow-hidden font-mono"
              >
                {" "}
                <div className="w-full h-full bg-cover bg-center flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
                  {" "}
                  {aadhaarPreview ? (
                    aadhaarPreview.startsWith("blob:") ? (
                      <div
                        className="w-full h-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${aadhaarPreview})` }}
                      />
                    ) : (
                      <SecureImage
                        filePath={aadhaarPreview}
                        className="w-full h-full"
                      />
                    )
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      {" "}
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="text-white/20 group-hover:text-white/40 transition-colors"
                      >
                        {" "}
                        <rect x="3" y="4" width="18" height="16" rx="2" />{" "}
                        <line x1="7" y1="8" x2="17" y2="8" />{" "}
                        <line x1="7" y1="12" x2="17" y2="12" />{" "}
                        <line x1="7" y1="16" x2="13" y2="16" />{" "}
                      </svg>{" "}
                      <span className="text-[8px] tracking-[0.2em] text-white/20 group-hover:text-white/40 ">
                        Aadhaar Card Photo
                      </span>{" "}
                    </div>
                  )}{" "}
                </div>{" "}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300">
                  {" "}
                  <span className="text-[8px] tracking-[0.2em] text-white font-medium pointer-events-none">
                    {" "}
                    {aadhaarPreview ? "Change Aadhaar" : "Upload Aadhaar"}{" "}
                  </span>{" "}
                </div>{" "}
              </div>{" "}
              <input
                type="file"
                ref={aadhaarInputRef}
                onChange={handleAadhaarChange}
                accept="image/*"
                className="hidden"
              />{" "}
              <span className="text-[8px] tracking-[0.2em] font-mono text-white/20 mt-2">
                Identity Proof
              </span>{" "}
            </div>{" "}
          </div>{" "}
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            {" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.2em] font-mono text-white/40 block">
                First Name
              </label>{" "}
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-2.5 md:p-3 text-white text-sm focus:outline-none focus:border-white/30 transition-colors font-body"
                placeholder="Shayaan"
              />{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.2em] font-mono text-white/40 block">
                Last Name
              </label>{" "}
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-2.5 md:p-3 text-white text-sm focus:outline-none focus:border-white/30 transition-colors font-body"
                placeholder="Shaikh"
              />{" "}
            </div>{" "}
          </div>{" "}
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            {" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.2em] font-mono text-white/40 block">
                Email Address
              </label>{" "}
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-2.5 md:p-3 text-white text-sm focus:outline-none focus:border-white/30 transition-colors font-body"
                placeholder="hello@hamming.co"
              />{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.2em] font-mono text-white/40 block">
                Phone Number
              </label>{" "}
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-2.5 md:p-3 text-white text-sm focus:outline-none focus:border-white/30 transition-colors font-body"
                placeholder="+91 00000 00000"
              />{" "}
            </div>{" "}
          </div>{" "}
          <div className="w-full h-[1px] bg-white/10 my-4" />{" "}
          <div className="space-y-2">
            {" "}
            <label className="text-[10px] tracking-[0.2em] font-mono text-white/40 block">
              {" "}
              Membership Duration{" "}
              {isRenewal && (
                <span className="text-red-500 ml-2 font-medium tracking-tight">
                  (FILL)
                </span>
              )}{" "}
            </label>{" "}
            <div className="relative">
              {" "}
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-3 text-white text-sm focus:outline-none focus:border-white/30 transition-colors font-body appearance-none cursor-pointer"
              >
                {" "}
                <option value="1 MONTH" className="bg-[#1A1A1A] text-white">
                  1 MONTH
                </option>{" "}
                <option value="3 MONTHS" className="bg-[#1A1A1A] text-white">
                  3 MONTHS
                </option>{" "}
                <option value="6 MONTHS" className="bg-[#1A1A1A] text-white">
                  6 MONTHS
                </option>{" "}
                <option value="1 YEAR" className="bg-[#1A1A1A] text-white">
                  1 YEAR
                </option>{" "}
              </select>{" "}
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/20">
                {" "}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  {" "}
                  <path d="M2 4L6 8L10 4" />{" "}
                </svg>{" "}
              </div>{" "}
            </div>{" "}
          </div>{" "}
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            {" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.2em] font-mono text-white/40 block">
                {" "}
                Start Date{" "}
                {isRenewal && (
                  <span className="text-red-500 ml-2 font-medium tracking-tight">
                    (FILL)
                  </span>
                )}{" "}
              </label>{" "}
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-2.5 md:p-3 text-white text-sm focus:outline-none focus:border-white/30 transition-colors font-body [color-scheme:dark]"
              />{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.2em] font-mono text-white/40 block">
                End Date (Auto)
              </label>{" "}
              <input
                type="date"
                readOnly
                value={endDate}
                className="w-full bg-white/5 border border-white/10 p-2.5 md:p-3 text-white/40 text-sm focus:outline-none font-body cursor-not-allowed [color-scheme:dark]"
              />{" "}
            </div>{" "}
          </div>{" "}
          <div className="pt-2">
            {" "}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black py-3.5 px-4 text-[10px] tracking-[0.3em] font-medium hover:bg-white/90 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {" "}
              {loading
                ? "Processing..."
                : initialData
                  ? "Save changes"
                  : "Submit application"}{" "}
            </button>{" "}
          </div>{" "}
        </form>{" "}
      </div>{" "}
    </div>
  );
};
export default CustomerModal;
