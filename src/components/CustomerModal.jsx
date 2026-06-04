import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { getUserWithRetry } from "../lib/authUser";
import { toMonthStartDateString } from "../lib/financeDates";
import SecureImage from "./SecureImage";

// Helper: Send SMS via Supabase Edge Function with exponential backoff retry.
// Never throws; always logs result (success or final failure).
const trimSms = (value, limit = 160) => {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
};

const sendSMS = async (phoneNumber, message) => {
  const { data, error } = await supabase.functions.invoke("send-sms", {
    body: {
      to: `+91${phoneNumber.replace(/\D/g, "")}`,
      message: message,
    },
  });
  if (error) console.error("SMS failed:", error);
  return { data, error };
};

const formatBillDate = (value) => {
  if (!value) return "-";
  const raw = value instanceof Date ? null : String(value).trim();
  const date = value instanceof Date
    ? value
    : (/^\d{4}-\d{2}-\d{2}$/.test(raw || "")
        ? (() => {
            const [y, m, d] = (raw || "").split("-").map((part) => Number(part));
            return new Date(y, m - 1, d, 0, 0, 0, 0);
          })()
        : new Date(value));

  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN");
};

const buildReceiptMessage = ({
  gymDisplayName,
  billNumber,
  issuedAt,
  customerName,
  customerEmail,
  customerPhone,
  membershipPlan,
  membershipStart,
  membershipEnd,
  amount,
  contactEmail,
  contactPhone,
  addressLine1,
  addressLine2,
  city,
  state,
  postalCode,
  taxLabel,
  taxValue,
  footerNote,
}) => {
  const addressParts = [
    addressLine1,
    addressLine2,
    [city, state, postalCode].filter(Boolean).join(" - "),
  ].filter(Boolean);

  return [
    `${gymDisplayName}`,
    ...addressParts,
    contactPhone ? `Phone: ${contactPhone}` : null,
    contactEmail ? `Email: ${contactEmail}` : null,
    taxLabel && taxValue ? `${taxLabel}: ${taxValue}` : null,
    "",
    `Receipt No: ${billNumber}`,
    `Date: ${formatBillDate(issuedAt)}`,
    "",
    `Customer: ${customerName || "-"}`,
    `Customer Email: ${customerEmail || "-"}`,
    `Customer Phone: ${customerPhone || "-"}`,
    "",
    `Membership Plan: ${membershipPlan || "-"}`,
    `Membership Start: ${membershipStart ? formatBillDate(membershipStart) : "-"}`,
    `Membership End: ${membershipEnd ? formatBillDate(membershipEnd) : "-"}`,
    `Amount Paid: INR ${Number(amount || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`,
    `Payment Mode: Cash`,
    "",
    footerNote || "Thank you for training with us.",
  ]
    .filter(Boolean)
    .join("\n");
};

const escapeHtml = (value) =>
  String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildReceiptHtml = ({
  gymDisplayName,
  billNumber,
  issuedAt,
  customerName,
  customerEmail,
  customerPhone,
  membershipPlan,
  membershipStart,
  membershipEnd,
  amount,
  contactEmail,
  contactPhone,
  addressLine1,
  addressLine2,
  city,
  state,
  postalCode,
  taxLabel,
  taxValue,
  footerNote,
}) => {
  const safeGymName = escapeHtml(gymDisplayName || "Gym");
  const safeBillNumber = escapeHtml(billNumber || "-");
  const safeDate = escapeHtml(formatBillDate(issuedAt));
  const safeCustomerName = escapeHtml(customerName || "-");
  const safeCustomerEmail = escapeHtml(customerEmail || "-");
  const safeCustomerPhone = escapeHtml(customerPhone || "-");
  const safeMembershipPlan = escapeHtml(membershipPlan || "-");
  const safeMembershipStart = escapeHtml(
    membershipStart ? formatBillDate(membershipStart) : "-",
  );
  const safeMembershipEnd = escapeHtml(
    membershipEnd ? formatBillDate(membershipEnd) : "-",
  );
  const safeAmount = Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const fullAddress = [
    addressLine1,
    addressLine2,
    [city, state, postalCode].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join("<br>");

  const companyMeta = [
    fullAddress || null,
    contactPhone ? `Phone: ${escapeHtml(contactPhone)}` : null,
    contactEmail ? `Email: ${escapeHtml(contactEmail)}` : null,
    taxLabel && taxValue
      ? `${escapeHtml(taxLabel)}: ${escapeHtml(taxValue)}`
      : null,
  ]
    .filter(Boolean)
    .join("<br>");

  const safeFooter = escapeHtml(footerNote || "Thank you for training with us.");

  return `
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#0a0c10;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0c10;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#f7f7f7;border:1px solid #dcdcdc;color:#111111;font-family:'DM Sans','Segoe UI',Arial,sans-serif;">
            <tr>
              <td style="padding:24px 24px 14px 24px;border-bottom:1px dashed #b8b8b8;text-align:center;">
                <div style="font-size:34px;line-height:1.1;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">${safeGymName}</div>
                ${companyMeta ? `<div style="margin-top:10px;font-size:14px;line-height:1.45;color:#2f2f2f;">${companyMeta}</div>` : ""}
              </td>
            </tr>

            <tr>
              <td style="padding:18px 24px 8px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="font-size:26px;font-weight:600;letter-spacing:0.06em;">INVOICE</td>
                    <td align="right" style="font-size:28px;font-weight:700;letter-spacing:0.03em;">#${safeBillNumber}</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding-top:6px;font-size:14px;color:#343434;">Date: ${safeDate}</td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:8px 24px 0 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px dashed #b8b8b8;border-bottom:1px dashed #b8b8b8;">
                  <tr>
                    <td style="padding:10px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#4a4a4a;width:34%;">Bill To</td>
                    <td style="padding:10px 0;font-size:14px;line-height:1.5;">
                      <strong>${safeCustomerName}</strong><br>
                      ${safeCustomerEmail}<br>
                      ${safeCustomerPhone}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:14px 24px 0 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <th align="left" style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#4a4a4a;padding:0 0 8px 0;border-bottom:1px dashed #b8b8b8;">Description</th>
                    <th align="right" style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#4a4a4a;padding:0 0 8px 0;border-bottom:1px dashed #b8b8b8;">Amount</th>
                  </tr>
                  <tr>
                    <td style="padding:12px 0;font-size:14px;line-height:1.45;border-bottom:1px dashed #b8b8b8;">
                      Membership Plan: ${safeMembershipPlan}<br>
                      Period: ${safeMembershipStart} to ${safeMembershipEnd}<br>
                      Payment Mode: Cash
                    </td>
                    <td align="right" style="padding:12px 0;font-size:16px;font-weight:600;border-bottom:1px dashed #b8b8b8;">INR ${safeAmount}</td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:16px 24px 10px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="font-size:30px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Total:</td>
                    <td align="right" style="font-size:34px;font-weight:700;letter-spacing:0.03em;">INR ${safeAmount}</td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:8px 24px 24px 24px;border-top:1px dashed #b8b8b8;text-align:center;">
                <div style="font-size:13px;line-height:1.5;color:#3d3d3d;">${safeFooter}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

const buildReceiptSms = ({
  gymDisplayName,
  billNumber,
  membershipPlan,
  membershipStart,
  membershipEnd,
  amount,
}) => {
  const dateRange = membershipStart && membershipEnd
    ? `${formatBillDate(membershipStart)}-${formatBillDate(membershipEnd)}`
    : "";
  return trimSms(
    `Receipt ${billNumber}: INR ${Number(amount || 0).toLocaleString("en-IN")} for ${membershipPlan || "membership"}${dateRange ? ` (${dateRange})` : ""}. ${gymDisplayName || "Gym"}.`,
  );
};

const CustomerModal = ({
  isOpen,
  onClose,
  onCustomerSaved,
  initialData = null,
  isRenewal = false,
}) => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gymMemberId, setGymMemberId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [duration, setDuration] = useState("1 MONTH");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [aadhaarPhoto, setAadhaarPhoto] = useState(null);
  const [aadhaarPreview, setAadhaarPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const aadhaarInputRef = useRef(null);
  const formatIsoLocal = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  const parseIsoLocal = (value) => {
    const raw = String(value || "").trim();
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  };
  // Helper to calculate end date based on plan - wrapped in useCallback for stability
  const calculateEndDate = useCallback((start, dur) => {
    if (!start || !dur) return "";
    try {
      const startDate = parseIsoLocal(start);
      if (!startDate || Number.isNaN(startDate.getTime())) return "";
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
      return formatIsoLocal(endDate);
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
      setAmountPaid(initialData.price_paid != null ? String(initialData.price_paid) : "");
      setPhotoPreview(initialData.photo_url || null);
      setPhoto(null);
      setAadhaarPreview(initialData.aadhaar_url || null);
      setAadhaarPhoto(null);
    } else if (isOpen) {
      console.log("Initializing New Application");
      setFirstName("");
      setLastName("");
      setGymMemberId("");
      setEmail("");
      setPhone("");
      setDuration("1 MONTH");
      const today = formatIsoLocal(new Date());
      setStartDate(today);
      setEndDate(calculateEndDate(today, "1 MONTH"));
      setAmountPaid("");
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
    let onboardingStatus = "Skipped (existing customer update).";
    let receiptStatus = "Skipped (existing customer update).";
    try {
      const {
        data: { user },
      } = await getUserWithRetry(supabase);
      if (!user) throw new Error("User not authenticated");
      let gymId = initialData?.gym_id;
      let gymName = "MY GYM";
      if (!initialData) {
        let { data: gymData, error: gymError } = await supabase
          .from("gyms")
          .select("id, name")
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
          gymName = newGym.name || "MY GYM";
        } else if (gymError) {
          throw gymError;
        } else {
          gymId = gymData.id;
          gymName = gymData.name || "MY GYM";
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
      const parsedAmountPaid = Number(amountPaid);
      const normalizedPaidAmount =
        Number.isFinite(parsedAmountPaid) && parsedAmountPaid > 0
          ? parsedAmountPaid
          : normalizedCurrentPrice;

      if (!initialData || isRenewal) {
        if (!Number.isFinite(parsedAmountPaid) || parsedAmountPaid <= 0) {
          throw new Error("Please enter a valid amount paid for this membership.");
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
        photo_url,
        aadhaar_url,
        price_paid: normalizedPaidAmount,
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
          amount: normalizedPaidAmount,
          status: "ACTIVE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const { data: insertedSubscription, error: subError } = await supabase
          .from("subscriptions")
          .insert([subPayload])
          .select("id")
          .single();
        if (subError) {
          console.error("Failed to log subscription history:", subError);
          // Non-blocking error: we still want to finish the customer save cleanly
        } else {
          console.log("Subscription History Logged.");

          const paymentPayload = {
            gym_id: gymId,
            subscription_id: insertedSubscription?.id || null,
            matched_customer_id: resultData.id,
            amount: normalizedPaidAmount,
            status: "completed",
            payment_mode: "cash",
            sender_name: `${resultData.first_name || ""} ${resultData.last_name || ""}`.trim(),
            sender_account_name: resultData.email || null,
            revenue_month: toMonthStartDateString(startDate),
          };

          const { error: paymentError } = await supabase
            .from("payments")
            .insert([paymentPayload]);

          if (paymentError) {
            console.error("Failed to auto-log payment transaction:", paymentError);
          }
        }
      }
      // Google Review Auto-Sender (Only for Brand New Customers)
      if (!initialData) {
      // Send review SMS first, then wait before sending receipt to avoid spam-like bursts.
        try {
          const { data: integ } = await supabase
            .from("gym_integrations")
            .select("google_business_link")
            .eq("gym_id", gymId)
            .eq("provider", "RESEND")
            .not("google_business_link", "is", null)
            .maybeSingle();

          if (integ?.google_business_link && resultData.phone && resultData.first_name) {
            const { data: revTemplate } = await supabase
              .from("automation_templates")
              .select("subject, body_text")
              .eq("gym_id", gymId)
              .eq("name", "GOOGLE_REVIEW_REQUEST")
              .maybeSingle();

            const fallbackTemplate = {
              subject: "Welcome to the gym, {first_name}! Share your 5-star experience",
              body_text:
                "Hi {first_name},\n\nWelcome to the gym. We are excited to have you with us.\n\nIf your first experience has been great, please rate us 5 stars on Google here:\n{review_link}\n\nYour feedback helps us grow and helps more people discover our gym.\n\nThank you for being part of our community!",
            };

            const activeTemplate = {
              subject: revTemplate?.subject || fallbackTemplate.subject,
              body_text: revTemplate?.body_text || fallbackTemplate.body_text,
            };

            const reviewLink = integ?.google_business_link || "";
            const personalizedBody = activeTemplate.body_text
              .replace(/{first_name}/g, resultData.first_name)
              .replace(/{review_link}/g, reviewLink);

            const reviewResult = await sendSMS(resultData.phone, trimSms(personalizedBody));
            onboardingStatus = !reviewResult.error
              ? `Sent to ${resultData.phone}.`
              : `Failed (${reviewResult.error || "unknown error"}).`;

            await new Promise((resolve) => setTimeout(resolve, 3000));
          } else if (!resultData.phone) {
            onboardingStatus = "Skipped (customer phone missing).";
          } else if (!resultData.first_name) {
            onboardingStatus = "Skipped (customer first name missing).";
          } else {
            onboardingStatus = "Skipped (Google onboarding link not configured).";
          }
        } catch (revErr) {
          console.error("[Review Request] Failed to prepare/send:", revErr);
          onboardingStatus = "Failed (review request could not be sent).";
        }

        // Billing Receipt Auto-Sender (Only for Brand New Customers)
        try {
          const { data: billingSettings, error: billingSettingsError } = await supabase
            .from("billing_settings")
            .select("*")
            .eq("gym_id", gymId)
            .maybeSingle();

          if (billingSettingsError) {
            console.error("Failed to load billing settings:", billingSettingsError);
            receiptStatus = "Failed (could not load billing settings).";
          } else if (billingSettings?.receipt_enabled && resultData?.phone) {
            const billDate = new Date();
            const billNumber = `${(billingSettings.invoice_prefix || "REC").toUpperCase()}-${billDate
              .toISOString()
              .slice(0, 10)
              .replace(/-/g, "")}-${String(resultData.id || "").slice(0, 8).toUpperCase()}`;

            const message = buildReceiptSms({
              gymDisplayName: billingSettings.gym_display_name || gymName || "Gym",
              billNumber,
              membershipPlan: duration,
              membershipStart: startDate,
              membershipEnd: endDate,
              amount: normalizedPaidAmount,
            });

            // Send receipt with retry (never fails the save)
            const receiptResult = await sendSMS(resultData.phone, message);
            receiptStatus = !receiptResult.error
              ? `Sent to ${resultData.phone}.`
              : `Failed (${receiptResult.error || "unknown error"}).`;
          } else if (!billingSettings?.receipt_enabled) {
            receiptStatus = "Skipped (receipt disabled in Billing settings).";
          } else {
            receiptStatus = "Skipped (customer phone missing).";
          }
        } catch (receiptError) {
          console.error("Failed to auto-send receipt:", receiptError);
          receiptStatus = "Failed (receipt could not be sent).";
        }
      }
      setLoading(false);
      onCustomerSaved(resultData, {
        onboardingStatus,
        receiptStatus,
        isNewApplication: !initialData,
      });
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
      <div className="bg-[#1A1A1A] border border-white/10 w-full max-w-lg p-4 md:p-6 shadow-2xl animate-in zoom-in-95 duration-300 overflow-y-auto overflow-x-hidden max-h-[86vh]">
        {" "}
        <div className="flex justify-between items-center mb-4 md:mb-6">
          {" "}
          <h2 className="font-logo text-3xl tracking-tight text-white ">
            {" "}
            {isRenewal
              ? "Renew Form"
              : initialData
                ? "Edit Information"
                : "New Application"}{" "}
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
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] tracking-[0.08em] dm-sans-light-008">
            {" "}
            {error}{" "}
          </div>
        )}{" "}
        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5 w-full min-w-0 overflow-x-hidden">
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
              <span className="text-[8px] tracking-[0.08em] dm-sans-light-008 text-white/20 mt-2">
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
              <span className="text-[8px] tracking-[0.08em] dm-sans-light-008 text-white/20 mt-2">
                Identity Proof
              </span>{" "}
            </div>{" "}
          </div>{" "}
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            {" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/40 block">
                First Name
              </label>{" "}
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-2.5 md:p-3 text-white text-sm focus:outline-none focus:border-white/30 transition-colors dm-sans-light-008 placeholder:text-white/30"
                placeholder="Shayaan"
              />{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/40 block">
                Last Name
              </label>{" "}
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-2.5 md:p-3 text-white text-sm focus:outline-none focus:border-white/30 transition-colors dm-sans-light-008 placeholder:text-white/30"
                placeholder="Shaikh"
              />{" "}
            </div>{" "}
          </div>{" "}
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            {" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/40 block">
                Email Address
              </label>{" "}
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-2.5 md:p-3 text-white text-sm focus:outline-none focus:border-white/30 transition-colors dm-sans-light-008 placeholder:text-white/30"
                placeholder="hello@hamming.co"
              />{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/40 block">
                Phone Number
              </label>{" "}
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-2.5 md:p-3 text-white text-sm focus:outline-none focus:border-white/30 transition-colors dm-sans-light-008 placeholder:text-white/30"
                placeholder="+91 00000 00000"
              />{" "}
            </div>{" "}
          </div>{" "}
          <div className="w-full h-[1px] bg-white/10 my-4" />{" "}
          <div className="space-y-2">
            {" "}
            <label className="text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/40 block">
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
                className="w-full bg-white/5 border border-white/10 p-3 text-white text-sm focus:outline-none focus:border-white/30 transition-colors dm-sans-light-008 appearance-none cursor-pointer"
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
              <label className="text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/40 block">
                {" "}
                Start Date{" "}
                {isRenewal && (
                  <span className="text-red-500 ml-2 font-medium tracking-tight">
                    (FILL)
                  </span>
                )}{" "}
              </label>
              <input
                type="date"
                required
                lang="en-GB"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-2.5 md:p-3 text-white text-sm focus:outline-none focus:border-white/30 transition-colors dm-sans-light-008 [color-scheme:dark]"
              />{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/40 block">
                End Date (Auto)
              </label>
              <input
                type="date"
                readOnly
                lang="en-GB"
                value={endDate}
                className="w-full bg-white/5 border border-white/10 p-2.5 md:p-3 text-white/40 text-sm focus:outline-none dm-sans-light-008 cursor-not-allowed [color-scheme:dark]"
              />{" "}
            </div>{" "}
          </div>{" "}
          <div className="space-y-2">
            {" "}
            <label className="text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/40 block">
              Amount Paid (INR)
              {!initialData || isRenewal ? (
                <span className="text-red-500 ml-2 font-medium tracking-tight">
                  (REQUIRED)
                </span>
              ) : null}
            </label>{" "}
            <input
              type="number"
              min="0"
              step="0.01"
              required={!initialData || isRenewal}
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              className="w-full bg-white/5 border border-white/10 p-2.5 md:p-3 text-white text-sm focus:outline-none focus:border-white/30 transition-colors dm-sans-light-008 placeholder:text-white/30"
              placeholder="Enter the amount paid by client"
            />{" "}
          </div>{" "}
          <div className="pt-2">
            {" "}
            <button
              type="submit"
              disabled={loading}
              className="modal-submit-btn w-full py-3.5 px-4 text-[10px] tracking-[0.3em] font-medium dm-sans-light-008 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {" "}
              {loading
                ? "Processing..."
                : isRenewal
                  ? "Renew Membership"
                  : initialData
                    ? "Save Information"
                    : "Submit Application"}{" "}
            </button>{" "}
          </div>{" "}
        </form>{" "}
      </div>{" "}
    </div>
  );
};
export default CustomerModal;

