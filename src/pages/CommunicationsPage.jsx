import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { getUserWithRetry } from "../lib/authUser";
import { isTransientRequestError, withTransientRetry } from "../lib/transientRequest";
import {
  Send,
  Users,
  Mail,
  AlertCircle,
  CheckCircle2,
  Loader2,
  History,
} from "lucide-react";

const DEFAULT_EXPIRY_TEMPLATE = {
  subject: "{first_name}, your membership expires in 3 days",
  body_text:
    "Hi {first_name}, your membership expires in 3 days. Renew to stay active. Reply to this SMS if you need help.",
};

const DEFAULT_REVIEW_TEMPLATE = {
  subject: "Welcome to the gym, {first_name}! Share your 5-star experience",
  body_text:
    "Hi {first_name}, thanks for joining! Please review us: {review_link}",
};

const trimSms = (value, limit = 160) => {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
};

const sendSMS = async (phoneNumber, message) => {
  const { data, error } = await supabase.functions.invoke("send-sms", {
    body: {
      to: `+91${String(phoneNumber).replace(/\D/g, "")}`,
      message: message,
    },
  });
  if (error) console.error("SMS failed:", error);
  return { data, error };
};

const CommunicationsPage = () => {
  // Shared states
  const [activeTab, setActiveTab] = useState("BROADCAST");
  const [status, setStatus] = useState(null);
  const [currentGymId, setCurrentGymId] = useState(null);

  // Broadcast states
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [recipientGroup, setRecipientGroup] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  // Automation states
  const [template, setTemplate] = useState(DEFAULT_EXPIRY_TEMPLATE);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [reviewTemplate, setReviewTemplate] = useState(DEFAULT_REVIEW_TEMPLATE);
  const [savingReviewTemplate, setSavingReviewTemplate] = useState(false);
  const [broadcastingReview, setBroadcastingReview] = useState(false);
  const tabOrder = ["BROADCAST", "AUTOMATION"];
  const normalizedActiveTab = tabOrder.includes(activeTab)
    ? activeTab
    : "BROADCAST";
  const activeTabIndex = Math.max(tabOrder.indexOf(normalizedActiveTab), 0);
  const recipientGroups = ["ALL", "ACTIVE", "EXPIRED"];
  useEffect(() => {
    let active = true;

    const loadInitialData = async () => {
      try {
        const {
          data: { user },
        } = await getUserWithRetry(supabase);

        if (!active) return;
        if (!user?.id) throw new Error("User not authenticated");

        setCurrentGymId(user.id);
        await Promise.all([fetchStats(user.id), fetchTemplate(user.id)]);
      } catch (error) {
        console.error("Error loading communications page:", error);
      }
    };

    loadInitialData();

    return () => {
      active = false;
    };
  }, []);

  const runWithRetry = (operation) =>
    withTransientRetry(operation, { retries: 2, baseDelayMs: 250 });
  const getCurrentGymId = async () => {
    if (currentGymId) return currentGymId;
    const { data: authData, error: authError } = await getUserWithRetry(supabase);
    if (authError) throw authError;
    if (!authData?.user?.id) throw new Error("User not authenticated");
    setCurrentGymId(authData.user.id);
    return authData.user.id;
  };

  const saveTemplateForGym = async ({ gymId, name, subject, bodyText }) => {
    const payload = {
      subject,
      body_text: bodyText,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedRows, error: updateError } = await supabase
      .from("automation_templates")
      .update(payload)
      .eq("gym_id", gymId)
      .eq("name", name)
      .select("id")
      .limit(1);

    if (updateError) throw updateError;
    if ((updatedRows || []).length > 0) return;

    const { error: insertError } = await supabase
      .from("automation_templates")
      .insert({
        gym_id: gymId,
        name,
        subject,
        body_text: bodyText,
        updated_at: new Date().toISOString(),
      });

    if (!insertError) return;

    const insertMessage = String(insertError?.message || "").toLowerCase();
    if (
      insertMessage.includes("automation_templates_name_key") ||
      insertMessage.includes("duplicate key")
    ) {
      const { error: legacyUpsertError } = await supabase
        .from("automation_templates")
        .upsert(
          {
            gym_id: gymId,
            name,
            subject,
            body_text: bodyText,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "gym_id,name" },
        );
      if (legacyUpsertError) throw legacyUpsertError;
      return;
    }

    throw insertError;
  };

  const fetchStats = async (gymId = currentGymId) => {
    setStatsLoading(true);
    try {
      if (!gymId) throw new Error("User not authenticated");
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const todayIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .split("T")[0];
      const { count: totalCount, error: totalError } = await runWithRetry(() =>
        supabase
          .from("customers")
          .select("*", { count: "exact", head: true })
          .eq("gym_id", gymId),
      );
      const { count: activeCount, error: activeError } = await runWithRetry(() =>
        supabase
          .from("customers")
          .select("*", { count: "exact", head: true })
          .eq("gym_id", gymId)
          .or(`membership_end_date.is.null,membership_end_date.gte.${todayIso}`),
      );
      const { count: expiredCount, error: expiredError } = await runWithRetry(() =>
        supabase
          .from("customers")
          .select("*", { count: "exact", head: true })
          .eq("gym_id", gymId)
          .lt("membership_end_date", todayIso),
      );
      if (totalError || activeError || expiredError) {
        throw totalError || activeError || expiredError;
      }
      setStats({
        total: totalCount || 0,
        active: activeCount || 0,
        expired: expiredCount || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      if (!isTransientRequestError(error)) {
        setStatus({
          type: "error",
          message: "Failed to load audience statistics.",
        });
      }
    } finally {
      setStatsLoading(false);
    }
  };
  const fetchTemplate = async (gymId = currentGymId) => {
    try {
      if (!gymId) throw new Error("User not authenticated");
      const [expiryResult, reviewResult] = await Promise.all([
        runWithRetry(() =>
          supabase
            .from("automation_templates")
            .select("subject, body_text")
            .eq("name", "EXPIRY_REMINDER")
            .eq("gym_id", gymId)
            .maybeSingle(),
        ),
        runWithRetry(() =>
          supabase
            .from("automation_templates")
            .select("subject, body_text")
            .eq("name", "GOOGLE_REVIEW_REQUEST")
            .eq("gym_id", gymId)
            .maybeSingle(),
        ),
      ]);

      const { data: expiryData, error: expiryError } = expiryResult;
      const { data: reviewData, error: reviewError } = reviewResult;

      if (expiryData) {
        setTemplate(expiryData);
      } else {
        setTemplate(DEFAULT_EXPIRY_TEMPLATE);
        try {
          await saveTemplateForGym({
            gymId,
            name: "EXPIRY_REMINDER",
            subject: DEFAULT_EXPIRY_TEMPLATE.subject,
            bodyText: DEFAULT_EXPIRY_TEMPLATE.body_text,
          });
        } catch (seedError) {
          console.error("Failed to seed default expiry template:", seedError);
        }
      }

      if (reviewData) {
        setReviewTemplate(reviewData);
      } else {
        setReviewTemplate(DEFAULT_REVIEW_TEMPLATE);
        try {
          await saveTemplateForGym({
            gymId,
            name: "GOOGLE_REVIEW_REQUEST",
            subject: DEFAULT_REVIEW_TEMPLATE.subject,
            bodyText: DEFAULT_REVIEW_TEMPLATE.body_text,
          });
        } catch (seedError) {
          console.error("Failed to seed default review template:", seedError);
        }
      }

      const queryErrors = [expiryError, reviewError].filter(Boolean);
      if (queryErrors.length > 0) {
        const combinedMessages = queryErrors
          .map((queryError) => queryError.message)
          .join(" | ");
        console.error("Error fetching templates:", queryErrors);
        if (!queryErrors.some(isTransientRequestError)) {
          setStatus({
            type: "error",
            message: `Failed to load one or more automation templates: ${combinedMessages}`,
          });
        }
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
      if (!isTransientRequestError(error)) {
        setStatus({
          type: "error",
          message: "Failed to load automation templates.",
        });
      }
    }
  };
  const handleSend = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const gymId = await getCurrentGymId();
      if (!gymId) throw new Error("User not authenticated");

      const { data: customers, error: customerError } = await supabase
        .from("customers")
        .select("phone, first_name, membership_end_date")
        .eq("gym_id", gymId)
        .not("phone", "is", null);

      if (customerError) throw customerError;

      const todayIso = new Date().toISOString().split("T")[0];
      const recipients = (customers || [])
        .filter((customer) => {
          if (recipientGroup === "ACTIVE") {
            return !customer.membership_end_date || customer.membership_end_date >= todayIso;
          }
          if (recipientGroup === "EXPIRED") {
            return customer.membership_end_date && customer.membership_end_date < todayIso;
          }
          return true;
        })
        .filter((customer) => String(customer.phone || "").trim());

      let sentCount = 0;
      for (const customer of recipients) {
        const smsSubject = subject || template.subject;
        const smsMessage = message || template.body_text;
        const personalizedMessage = trimSms(
          `${smsSubject ? `${smsSubject}: ` : ""}${smsMessage}`
            .replace(/\{first_name\}/gi, customer.first_name || "there"),
        );
        const { error } = await sendSMS(customer.phone, personalizedMessage);
        if (error) throw error;
        sentCount += 1;
      }

      setStatus({
        type: "success",
        message: `Broadcast initiated successfully! Sent ${sentCount} SMS messages.`,
      });
      setSubject("");
      setMessage("");
    } catch (err) {
      console.error("Error sending broadcast:", err);
      setStatus({
        type: "error",
        message: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const autoResizeTextarea = (e) => {
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    setSavingTemplate(true);
    setStatus(null);
    try {
      const gymId = await getCurrentGymId();
      if (!gymId) throw new Error("User not authenticated");

      await saveTemplateForGym({
        gymId,
        name: "EXPIRY_REMINDER",
        subject: template.subject,
        bodyText: template.body_text,
      });
      setStatus({
        type: "success",
        message: "Automation template updated successfully!",
      });
    } catch (err) {
      console.error("Error saving template:", err);
      setStatus({ type: "error", message: err.message });
    } finally {
      setSavingTemplate(false);
    }
  };
  const handleSaveReviewTemplate = async (e) => {
    e.preventDefault();
    setSavingReviewTemplate(true);
    setStatus(null);
    try {
      const gymId = await getCurrentGymId();
      if (!gymId) throw new Error("User not authenticated");

      await saveTemplateForGym({
        gymId,
        name: "GOOGLE_REVIEW_REQUEST",
        subject: reviewTemplate.subject,
        bodyText: reviewTemplate.body_text,
      });
      setStatus({
        type: "success",
        message: "Review Request template updated successfully!",
      });
    } catch (err) {
      console.error("Error saving template:", err);
      setStatus({ type: "error", message: err.message });
    } finally {
      setSavingReviewTemplate(false);
    }
  };
  const handleBroadcastReviews = async () => {
    if (
      !window.confirm(
        "Are you sure you want to text all members who haven't been asked for a review yet?",
      )
    )
      return;
    setBroadcastingReview(true);
    setStatus(null);
    try {
      const gymId = await getCurrentGymId();
      if (!gymId) throw new Error("User not authenticated");

      const { data: customers, error: customerError } = await supabase
        .from("customers")
        .select("phone, first_name, membership_end_date")
        .eq("gym_id", gymId)
        .not("phone", "is", null);

      if (customerError) throw customerError;

      const sentCustomers = (customers || []).filter((customer) => customer.phone);
      let sentCount = 0;

      for (const customer of sentCustomers) {
        const personalizedMessage = trimSms(
          reviewTemplate.body_text
            .replace(/\{first_name\}/gi, customer.first_name || "there")
            .replace(/\{review_link\}/gi, ""),
        );
        const { error } = await sendSMS(customer.phone, personalizedMessage);
        if (error) throw error;
        sentCount += 1;
      }

      setStatus({
        type: "success",
        message: `Sent bulk review requests to ${sentCount} members!`,
      });
    } catch (err) {
      console.error("Error broadcasting reviews:", err);
      setStatus({ type: "error", message: err.message });
    } finally {
      setBroadcastingReview(false);
    }
  };

  return (
    <div className="app-page communications-page-vibe flex-1 p-8 overflow-auto">
      <div className="max-w-5xl mx-auto">
        <style>{`
          .communications-page-vibe {
            background-color: #ffffff !important;
            color: #0d0d0d;
            min-height: 100vh;
          }
          .communications-header-title {
            font-family: 'Playfair Display', serif;
            font-weight: 400;
            color: #0d0d0d;
          }
          .communications-subtle {
            color: #666666;
          }
          .communications-send-btn {
            @apply !bg-white !text-[#0d0d0d] !border !border-[#e0e0e0] rounded-xl;
          }
          .communications-send-btn:hover {
            @apply !bg-[#f4f4f4] !border-[#d0d0d0];
          }

          /* Theme normalization: card background, borders, and titles */
          .communications-page-vibe .communications-card {
            background: #fafafa !important;
            border-color: rgba(0, 0, 0, 0.12) !important;
          }
          .communications-page-vibe .communications-card-title {
            color: #6b6b6b !important;
          }
          .communications-page-vibe [class*="bg-\\[#fbfbfb\\]"] {
            background: #fafafa !important;
          }
          .communications-page-vibe [class*="border-[#e6e6e6]"] {
            border-color: rgba(0, 0, 0, 0.12) !important;
          }

          /* Inputs and textareas: rounded and consistent */
          .communications-page-vibe input,
          .communications-page-vibe select,
          .communications-page-vibe textarea {
            background: #ffffff !important;
            color: #0d0d0d !important;
            border-color: #e0e0e0 !important;
            border-radius: 0.75rem !important; /* rounded-xl */
          }
          .communications-page-vibe input::placeholder,
          .communications-page-vibe textarea::placeholder {
            color: #a0a0a0 !important;
          }
        `}</style>
        <header className="mb-12 space-y-6">
          <div>
            <p className="text-[10px] tracking-[0.08em] communications-subtle dm-sans-light-008 mb-2">
              Communication engine
            </p>
            <h1 className="communications-header-title text-4xl md:text-5xl font-medium tracking-tighter text-[#0d0d0d]">
              Communications
            </h1>
            <p className="text-[10px] communications-subtle mt-2 font-mono tracking-widest">
              SMS & Automation center
            </p>
          </div>
        </header>

        <div className="flex flex-wrap gap-3 mb-3">
          {tabOrder.map((tab, idx) => {
            const isActive = activeTabIndex === idx;
            const label = tab.charAt(0) + tab.slice(1).toLowerCase();
            return (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setStatus(null);
                }}
                className={`px-4 md:px-6 py-3 rounded-xl text-xs tracking-[0.05em] font-light dm-sans-copy whitespace-nowrap transition-colors border ${
                  isActive
                    ? "bg-white text-[#0d0d0d] border-[#e0e0e0]"
                    : "bg-[#fbfbfb] text-[#666666] border-[#e0e0e0] hover:bg-[#f4f4f4]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="tab-panel flex-1 relative z-[5]">
          {status && (
            <div
              className={`mb-8 p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${status.type === "success" ? "bg-white text-[#0d0d0d] border border-[#e0e0e0]" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}
            >
              {status.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <p className="text-sm">{status.message}</p>
            </div>
          )}
          {normalizedActiveTab === "BROADCAST" ? (
            <div className="animate-in fade-in slide-in-from-left-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-6 max-w-[860px]">
                <div className="bg-[#fbfbfb] border border-[#e6e6e6] px-4 py-3.5 rounded-xl transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] tracking-[0.02em] text-[#666666] font-light">
                        Total reach
                      </p>
                      <p className="mt-1 text-[34px] leading-none font-light text-[#0d0d0d] tracking-tight">
                        {statsLoading || !stats ? "--" : stats.total}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-white border border-[#e0e0e0] flex items-center justify-center">
                      <Users className="w-5 h-5 text-[#666666]" />
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] tracking-[0.08em] communications-subtle dm-sans-light-008">
                    Contacts in system
                  </p>
                </div>
                <div className="bg-[#fbfbfb] border border-[#e6e6e6] px-4 py-3.5 rounded-xl transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] tracking-[0.02em] text-[#666666] font-light">
                        Active members
                      </p>
                      <p className="mt-1 text-[34px] leading-none font-light text-[#0d0d0d] tracking-tight">
                        {statsLoading || !stats ? "--" : stats.active}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-white border border-[#e0e0e0] flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-[#666666]" />
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] tracking-[0.08em] communications-subtle dm-sans-light-008">
                    Eligible for broadcast
                  </p>
                </div>
                <div className="bg-[#fbfbfb] border border-[#e6e6e6] px-4 py-3.5 rounded-xl transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] tracking-[0.02em] text-[#666666] font-light">
                        Expired plans
                      </p>
                      <p className="mt-1 text-[34px] leading-none font-light text-[#0d0d0d] tracking-tight">
                        {statsLoading || !stats ? "--" : stats.expired}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-white border border-[#e0e0e0] flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-[#666666]" />
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] tracking-[0.08em] communications-subtle dm-sans-light-008">
                    Re-engagement pool
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                  <form
                    onSubmit={handleSend}
                    className="border border-[#e6e6e6] bg-[#fbfbfb] rounded-2xl p-5 sm:p-8 space-y-6"
                  >
                    <div className="flex items-center gap-3 pb-5 border-b border-[#e6e6e6]">
                      <Mail className="w-5 h-5 text-[#0d0d0d]" />
                      <h2 className="communications-header-title text-xl sm:text-2xl tracking-tight text-[#0d0d0d] font-light normal-case" style={{ fontFamily: "'Playfair Display', serif", fontWeight: 600 }}>
                        New broadcast
                      </h2>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] tracking-[0.08em] dm-sans-light-008 communications-subtle">
                        Recipient group
                      </label>
                      <div className="flex flex-wrap gap-2"> 
                        {recipientGroups.map((group) => {
                          const isActiveGroup = recipientGroup === group;
                          return (
                            <button
                              key={group}
                              type="button"
                              onClick={() => setRecipientGroup(group)}
                              className={`px-4 md:px-5 py-2.5 rounded-xl text-xs tracking-[0.05em] font-light dm-sans-copy whitespace-nowrap transition-colors border ${
                                isActiveGroup
                                  ? "bg-white text-[#0d0d0d] border-[#e0e0e0]"
                                  : "bg-[#fbfbfb] text-[#666666] border-[#e0e0e0] hover:bg-[#f4f4f4]"
                              }`}
                            >
                              {group.charAt(0) + group.slice(1).toLowerCase()}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] tracking-[0.08em] dm-sans-light-008 communications-subtle">
                        Subject line
                      </label>
                      <input
                        type="text"
                        required
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="e.g., Special Offer for Renewals!"
                        className="w-full bg-transparent border-b border-[#e0e0e0] py-2 text-sm text-[#0d0d0d] placeholder:text-[#a0a0a0] outline-none dm-sans-light-008"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] tracking-[0.08em] dm-sans-light-008 communications-subtle">
                        Message content
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onInput={autoResizeTextarea}
                        placeholder="Type your message here..."
                        className="w-full bg-transparent border-b border-[#e0e0e0] py-2 text-sm text-[#0d0d0d] placeholder:text-[#a0a0a0] outline-none overflow-hidden leading-relaxed dm-sans-light-008"
                        style={{ minHeight: "84px" }}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="broadcast-send-btn communications-send-btn w-full py-4 text-[10px] tracking-[0.08em] dm-sans-light-008 font-medium disabled:opacity-40"
                    >
                      {loading ? "Sending..." : "Send Broadcast"}
                    </button>
                  </form>
                </div>
                <div className="space-y-8">
                  <div className="bg-[#fbfbfb] border border-[#e6e6e6] p-6 rounded-2xl hover:border-emerald-500/20 transition-colors">
                    <div className="flex items-center gap-3 mb-4 communications-subtle text-[10px] tracking-[0.08em] dm-sans-light-008">
                      <History className="w-4 h-4 text-[#0d0d0d]" />
                      <h3 className="communications-header-title font-light tracking-[0.08em] dm-sans-light-008" style={{ fontFamily: "'Playfair Display', serif", fontWeight: 600, fontSize: "1.125rem" }}>SMS Tips</h3>
                    </div>
                    <ul className="space-y-4 text-xs communications-subtle leading-relaxed dm-sans-light-008 tracking-[0.08em]">
                      <li className="flex gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#0d0d0d] mt-1.5 flex-shrink-0" />
                        Keep subjects short and exciting to improve open rates.
                      </li>
                      <li className="flex gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#0d0d0d] mt-1.5 flex-shrink-0" />
                        Personalize messages using the member's first name.
                      </li>
                      <li className="flex gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#0d0d0d] mt-1.5 flex-shrink-0" />
                        Always include a clear call-to-action (CTA).
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : normalizedActiveTab === "AUTOMATION" ? (
            <div className="animate-in fade-in slide-in-from-right-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div className="space-y-4">
                  <form
                    onSubmit={handleSaveTemplate}
                    className="p-5 rounded-2xl space-y-4 bg-[#fbfbfb] border border-[#e6e6e6]"
                  >
                    <div
                      className="flex items-center gap-1.5 pb-2 border-b border-[#e6e6e6] text-[#0d0d0d] tracking-[0.01em] font-light"
                      style={{ fontFamily: "DM Sans, sans-serif" }}
                    >
                      <AlertCircle className="w-5 h-5 text-[#0d0d0d]" />
                      <h2
                        className="communications-header-title text-xl font-light tracking-[0.01em] text-[#0d0d0d] h-7"
                        style={{ fontFamily: "'Playfair Display', serif", fontWeight: 600 }}
                      >
                        Expiry reminders
                      </h2>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-light tracking-[0.08em] communications-subtle">
                        SMS subject
                      </label>
                      <input
                        type="text"
                        required
                        value={template.subject}
                        onChange={(e) =>
                          setTemplate({ ...template, subject: e.target.value })
                        }
                        className="w-full bg-white border border-[#e0e0e0] rounded-xl px-4 py-2.5 focus:outline-none focus:border-black/20 transition-colors text-[#0d0d0d] text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-light tracking-[0.08em] communications-subtle">
                          Message body
                        </label>
                        <span className="text-[10px] communications-subtle font-mono italic">
                          Use {"{first_name}"}
                        </span>
                      </div>
                      <textarea
                        required
                        rows={7}
                        value={template.body_text}
                        onChange={(e) =>
                          setTemplate({ ...template, body_text: e.target.value })
                        }
                        className="w-full bg-white border border-[#e0e0e0] rounded-xl px-4 py-2.5 focus:outline-none focus:border-black/20 transition-colors resize-none text-[#0d0d0d] text-sm font-serif leading-relaxed"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={savingTemplate}
                      className="broadcast-send-btn communications-send-btn"
                    >
                      <span className="broadcast-send-btn__label">
                        {savingTemplate ? "Saving..." : "Save template"}
                      </span>
                      <span
                        className="broadcast-send-btn__icon"
                        aria-hidden="true"
                      >
                        {savingTemplate ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          "\u2192"
                        )}
                      </span>
                    </button>
                  </form>
                  <div className="p-5 rounded-2xl group bg-[#fbfbfb] border border-[#e6e6e6] transition-colors">
                    <h3 className="communications-header-title text-sm font-medium mb-3 text-[#0d0d0d] tracking-widest" style={{ fontFamily: "'Playfair Display', serif", fontWeight: 600 }}>
                      How it works
                    </h3>
                    <div className="space-y-2 text-xs communications-subtle leading-relaxed font-sans">
                      <p>
                        Every night at <strong>00:01 AM</strong>, our server scans
                        for members whose plan expires in <strong>exactly 3 days</strong>.
                      </p>
                      <p>
                        When a match is found, an SMS is automatically sent
                        using the template you define above.
                      </p>
                      <p>
                        Use placeholders like <code className="text-[#666666]">{"{first_name}"}</code> to personalize.
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="p-5 rounded-2xl space-y-4 bg-[#fbfbfb] border border-[#e6e6e6]">
                    <div
                      className="flex items-center gap-1.5 pb-2 border-b border-[#e6e6e6] text-[#0d0d0d] tracking-[0.01em] font-light"
                      style={{ fontFamily: "DM Sans, sans-serif" }}
                    >
                      <AlertCircle className="w-5 h-5 text-[#0d0d0d]" />
                      <h2
                        className="communications-header-title text-xl font-light tracking-[0.01em] text-[#0d0d0d] h-7"
                        style={{ fontFamily: "'Playfair Display', serif", fontWeight: 600 }}
                      >
                        Google review auto-sender
                      </h2>
                    </div>
                    <form
                      onSubmit={handleSaveReviewTemplate}
                      className="space-y-4"
                    >
                      <div className="space-y-1.5">
                        <label className="text-xs font-light tracking-[0.08em] communications-subtle">
                          SMS subject
                        </label>
                        <input
                          type="text"
                          required
                          value={reviewTemplate.subject}
                          onChange={(e) =>
                            setReviewTemplate({
                              ...reviewTemplate,
                              subject: e.target.value,
                            })
                          }
                          className="w-full bg-white border border-[#e0e0e0] rounded-xl px-4 py-2.5 focus:outline-none focus:border-black/20 transition-colors text-[#0d0d0d] text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-light tracking-[0.08em] communications-subtle">
                            Message body
                          </label>
                          <span className="text-[10px] communications-subtle font-mono italic">
                            Use {"{first_name}"} / {"{review_link}"}
                          </span>
                        </div>
                        <textarea
                          required
                          rows={7}
                          value={reviewTemplate.body_text}
                          onChange={(e) =>
                            setReviewTemplate({
                              ...reviewTemplate,
                              body_text: e.target.value,
                            })
                          }
                          className="w-full bg-white border border-[#e0e0e0] rounded-xl px-4 py-2.5 focus:outline-none focus:border-black/20 transition-colors resize-none text-[#0d0d0d] text-sm font-serif leading-relaxed"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={savingReviewTemplate}
                        className="broadcast-send-btn communications-send-btn"
                      >
                        <span className="broadcast-send-btn__label">
                          {savingReviewTemplate ? "Saving..." : "Save template"}
                        </span>
                        <span
                          className="broadcast-send-btn__icon"
                          aria-hidden="true"
                        >
                          {savingReviewTemplate ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            "\u2192"
                          )}
                        </span>
                      </button>
                    </form>
                    <div className="pt-4 border-t border-[#e6e6e6] bg-[#f6f6f6] rounded-xl p-4 -mx-5 px-5 mt-10">
                      <p className="text-xs communications-subtle mb-3 leading-relaxed font-sans">
                        New members will instantly receive this request upon
                        registration if you've added your <span className="text-[#0d0d0d]">Google Link in Billing - Gym Information</span>.
                        <br />
                        <br /> Want to harvest reviews from your historical member
                        database? Click below to blast this to all past members
                        who haven't been asked yet.
                      </p>
                      <button
                        type="button"
                        onClick={handleBroadcastReviews}
                        disabled={broadcastingReview}
                        className="broadcast-send-btn broadcast-send-btn--wide communications-send-btn"
                      >
                        <span className="broadcast-send-btn__label">
                          {broadcastingReview
                            ? "Sending..."
                            : "Broadcast to unreviewed database"}
                        </span>
                        <span
                          className="broadcast-send-btn__icon"
                          aria-hidden="true"
                        >
                          {broadcastingReview ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            "\u2192"
                          )}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
export default CommunicationsPage;
