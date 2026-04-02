import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";

const DupePage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("BROADCAST");
  const [status, setStatus] = useState(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [recipientGroup, setRecipientGroup] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, active: 0, expired: 0 });
  const [template, setTemplate] = useState({ subject: "", body_text: "" });
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [reviewTemplate, setReviewTemplate] = useState({
    subject: "",
    body_text: "",
  });
  const [savingReviewTemplate, setSavingReviewTemplate] = useState(false);
  const [integration, setIntegration] = useState({
    reply_to_email: "",
    sender_profile: "",
    google_business_link: "",
  });
  const [savingIntegration, setSavingIntegration] = useState(false);
  const [integrationId, setIntegrationId] = useState(null);

  useEffect(() => {
    const run = async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user) return;

        const { count: total } = await supabase
          .from("customers")
          .select("*", { count: "exact", head: true })
          .eq("gym_id", user.id);
        const { count: active } = await supabase
          .from("customers")
          .select("*", { count: "exact", head: true })
          .eq("gym_id", user.id)
          .or(
            `membership_end_date.is.null,membership_end_date.gte.${new Date().toISOString().split("T")[0]}`,
          );
        const { count: expired } = await supabase
          .from("customers")
          .select("*", { count: "exact", head: true })
          .eq("gym_id", user.id)
          .lt("membership_end_date", new Date().toISOString().split("T")[0]);
        setStats({
          total: total || 0,
          active: active || 0,
          expired: expired || 0,
        });

        const { data: t1 } = await supabase
          .from("automation_templates")
          .select("subject, body_text")
          .eq("name", "EXPIRY_REMINDER")
          .eq("gym_id", user.id)
          .maybeSingle();
        if (t1) setTemplate(t1);

        const { data: t2 } = await supabase
          .from("automation_templates")
          .select("subject, body_text")
          .eq("name", "GOOGLE_REVIEW_REQUEST")
          .eq("gym_id", user.id)
          .maybeSingle();
        if (t2) setReviewTemplate(t2);

        const { data: integ } = await supabase
          .from("gym_integrations")
          .select("id, reply_to_email, sender_profile, google_business_link")
          .eq("provider", "RESEND")
          .eq("gym_id", user.id)
          .maybeSingle();
        if (integ) {
          setIntegrationId(integ.id);
          setIntegration({
            reply_to_email: integ.reply_to_email || "",
            sender_profile: integ.sender_profile || "",
            google_business_link: integ.google_business_link || "",
          });
        }
      } catch (err) {
        console.error("DupePage init error:", err);
      }
    };

    run();
  }, []);

  const withUser = async () => {
    const { data: auth, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!auth?.user?.id) throw new Error("User not authenticated");
    return auth.user;
  };

  const handleSend = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const allowedRecipientGroups = ["ALL", "ACTIVE", "EXPIRED"];
      if (!allowedRecipientGroups.includes(recipientGroup)) {
        throw new Error("Invalid recipient group selected.");
      }

      const { error } = await supabase.functions.invoke("broadcast-email", {
        body: { subject, message, recipientGroup },
      });
      if (error) throw error;
      setStatus({
        type: "success",
        message: "Broadcast initiated successfully!",
      });
      setSubject("");
      setMessage("");
    } catch (err) {
      setStatus({ type: "error", message: err.message || "Broadcast failed." });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    setSavingTemplate(true);
    setStatus(null);
    try {
      const user = await withUser();
      const { data: updatedRows, error } = await supabase
        .from("automation_templates")
        .update({
          subject: template.subject,
          body_text: template.body_text,
          updated_at: new Date().toISOString(),
        })
        .eq("name", "EXPIRY_REMINDER")
        .eq("gym_id", user.id)
        .select("id");
      if (error) throw error;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error("No template found to update for this gym.");
      }
      setStatus({
        type: "success",
        message: "Automation template updated successfully!",
      });
    } catch (err) {
      setStatus({
        type: "error",
        message: err.message || "Failed to save template.",
      });
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleSaveReviewTemplate = async (e) => {
    e.preventDefault();
    setSavingReviewTemplate(true);
    setStatus(null);
    try {
      const user = await withUser();
      const { error } = await supabase
        .from("automation_templates")
        .update({
          subject: reviewTemplate.subject,
          body_text: reviewTemplate.body_text,
          updated_at: new Date().toISOString(),
        })
        .eq("name", "GOOGLE_REVIEW_REQUEST")
        .eq("gym_id", user.id);
      if (error) throw error;
      setStatus({
        type: "success",
        message: "Review template updated successfully!",
      });
    } catch (err) {
      setStatus({
        type: "error",
        message: err.message || "Failed to save review template.",
      });
    } finally {
      setSavingReviewTemplate(false);
    }
  };

  const handleSaveIntegration = async (e) => {
    e.preventDefault();
    setSavingIntegration(true);
    setStatus(null);
    try {
      const user = await withUser();
      if (integrationId) {
        const { error } = await supabase
          .from("gym_integrations")
          .update({
            reply_to_email: integration.reply_to_email,
            sender_profile: integration.sender_profile,
            google_business_link: integration.google_business_link,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integrationId)
          .eq("gym_id", user.id);
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
      setStatus({ type: "success", message: "Settings saved!" });
    } catch (err) {
      setStatus({
        type: "error",
        message: err.message || "Failed to save integration.",
      });
    } finally {
      setSavingIntegration(false);
    }
  };

  return (
    <div className="app-page p-6 md:p-10 space-y-6">
      <header>
        <p className="text-[10px] tracking-[0.2em] text-white/40 font-mono">
          UI Sandbox
        </p>
        <h1 className="text-3xl md:text-4xl font-medium tracking-tight">
          Communications Dupe Page
        </h1>
      </header>

      {status && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-2 ${status.type === "success" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}
        >
          {status.type === "success" ? (
            <CheckCircle2 size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          <span className="text-sm">{status.message}</span>
        </div>
      )}

      <div className="flex gap-2">
        {["BROADCAST", "AUTOMATION", "INTEGRATIONS"].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 border text-xs tracking-widest ${activeTab === tab ? "bg-white text-black" : "border-white/20"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "BROADCAST" && (
        <form
          onSubmit={handleSend}
          className="space-y-3 border border-white/10 p-4"
        >
          <p className="text-xs text-white/50">
            Total: {stats.total} | Active: {stats.active} | Expired:{" "}
            {stats.expired}
          </p>
          <div className="space-y-1">
            <label
              htmlFor="recipientGroup"
              className="text-[10px] tracking-widest text-white/50"
            >
              Recipient Group
            </label>
            <select
              id="recipientGroup"
              value={recipientGroup}
              onChange={(e) => setRecipientGroup(e.target.value)}
              className="w-full bg-white/5 border border-white/10 p-2 text-xs"
            >
              <option value="ALL">All</option>
              <option value="ACTIVE">Active</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full bg-white/5 border border-white/10 p-2"
            required
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Message"
            className="w-full bg-white/5 border border-white/10 p-2"
            rows={5}
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-white text-black text-xs tracking-widest"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <span className="inline-flex items-center gap-2">
                <Send size={14} /> Send
              </span>
            )}
          </button>
        </form>
      )}

      {activeTab === "AUTOMATION" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <form
            onSubmit={handleSaveTemplate}
            className="space-y-3 border border-white/10 p-4"
          >
            <h2 className="text-sm">Expiry Reminder</h2>
            <input
              value={template.subject}
              onChange={(e) =>
                setTemplate({ ...template, subject: e.target.value })
              }
              className="w-full bg-white/5 border border-white/10 p-2"
              required
            />
            <textarea
              value={template.body_text}
              onChange={(e) =>
                setTemplate({ ...template, body_text: e.target.value })
              }
              className="w-full bg-white/5 border border-white/10 p-2"
              rows={5}
              required
            />
            <button
              type="submit"
              disabled={savingTemplate}
              className="px-4 py-2 bg-white text-black text-xs tracking-widest"
            >
              {savingTemplate ? "Saving..." : "Save"}
            </button>
          </form>

          <form
            onSubmit={handleSaveReviewTemplate}
            className="space-y-3 border border-white/10 p-4"
          >
            <h2 className="text-sm">Google Review Request</h2>
            <input
              value={reviewTemplate.subject}
              onChange={(e) =>
                setReviewTemplate({
                  ...reviewTemplate,
                  subject: e.target.value,
                })
              }
              className="w-full bg-white/5 border border-white/10 p-2"
              required
            />
            <textarea
              value={reviewTemplate.body_text}
              onChange={(e) =>
                setReviewTemplate({
                  ...reviewTemplate,
                  body_text: e.target.value,
                })
              }
              className="w-full bg-white/5 border border-white/10 p-2"
              rows={5}
              required
            />
            <button
              type="submit"
              disabled={savingReviewTemplate}
              className="px-4 py-2 bg-white text-black text-xs tracking-widest"
            >
              {savingReviewTemplate ? "Saving..." : "Save"}
            </button>
          </form>
        </div>
      )}

      {activeTab === "INTEGRATIONS" && (
        <form
          onSubmit={handleSaveIntegration}
          className="space-y-3 border border-white/10 p-4"
        >
          <input
            value={integration.sender_profile}
            onChange={(e) =>
              setIntegration({ ...integration, sender_profile: e.target.value })
            }
            placeholder="Sender profile"
            className="w-full bg-white/5 border border-white/10 p-2"
          />
          <input
            type="email"
            value={integration.reply_to_email}
            onChange={(e) =>
              setIntegration({ ...integration, reply_to_email: e.target.value })
            }
            placeholder="Reply-to email"
            className="w-full bg-white/5 border border-white/10 p-2"
          />
          <input
            type="url"
            value={integration.google_business_link}
            onChange={(e) =>
              setIntegration({
                ...integration,
                google_business_link: e.target.value,
              })
            }
            placeholder="Google business link"
            className="w-full bg-white/5 border border-white/10 p-2"
          />
          <button
            type="submit"
            disabled={savingIntegration}
            className="px-4 py-2 bg-white text-black text-xs tracking-widest"
          >
            {savingIntegration ? "Saving..." : "Save Integration"}
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={() => navigate("/communications")}
        className="px-4 py-2 border border-white/20 text-xs tracking-widest"
      >
        Open Main Communications Page
      </button>
    </div>
  );
};

export default DupePage;
