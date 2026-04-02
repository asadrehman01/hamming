import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  Send,
  Users,
  Mail,
  AlertCircle,
  CheckCircle2,
  Loader2,
  History,
  Link as LinkIcon,
  Key,
  AtSign,
} from "lucide-react";
const CommunicationsPage = () => {
  // Shared states
  const [activeTab, setActiveTab] = useState("BROADCAST");
  const [status, setStatus] = useState(null);

  // Broadcast states
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [recipientGroup, setRecipientGroup] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  // Automation states
  const [template, setTemplate] = useState({ subject: "", body_text: "" });
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [reviewTemplate, setReviewTemplate] = useState({
    subject: "",
    body_text: "",
  });
  const [savingReviewTemplate, setSavingReviewTemplate] = useState(false);
  const [broadcastingReview, setBroadcastingReview] = useState(false);
  // Integrations states
  const [integration, setIntegration] = useState({
    reply_to_email: "",
    sender_profile: "",
    google_business_link: "",
  });
  const [savingIntegration, setSavingIntegration] = useState(false);
  const [integrationId, setIntegrationId] = useState(null);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [integrationError, setIntegrationError] = useState(null);
  const tabOrder = ["BROADCAST", "AUTOMATION", "INTEGRATIONS"];
  const normalizedActiveTab = tabOrder.includes(activeTab)
    ? activeTab
    : "BROADCAST";
  const activeTabIndex = Math.max(tabOrder.indexOf(normalizedActiveTab), 0);
  const recipientGroups = ["ALL", "ACTIVE", "EXPIRED"];
  const recipientGroupIndex = Math.max(
    recipientGroups.indexOf(recipientGroup),
    0,
  );
  useEffect(() => {
    fetchStats();
    fetchTemplate();
    fetchIntegration();
  }, []);
  const getCurrentGymId = async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!authData?.user?.id) throw new Error("User not authenticated");
    return authData.user.id;
  };
  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const gymId = await getCurrentGymId();
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const todayIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .split("T")[0];
      const { count: totalCount, error: totalError } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("gym_id", gymId);
      const { count: activeCount, error: activeError } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("gym_id", gymId)
        .or(`membership_end_date.is.null,membership_end_date.gte.${todayIso}`);
      const { count: expiredCount, error: expiredError } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("gym_id", gymId)
        .lt("membership_end_date", todayIso);
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
      setStatus({
        type: "error",
        message: "Failed to load audience statistics.",
      });
    } finally {
      setStatsLoading(false);
    }
  };
  const fetchTemplate = async () => {
    try {
      const gymId = await getCurrentGymId();
      const [expiryResult, reviewResult] = await Promise.all([
        supabase
          .from("automation_templates")
          .select("subject, body_text")
          .eq("name", "EXPIRY_REMINDER")
          .eq("gym_id", gymId)
          .maybeSingle(),
        supabase
          .from("automation_templates")
          .select("subject, body_text")
          .eq("name", "GOOGLE_REVIEW_REQUEST")
          .eq("gym_id", gymId)
          .maybeSingle(),
      ]);

      const { data: expiryData, error: expiryError } = expiryResult;
      const { data: reviewData, error: reviewError } = reviewResult;

      if (expiryData) {
        setTemplate(expiryData);
      }

      if (reviewData) {
        setReviewTemplate(reviewData);
      }

      const queryErrors = [expiryError, reviewError].filter(Boolean);
      if (queryErrors.length > 0) {
        const combinedMessages = queryErrors
          .map((queryError) => queryError.message)
          .join(" | ");
        console.error("Error fetching templates:", queryErrors);
        setStatus({
          type: "error",
          message: `Failed to load one or more automation templates: ${combinedMessages}`,
        });
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
      setStatus({
        type: "error",
        message: "Failed to load automation templates.",
      });
    }
  };
  const fetchIntegration = async () => {
    setIntegrationLoading(true);
    setIntegrationError(null);
    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData?.user?.id) {
        throw new Error("User not authenticated");
      }
      const { data, error } = await supabase
        .from("gym_integrations")
        .select("id, reply_to_email, sender_profile, google_business_link")
        .eq("provider", "RESEND")
        .eq("gym_id", authData.user.id)
        .maybeSingle();
      if (error) {
        throw error;
      }
      if (data) {
        setIntegration({
          reply_to_email: data.reply_to_email || "",
          sender_profile: data.sender_profile || "",
          google_business_link: data.google_business_link || "",
        });
        setIntegrationId(data.id);
      } else {
        setIntegrationId(null);
        setIntegration({
          reply_to_email: "",
          sender_profile: "",
          google_business_link: "",
        });
      }
    } catch (error) {
      console.error("Error fetching integration:", error);
      setIntegrationError("Failed to load integration settings.");
      setStatus({
        type: "error",
        message: "Failed to load integration settings.",
      });
    } finally {
      setIntegrationLoading(false);
    }
  };
  const handleSend = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const { error } = await supabase.functions.invoke("broadcast-email", {
        body: { subject, message, recipientGroup },
      });
      if (error) {
        let errorMsg = error.message;
        try {
          const body = await error.context.json();
          errorMsg = `Error [${error.context.status}]: ${body.error || error.message}`;
          if (body.details) errorMsg += ` - ${JSON.stringify(body.details)}`;
        } catch {
          // keep fallback error message
        }
        throw new Error(errorMsg);
      }
      setStatus({
        type: "success",
        message: "Broadcast initiated successfully!",
      });
      setSubject("");
      setMessage("");
    } catch (err) {
      console.error("Error sending broadcast:", err);
      setStatus({
        type: "error",
        message:
          err.message === "Failed to fetch"
            ? "Edge Function not yet deployed or Resend key missing."
            : err.message,
      });
    } finally {
      setLoading(false);
    }
  };
  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    setSavingTemplate(true);
    setStatus(null);
    try {
      const gymId = await getCurrentGymId();
      if (!gymId) throw new Error("User not authenticated");

      const { error } = await supabase
        .from("automation_templates")
        .update({
          subject: template.subject,
          body_text: template.body_text,
          updated_at: new Date().toISOString(),
        })
        .eq("name", "EXPIRY_REMINDER")
        .eq("gym_id", gymId);
      if (error) throw error;
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

      const { error } = await supabase
        .from("automation_templates")
        .update({
          subject: reviewTemplate.subject,
          body_text: reviewTemplate.body_text,
          updated_at: new Date().toISOString(),
        })
        .eq("name", "GOOGLE_REVIEW_REQUEST")
        .eq("gym_id", gymId);
      if (error) throw error;
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
        "Are you sure you want to email all members who haven't been asked for a review yet?",
      )
    )
      return;
    setBroadcastingReview(true);
    setStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "broadcast-email",
        {
          body: {
            subject: reviewTemplate.subject,
            message: reviewTemplate.body_text,
            recipientGroup: "UNREVIEWED",
            isReviewRequest: true,
          },
        },
      );
      if (error) throw new Error(error.message || String(error));
      if (data && data.error) {
        const details =
          typeof data.error === "string"
            ? data.error
            : JSON.stringify(data.error) || "Unknown error";
        throw new Error(details);
      }
      setStatus({
        type: "success",
        message: `Sent bulk review requests to ${data.count || 0} unreviewed members!`,
      });
    } catch (err) {
      console.error("Error broadcasting reviews:", err);
      setStatus({ type: "error", message: err.message });
    } finally {
      setBroadcastingReview(false);
    }
  };
  const handleSaveIntegration = async (e) => {
    e.preventDefault();
    setSavingIntegration(true);
    setStatus(null);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user?.id) throw new Error("User not authenticated");

      if (integrationId) {
        const { error } = await supabase
          .from("gym_integrations")
          .update({
            reply_to_email: integration.reply_to_email,
            sender_profile: integration.sender_profile,
            google_business_link: integration.google_business_link,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integrationId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("gym_integrations")
          .insert({
            provider: "RESEND",
            gym_id: user.id,
            reply_to_email: integration.reply_to_email,
            sender_profile: integration.sender_profile,
            google_business_link: integration.google_business_link,
          })
          .select("id")
          .single();
        if (error) throw error;
        if (data) setIntegrationId(data.id);
      }
      setStatus({
        type: "success",
        message: "Settings saved! Your branding is live.",
      });
    } catch (err) {
      console.error("Error saving integration:", err);
      setStatus({ type: "error", message: err.message });
    } finally {
      setSavingIntegration(false);
    }
  };
  return (
    <div className="app-page flex-1 p-8 overflow-auto bg-[#0a0c10] text-emerald-50">
      {" "}
      <div className="max-w-5xl mx-auto">
        {" "}
        <header className="mb-12 space-y-6">
          {" "}
          <div>
            {" "}
            <p className="text-[10px] tracking-[0.3em] text-white/40 font-mono mb-2">
              Communication engine
            </p>{" "}
            <h1 className="text-4xl md:text-5xl font-medium tracking-tighter text-white">
              Communications
            </h1>{" "}
            <p className="text-[10px] text-white/40 mt-2 font-mono tracking-widest">
              Broadcast & Automation center
            </p>{" "}
          </div>{" "}
          <div
            className="toggle-button-group toggle-button-group-3 communications-tab-strip"
            style={{ "--toggle-active-index": activeTabIndex }}
          >
            {" "}
            <button
              onClick={() => {
                setActiveTab("BROADCAST");
                setStatus(null);
              }}
              className={`toggle-button ${normalizedActiveTab === "BROADCAST" ? "is-active" : ""}`}
            >
              {" "}
              Broadcast{" "}
            </button>{" "}
            <button
              onClick={() => {
                setActiveTab("AUTOMATION");
                setStatus(null);
              }}
              className={`toggle-button ${normalizedActiveTab === "AUTOMATION" ? "is-active" : ""}`}
            >
              {" "}
              Automation{" "}
            </button>{" "}
            <button
              onClick={() => {
                setActiveTab("INTEGRATIONS");
                setStatus(null);
              }}
              className={`toggle-button ${normalizedActiveTab === "INTEGRATIONS" ? "is-active" : ""}`}
            >
              {" "}
              Integrations{" "}
            </button>{" "}
          </div>{" "}
        </header>{" "}
        {status && (
          <div
            className={`mb-8 p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${status.type === "success" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}
          >
            {" "}
            {status.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}{" "}
            <p className="text-sm">{status.message}</p>{" "}
          </div>
        )}{" "}
        {normalizedActiveTab === "BROADCAST" ? (
          <div className="animate-in fade-in slide-in-from-left-4">
            {" "}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-6 max-w-[860px]">
              {" "}
              <div className="bg-[#151920] border border-white/10 px-4 py-3.5 rounded-xl transition-colors">
                {" "}
                <div className="flex items-start justify-between gap-3">
                  {" "}
                  <div>
                    <p className="text-[13px] tracking-[0.02em] text-white/65 font-light">
                      Total reach
                    </p>
                    <p className="mt-1 text-[34px] leading-none font-light text-white tracking-tight">
                      {statsLoading || !stats ? "--" : stats.total}
                    </p>
                  </div>{" "}
                  <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-white/65" />
                  </div>
                </div>
                <p className="mt-2 text-[10px] tracking-[0.08em] text-white/40">
                  Contacts in system
                </p>
              </div>{" "}
              <div className="bg-[#151920] border border-white/10 px-4 py-3.5 rounded-xl transition-colors">
                {" "}
                <div className="flex items-start justify-between gap-3">
                  {" "}
                  <div>
                    <p className="text-[13px] tracking-[0.02em] text-white/65 font-light">
                      Active members
                    </p>
                    <p className="mt-1 text-[34px] leading-none font-light text-white tracking-tight">
                      {statsLoading || !stats ? "--" : stats.active}
                    </p>
                  </div>{" "}
                  <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-white/65" />
                  </div>
                </div>
                <p className="mt-2 text-[10px] tracking-[0.08em] text-white/40">
                  Eligible for broadcast
                </p>
              </div>{" "}
              <div className="bg-[#151920] border border-white/10 px-4 py-3.5 rounded-xl transition-colors">
                {" "}
                <div className="flex items-start justify-between gap-3">
                  {" "}
                  <div>
                    <p className="text-[13px] tracking-[0.02em] text-white/65 font-light">
                      Expired plans
                    </p>
                    <p className="mt-1 text-[34px] leading-none font-light text-white tracking-tight">
                      {statsLoading || !stats ? "--" : stats.expired}
                    </p>
                  </div>{" "}
                  <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-white/65" />
                  </div>
                </div>{" "}
                <p className="mt-2 text-[10px] tracking-[0.08em] text-white/40">
                  Re-engagement pool
                </p>
              </div>{" "}
            </div>{" "}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {" "}
              <div className="lg:col-span-2">
                {" "}
                <form
                  onSubmit={handleSend}
                  className="p-6 rounded-2xl space-y-4"
                >
                  {" "}
                  <div className="flex items-center gap-3 pb-4 border-b border-white/5 font-mono text-emerald-500 tracking-wider">
                    {" "}
                    <Mail className="w-5 h-5 text-white" />{" "}
                    <h2 className="text-xl font-medium font-logo text-white">
                      New broadcast
                    </h2>{" "}
                  </div>{" "}
                  <div className="space-y-2">
                    {" "}
                    <label className="text-xs font-light tracking-[0.08em] text-white/40">
                      Recipient group
                    </label>{" "}
                    <div
                      className="toggle-button-group toggle-button-group-3 broadcast-recipient-toggle"
                      style={{ "--toggle-active-index": recipientGroupIndex }}
                    >
                      {" "}
                      {recipientGroups.map((group) => (
                        <button
                          key={group}
                          type="button"
                          onClick={() => setRecipientGroup(group)}
                          className={`toggle-button ${recipientGroup === group ? "is-active" : ""}`}
                        >
                          {" "}
                          {group.charAt(0) + group.slice(1).toLowerCase()}{" "}
                        </button>
                      ))}{" "}
                    </div>{" "}
                  </div>{" "}
                  <div className="space-y-2">
                    {" "}
                    <label className="text-xs font-light tracking-[0.08em] text-white/40">
                      Subject line
                    </label>{" "}
                    <input
                      type="text"
                      required
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="e.g., Special Offer for Renewals!"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 transition-colors text-white text-sm placeholder:text-xs"
                    />{" "}
                  </div>{" "}
                  <div className="space-y-2">
                    {" "}
                    <label className="text-xs font-light tracking-[0.08em] text-white/40">
                      Message content
                    </label>{" "}
                    <textarea
                      required
                      rows={6}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type your message here..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none text-white leading-relaxed text-sm placeholder:text-xs"
                    />{" "}
                  </div>{" "}
                  <button
                    type="submit"
                    disabled={loading}
                    className="broadcast-send-btn"
                  >
                    <span className="broadcast-send-btn__label">
                      {loading ? "Sending..." : "Send Broadcast"}
                    </span>
                    <span
                      className="broadcast-send-btn__icon"
                      aria-hidden="true"
                    >
                      {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        "\u2192"
                      )}
                    </span>
                  </button>{" "}
                </form>{" "}
              </div>{" "}
              <div className="space-y-8">
                {" "}
                <div className="bg-[#1B1B1D] border border-white/5 p-6 rounded-2xl hover:border-emerald-500/20 transition-colors">
                  {" "}
                  <div className="flex items-center gap-3 mb-4 text-[#A1A1A3] font-mono text-[10px] tracking-[0.2em]">
                    {" "}
                    <History className="w-4 h-4 text-white" />{" "}
                    <h3 className="font-medium">Mailing Tips</h3>{" "}
                  </div>{" "}
                  <ul className="space-y-4 text-xs text-[#A1A1A3] leading-relaxed font-sans">
                    {" "}
                    <li className="flex gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-white mt-1.5 flex-shrink-0" />
                      Keep subjects short and exciting to improve open rates.
                    </li>{" "}
                    <li className="flex gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-white mt-1.5 flex-shrink-0" />
                      Personalize messages using the member's first name.
                    </li>{" "}
                    <li className="flex gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-white mt-1.5 flex-shrink-0" />
                      Always include a clear call-to-action (CTA).
                    </li>{" "}
                  </ul>{" "}
                </div>{" "}
              </div>{" "}
            </div>{" "}
          </div>
        ) : normalizedActiveTab === "AUTOMATION" ? (
          <div className="animate-in fade-in slide-in-from-right-4">
            {" "}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {" "}
              <div className="space-y-4">
                {" "}
                <form
                  onSubmit={handleSaveTemplate}
                  className="p-5 rounded-2xl space-y-4"
                >
                  {" "}
                  <div
                    className="flex items-center gap-1.5 pb-2 border-b border-white/5 text-white tracking-[0.01em] font-light"
                    style={{ fontFamily: "DM Sans, sans-serif" }}
                  >
                    {" "}
                    <AlertCircle className="w-5 h-5 text-white" />{" "}
                    <h2
                      className="text-xl font-light tracking-[0.01em] text-white h-7"
                      style={{ fontFamily: "DM Sans, sans-serif" }}
                    >
                      Expiry reminders
                    </h2>{" "}
                  </div>{" "}
                  <div className="space-y-1.5">
                    {" "}
                    <label className="text-xs font-light tracking-[0.08em] text-white/40">
                      Email subject
                    </label>{" "}
                    <input
                      type="text"
                      required
                      value={template.subject}
                      onChange={(e) =>
                        setTemplate({ ...template, subject: e.target.value })
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500/50 transition-colors text-white text-sm"
                    />{" "}
                  </div>{" "}
                  <div className="space-y-1.5">
                    {" "}
                    <div className="flex justify-between items-center">
                      {" "}
                      <label className="text-xs font-light tracking-[0.08em] text-white/40">
                        Message body
                      </label>{" "}
                      <span className="text-[10px] text-emerald-500/60 font-mono italic">
                        Use {"{first_name}"}
                      </span>{" "}
                    </div>{" "}
                    <textarea
                      required
                      rows={7}
                      value={template.body_text}
                      onChange={(e) =>
                        setTemplate({ ...template, body_text: e.target.value })
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none text-white text-sm font-serif leading-relaxed"
                    />{" "}
                  </div>{" "}
                  <button
                    type="submit"
                    disabled={savingTemplate}
                    className="broadcast-send-btn"
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
                  </button>{" "}
                </form>{" "}
                <div className="p-5 rounded-2xl group bg-white/8 border border-white/10 transition-colors">
                  {" "}
                  <h3 className="text-sm font-medium mb-3 text-white tracking-widest">
                    How it works
                  </h3>{" "}
                  <div className="space-y-3 text-xs text-white/50 leading-relaxed font-sans">
                    {" "}
                    <p>
                      Every night at <strong>00:01 AM</strong>, our server scans
                      for members whose plan expires in{" "}
                      <strong>exactly 3 days</strong>.
                    </p>{" "}
                    <p>
                      When a match is found, an email is automatically sent
                      using the template you define above.
                    </p>{" "}
                    <p>
                      Use placeholders like{" "}
                      <code className="text-emerald-500">{"{first_name}"}</code>{" "}
                      to personalize.
                    </p>{" "}
                  </div>{" "}
                </div>{" "}
              </div>{" "}
              <div>
                {" "}
                <div className="p-5 rounded-2xl space-y-4">
                  {" "}
                  <div
                    className="flex items-center gap-1.5 pb-2 border-b border-white/5 text-white tracking-[0.01em] font-light"
                    style={{ fontFamily: "DM Sans, sans-serif" }}
                  >
                    {" "}
                    <AlertCircle className="w-5 h-5 text-white" />{" "}
                    <h2
                      className="text-xl font-light tracking-[0.01em] text-white h-7"
                      style={{ fontFamily: "DM Sans, sans-serif" }}
                    >
                      Google review auto-sender
                    </h2>{" "}
                  </div>{" "}
                  <form
                    onSubmit={handleSaveReviewTemplate}
                    className="space-y-4"
                  >
                    {" "}
                    <div className="space-y-1.5">
                      {" "}
                      <label className="text-xs font-light tracking-[0.08em] text-white/40">
                        Email subject
                      </label>{" "}
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
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500/50 transition-colors text-white text-sm"
                      />{" "}
                    </div>{" "}
                    <div className="space-y-1.5">
                      {" "}
                      <div className="flex justify-between items-center">
                        {" "}
                        <label className="text-xs font-light tracking-[0.08em] text-white/40">
                          Message body
                        </label>{" "}
                        <span className="text-[10px] text-emerald-500/60 font-mono italic">
                          Use {"{first_name}"} / {"{review_link}"}
                        </span>{" "}
                      </div>{" "}
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
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none text-white text-sm font-serif leading-relaxed"
                      />{" "}
                    </div>{" "}
                    <button
                      type="submit"
                      disabled={savingReviewTemplate}
                      className="broadcast-send-btn"
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
                    </button>{" "}
                  </form>{" "}
                  <div className="pt-4 border-t border-white/5 bg-white/8 rounded-xl p-4 -mx-5 px-5 mt-10">
                    {" "}
                    <p className="text-xs text-white/40 mb-3 leading-relaxed font-sans">
                      {" "}
                      New members will instantly receive this request upon
                      registration if you've added your{" "}
                      <span className="text-emerald-400">
                        Google Link in the Integrations tab
                      </span>
                      . <br />
                      <br /> Want to harvest reviews from your historical member
                      database? Click below to blast this to all past members
                      who haven't been asked yet.{" "}
                    </p>{" "}
                    <button
                      type="button"
                      onClick={handleBroadcastReviews}
                      disabled={broadcastingReview}
                      className="broadcast-send-btn broadcast-send-btn--wide"
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
                    </button>{" "}
                  </div>{" "}
                </div>{" "}
              </div>{" "}
            </div>{" "}
          </div>
        ) : normalizedActiveTab === "INTEGRATIONS" ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 animate-in fade-in slide-in-from-right-4">
            {" "}
            <div className="lg:col-span-2">
              {" "}
              <form
                onSubmit={handleSaveIntegration}
                className="bg-[#151921] border border-white/5 p-8 rounded-2xl space-y-6 font-light"
                style={{ fontFamily: "DM Sans, sans-serif" }}
              >
                {" "}
                {integrationLoading && (
                  <div className="text-[10px] tracking-[0.08em] text-white/40 font-light">
                    Loading integration settings...
                  </div>
                )}{" "}
                {integrationError && (
                  <div className="p-3 border bg-red-500/10 border-red-500/20 text-red-400 text-[10px] tracking-[0.08em] font-light">
                    {" "}
                    {integrationError}{" "}
                  </div>
                )}{" "}
                <div className="flex items-center justify-between pb-6 border-b border-white/5">
                  {" "}
                  <div
                    className="flex items-center gap-3 font-light text-white tracking-[0.01em]"
                    style={{ fontFamily: "DM Sans, sans-serif" }}
                  >
                    {" "}
                    <h2 className="text-xl font-light tracking-[0.02em]">
                      Your gym settings
                    </h2>{" "}
                  </div>{" "}
                  <div
                    className="text-[10px] tracking-[0.08em] text-white font-light"
                    style={{ fontFamily: "DM Sans, sans-serif" }}
                  >
                    {" "}
                    Powered by Hamming{" "}
                  </div>{" "}
                </div>{" "}
                <div className="space-y-4">
                  {" "}
                  <div className="space-y-2">
                    {" "}
                    <label className="text-xs font-light tracking-[0.08em] text-white/40 flex items-center gap-2">
                      {" "}
                      <Mail className="w-4 h-4" /> Gym Display Name{" "}
                    </label>{" "}
                    <input
                      type="text"
                      value={integration.sender_profile}
                      onChange={(e) =>
                        setIntegration({
                          ...integration,
                          sender_profile: e.target.value,
                        })
                      }
                      placeholder="e.g., Hamming Fitness"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 focus:outline-none focus:border-emerald-500/50 transition-colors text-white"
                    />{" "}
                    <p className="text-[11px] tracking-[0.08em] text-white/40 font-light">
                      This is the name your clients see in the "From" field of
                      every email.
                    </p>{" "}
                  </div>{" "}
                  <div className="space-y-2">
                    {" "}
                    <label className="text-xs font-light tracking-[0.08em] text-white/40 flex items-center gap-2">
                      {" "}
                      <AtSign className="w-4 h-4" /> Reply-To Email{" "}
                    </label>{" "}
                    <input
                      type="email"
                      value={integration.reply_to_email}
                      onChange={(e) =>
                        setIntegration({
                          ...integration,
                          reply_to_email: e.target.value,
                        })
                      }
                      placeholder="e.g., support@yourgym.com"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 focus:outline-none focus:border-emerald-500/50 transition-colors text-white"
                    />{" "}
                    <p className="text-[11px] tracking-[0.08em] text-white/40 font-light">
                      When a client hits &quot;Reply&quot; to an email, their
                      message will land in this inbox.
                    </p>{" "}
                  </div>{" "}
                  <div className="space-y-2 pt-4 border-t border-white/5">
                    {" "}
                    <label className="text-xs font-light tracking-[0.08em] text-emerald-400 flex items-center gap-2">
                      {" "}
                      <LinkIcon className="w-4 h-4" /> Google Business Link{" "}
                    </label>{" "}
                    <input
                      type="url"
                      value={integration.google_business_link}
                      onChange={(e) =>
                        setIntegration({
                          ...integration,
                          google_business_link: e.target.value,
                        })
                      }
                      placeholder="https://g.page/r/..."
                      className="w-full bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-4 focus:outline-none focus:border-emerald-500/50 transition-colors text-white font-mono"
                    />{" "}
                    <p className="text-[11px] tracking-[0.08em] text-white/40 font-light">
                      Leave empty to disable automated Google review requests.
                    </p>{" "}
                  </div>{" "}
                </div>{" "}
                <button
                  type="submit"
                  disabled={savingIntegration}
                  className="broadcast-send-btn"
                >
                  <span className="broadcast-send-btn__label">
                    {savingIntegration ? "Saving..." : "Save settings"}
                  </span>
                  <span className="broadcast-send-btn__icon" aria-hidden="true">
                    {savingIntegration ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      "\u2192"
                    )}
                  </span>
                </button>{" "}
              </form>{" "}
            </div>{" "}
            <div className="space-y-8">
              {" "}
              <div className="bg-[#151921] border border-white/5 p-6 rounded-2xl">
                {" "}
                <h3 className="text-sm font-medium mb-4 text-emerald-400 tracking-widest flex items-center gap-2">
                  {" "}
                  <CheckCircle2 className="w-4 h-4" /> How It Works{" "}
                </h3>{" "}
                <div className="space-y-4 text-xs text-white/50 leading-relaxed font-sans">
                  {" "}
                  <p>
                    Hamming sends all your emails from its own verified domain,
                    so there's{" "}
                    <strong className="text-white/70">
                      no setup required on your end
                    </strong>
                    .
                  </p>{" "}
                  <p>
                    Your <strong className="text-white/70">Gym Name</strong>{" "}
                    appears as the sender, and your{" "}
                    <strong className="text-white/70">Reply-To</strong> email
                    ensures client replies land directly in your inbox.
                  </p>{" "}
                  <p>
                    Just drop in your Google Business link and your clients will
                    start receiving review requests automatically.
                  </p>{" "}
                </div>{" "}
              </div>{" "}
              <div className="bg-[#0B0E14] border border-white/5 p-6 rounded-2xl text-center">
                {" "}
                <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10">
                  {" "}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="w-6 h-6 text-white/40"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    {" "}
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />{" "}
                  </svg>{" "}
                </div>{" "}
                <h3 className="font-medium text-sm tracking-tight mb-2">
                  WhatsApp Support
                </h3>{" "}
                <p className="text-[10px] text-white/40 tracking-widest font-mono">
                  Coming soon
                </p>{" "}
              </div>{" "}
            </div>{" "}
          </div>
        ) : null}{" "}
      </div>{" "}
    </div>
  );
};
export default CommunicationsPage;
