import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { getUserWithRetry } from "../lib/authUser";
import { isMigrationOnboardingCompleted } from "../lib/migrationOnboarding";
import { Mail, AtSign, Link as LinkIcon } from "lucide-react";

const DEFAULT_BILLING_VALUES = {
  receipt_enabled: true,
  gym_display_name: "",
  contact_email: "",
  contact_phone: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  postal_code: "",
  tax_label: "GSTIN",
  tax_value: "",
  invoice_prefix: "REC",
  footer_note: "Thank you for training with us.",
};

const BillingPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState("");
  const [integrationId, setIntegrationId] = useState(null);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [advanceToMigrationAfterSave, setAdvanceToMigrationAfterSave] = useState(false);
  const [integration, setIntegration] = useState({
    reply_to_email: "",
    sender_profile: "",
    google_business_link: "",
  });

  const [gymId, setGymId] = useState("");
  const [form, setForm] = useState({
    ...DEFAULT_BILLING_VALUES,
  });

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const notifyOnboardingRefresh = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("onboarding:refresh", { detail: { billingStepComplete: true } }));
    }
  };

  const notifyGymRefresh = ({ gymId: currentGymId, gymName }) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("gym:updated", {
          detail: { gymId: currentGymId, gymName },
        }),
      );
    }
  };

  const ensureGymRecord = async ({ gymId: currentGymId, gymName }) => {
    const { data: existingGym, error: gymLookupError } = await supabase
      .from("gyms")
      .select("id")
      .eq("id", currentGymId)
      .maybeSingle();

    if (gymLookupError) {
      throw gymLookupError;
    }

    if (existingGym) {
      return;
    }

    const { error: createGymError } = await supabase.from("gyms").insert({
      id: currentGymId,
      name: gymName,
    });

    if (createGymError) {
      throw createGymError;
    }
  };

  const syncGymRecordName = async ({ gymId: currentGymId, gymName }) => {
    const { error: syncGymError } = await supabase
      .from("gyms")
      .upsert(
        {
          id: currentGymId,
          name: gymName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

    if (syncGymError) {
      throw syncGymError;
    }
  };

  const getFriendlyBillingError = (incomingError) => {
    const message = String(incomingError?.message || "").toLowerCase();

    if (
      incomingError?.code === "23503" ||
      message.includes("foreign key constraint") ||
      message.includes("violates foreign key")
    ) {
      return "We couldn't save your billing settings because your account setup is not fully linked yet. Please refresh and try again. If it still happens, contact support.";
    }

    if (message.includes("not authenticated")) {
      return "Your session has expired. Please sign in again and try once more.";
    }

    return "We couldn't save your billing settings right now. Please try again in a moment.";
  };

  useEffect(() => {
    let active = true;

    const loadBillingSettings = async () => {
      setLoading(true);
      setError(null);
      setIntegrationLoading(true);
      try {
        const {
          data: { user },
        } = await getUserWithRetry(supabase);
        if (!user?.id) {
          throw new Error("User not authenticated");
        }

        const currentGymId = user.id;
        if (!active) return;
        setGymId(currentGymId);
        setAdvanceToMigrationAfterSave(!isMigrationOnboardingCompleted(user));

        const [{ data: gymRow }, { data: billingRow, error: billingError }, { data: integrationRow, error: integrationError }] = await Promise.all([
          supabase
            .from("gyms")
            .select("name")
            .eq("id", currentGymId)
            .maybeSingle(),
          supabase
            .from("billing_settings")
            .select("*")
            .eq("gym_id", currentGymId)
            .maybeSingle(),
          supabase
            .from("gym_integrations")
            .select("id, reply_to_email, sender_profile, google_business_link")
            .eq("provider", "RESEND")
            .eq("gym_id", currentGymId)
            .maybeSingle(),
        ]);

        if (billingError) {
          throw billingError;
        }

        if (integrationError) {
          throw integrationError;
        }

        const defaultGymName = gymRow?.name || "MY GYM";
        if (!gymRow) {
          await ensureGymRecord({ gymId: currentGymId, gymName: defaultGymName });
        }
        const next = billingRow
          ? {
              ...DEFAULT_BILLING_VALUES,
              ...billingRow,
              receipt_enabled: Boolean(billingRow.receipt_enabled),
              gym_display_name: billingRow.gym_display_name || defaultGymName,
            }
          : {
              ...DEFAULT_BILLING_VALUES,
              gym_display_name: defaultGymName,
            };

        if (!active) return;
        setForm(next);

        if (integrationRow) {
          setIntegrationId(integrationRow.id || null);
          setIntegration({
            reply_to_email: integrationRow.reply_to_email || "",
            sender_profile: integrationRow.sender_profile || "",
            google_business_link: integrationRow.google_business_link || "",
          });
        } else {
          setIntegrationId(null);
          setIntegration({
            reply_to_email: "",
            sender_profile: defaultGymName,
            google_business_link: "",
          });
        }
      } catch (loadError) {
        console.error("Failed to load billing settings:", loadError);
        if (!active) return;
        setError(loadError?.message || "Failed to load billing settings.");
      } finally {
        if (active) {
          setLoading(false);
          setIntegrationLoading(false);
        }
      }
    };

    loadBillingSettings();

    return () => {
      active = false;
    };
  }, []);

  const handleSave = async (event) => {
    event.preventDefault();
    if (!gymId) return;

    setSaving(true);
    setError(null);
    setSuccess("");

    try {
      const trimmedGymName = form.gym_display_name.trim() || "MY GYM";
      await ensureGymRecord({ gymId, gymName: trimmedGymName });
      await syncGymRecordName({ gymId, gymName: trimmedGymName });

      const payload = {
        gym_id: gymId,
        receipt_enabled: Boolean(form.receipt_enabled),
        gym_display_name: trimmedGymName,
        contact_email: form.contact_email.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        address_line1: form.address_line1.trim() || null,
        address_line2: form.address_line2.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        postal_code: form.postal_code.trim() || null,
        tax_label: form.tax_label.trim() || null,
        tax_value: form.tax_value.trim() || null,
        invoice_prefix: (form.invoice_prefix.trim() || "REC").toUpperCase(),
        footer_note: form.footer_note.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { error: saveError } = await supabase
        .from("billing_settings")
        .upsert([payload], { onConflict: "gym_id" });

      if (saveError) {
        throw saveError;
      }

      if (integrationId) {
        const { error: integrationSaveError } = await supabase
          .from("gym_integrations")
          .update({
            reply_to_email: integration.reply_to_email.trim() || null,
            sender_profile: integration.sender_profile.trim() || null,
            google_business_link: integration.google_business_link.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integrationId);
        if (integrationSaveError) throw integrationSaveError;
      } else {
        const { data: insertedIntegration, error: integrationInsertError } = await supabase
          .from("gym_integrations")
          .upsert({
            provider: "RESEND",
            gym_id: gymId,
            reply_to_email: integration.reply_to_email.trim() || null,
            sender_profile: integration.sender_profile.trim() || null,
            google_business_link: integration.google_business_link.trim() || null,
          }, { onConflict: "gym_id,provider" })
          .select("id")
          .single();
        if (integrationInsertError) throw integrationInsertError;
        if (insertedIntegration?.id) {
          setIntegrationId(insertedIntegration.id);
        }
      }

      setSuccess("Billing and gym information saved.");
      notifyGymRefresh({ gymId, gymName: trimmedGymName });
      notifyOnboardingRefresh();

      if (advanceToMigrationAfterSave) {
        navigate("/onboarding-migration", { replace: true });
      }
    } catch (saveError) {
      console.error("Failed to save billing settings:", saveError);
      setError(getFriendlyBillingError(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="app-page p-4 md:p-10">
        <div className="p-6 border border-white/10 bg-white/5 text-white/70 text-xs tracking-[0.08em] font-light dm-sans-copy animate-pulse">
          Loading billing settings...
        </div>
      </div>
    );
  }

  return (
    <div className="app-page p-4 md:px-10 md:pt-10">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        <header className="space-y-2">
          <p className="text-xs tracking-[0.2em] text-white/45 dm-sans-light-008">
            Billing
          </p>
          <h1 className="text-4xl md:text-5xl font-medium tracking-tighter text-white">
            Receipt Settings
          </h1>
          <p className="text-sm text-white/55 dm-sans-light-008">
            Configure your gym receipt template and control whether receipts are sent automatically for new applications created inside this app.
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-red-300/20 bg-red-500/[0.04] p-4 text-[11px] text-red-200/90 dm-sans-light-008">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-500/[0.07] p-4 text-[11px] text-emerald-200/90 dm-sans-light-008">
            {success}
          </div>
        )}

        <form onSubmit={handleSave} className="rounded-2xl border border-white/10 bg-[#151921] p-5 pb-16 md:px-7 md:pt-7 md:pb-16 space-y-8">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <div>
              <p className="dm-sans-light-008 text-[11px] uppercase tracking-[0.12em] text-white/75">
                Automatic Receipt Delivery
              </p>
              <p className="dm-sans-light-008 text-[10px] text-white/45 mt-1">
                When enabled, a bill/receipt is sent for new applicants created from the Members form.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateField("receipt_enabled", !form.receipt_enabled)}
              className={`px-3 py-1.5 rounded-lg border text-[10px] uppercase tracking-[0.12em] transition-colors ${
                form.receipt_enabled
                  ? "border-emerald-300/20 bg-emerald-500/[0.08] text-emerald-200/90"
                  : "border-red-300/20 bg-red-500/[0.08] text-red-200/90"
              }`}
            >
              {form.receipt_enabled ? "Enabled" : "Disabled"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
            <div className="space-y-3">
              <label className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55">Gym Display Name</label>
              <input
                type="text"
                value={form.gym_display_name}
                onChange={(event) => updateField("gym_display_name", event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-white/25"
                placeholder="Your gym name"
                required
              />
            </div>

            <div className="space-y-3">
              <label className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55">Invoice Prefix</label>
              <input
                type="text"
                value={form.invoice_prefix}
                onChange={(event) => updateField("invoice_prefix", event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-white/25"
                placeholder="REC"
              />
            </div>

            <div className="space-y-3">
              <label className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55">Contact Email</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(event) => updateField("contact_email", event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-white/25"
                placeholder="billing@yourgym.com"
              />
            </div>

            <div className="space-y-3">
              <label className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55">Contact Phone</label>
              <input
                type="text"
                value={form.contact_phone}
                onChange={(event) => updateField("contact_phone", event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-white/25"
                placeholder="+91 ..."
              />
            </div>

            <div className="space-y-3 md:col-span-2">
              <label className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55">Address Line 1</label>
              <input
                type="text"
                value={form.address_line1}
                onChange={(event) => updateField("address_line1", event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-white/25"
                placeholder="Street, building"
              />
            </div>

            <div className="space-y-3 md:col-span-2">
              <label className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55">Address Line 2</label>
              <input
                type="text"
                value={form.address_line2}
                onChange={(event) => updateField("address_line2", event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-white/25"
                placeholder="Area, landmark"
              />
            </div>

            <div className="space-y-3">
              <label className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55">City</label>
              <input type="text" value={form.city} onChange={(event) => updateField("city", event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-white/25" />
            </div>

            <div className="space-y-3">
              <label className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55">State</label>
              <input type="text" value={form.state} onChange={(event) => updateField("state", event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-white/25" />
            </div>

            <div className="space-y-3">
              <label className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55">Postal Code</label>
              <input type="text" value={form.postal_code} onChange={(event) => updateField("postal_code", event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-white/25" />
            </div>

            <div className="space-y-1.5">
              <label className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55">Tax Label</label>
              <input type="text" value={form.tax_label} onChange={(event) => updateField("tax_label", event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-white/25" placeholder="GSTIN" />
            </div>

            <div className="space-y-3 md:col-span-2">
              <label className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55">Tax Value</label>
              <input type="text" value={form.tax_value} onChange={(event) => updateField("tax_value", event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-white/25" placeholder="27ABCDE1234F1Z5" />
            </div>

            <div className="space-y-3 md:col-span-2">
              <label className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55">Receipt Footer Note</label>
              <textarea
                value={form.footer_note}
                onChange={(event) => updateField("footer_note", event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-white/25"
                placeholder="Thank you note or terms"
              />
            </div>

            <div className="md:col-span-2 pt-4">
              <div className="h-px bg-white/10" />
            </div>

            <div className="space-y-3 md:col-span-2">
              <p className="text-[20px] md:text-[24px] tracking-tight text-white" style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
                Gym Information
              </p>
              <p className="dm-sans-light-008 text-[10px] text-white/45">
                These settings are used by mails sent in Communications.
              </p>
              {integrationLoading && (
                <p className="dm-sans-light-008 text-[10px] text-white/40">Loading gym information...</p>
              )}
            </div>

            <div className="space-y-3 md:col-span-2">
              <label className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55 flex items-center gap-2">
                <Mail size={14} className="text-white/50" /> Gym Display Name (Email Sender)
              </label>
              <input
                type="text"
                value={integration.sender_profile}
                onChange={(event) =>
                  setIntegration((prev) => ({ ...prev, sender_profile: event.target.value }))
                }
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-white/25"
                placeholder="e.g., Hamming Fitness"
              />
            </div>

            <div className="space-y-3 md:col-span-2">
              <label className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55 flex items-center gap-2">
                <AtSign size={14} className="text-white/50" /> Reply-To Email
              </label>
              <input
                type="email"
                value={integration.reply_to_email}
                onChange={(event) =>
                  setIntegration((prev) => ({ ...prev, reply_to_email: event.target.value }))
                }
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-white/25"
                placeholder="support@yourgym.com"
              />
              <p className="dm-sans-light-008 text-[10px] text-white/45">
                When clients reply to your emails, the reply will come to this address.
              </p>
            </div>

            <div className="space-y-3 md:col-span-2">
              <label className="dm-sans-light-008 text-[10px] uppercase tracking-[0.12em] text-white/55 flex items-center gap-2">
                <LinkIcon size={14} className="text-white/50" /> Google Business Link
              </label>
              <input
                type="url"
                value={integration.google_business_link}
                onChange={(event) =>
                  setIntegration((prev) => ({ ...prev, google_business_link: event.target.value }))
                }
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-white/90 placeholder:text-white/35 focus:outline-none focus:border-white/25"
                placeholder="https://g.page/r/..."
              />
              <p className="dm-sans-light-008 text-[10px] text-white/45">
                Leave empty to disable automated Google review requests.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full md:w-auto rounded-xl border border-white/15 bg-white/[0.05] hover:bg-white/[0.09] px-5 py-2.5 text-[13px] text-white/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed tracking-wide md:mt-1"
          >
            {saving ? "Saving..." : "Save Billing Settings"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default BillingPage;
