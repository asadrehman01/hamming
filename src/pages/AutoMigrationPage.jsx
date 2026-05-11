import React, { useEffect, useState } from "react";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { getUserWithRetry } from "../lib/authUser";
import { runAutoMigrationOnServer } from "../lib/backendApi";
import {
  getImportSourcePreset,
  logImportJob,
  mapCustomerRowFromPreset,
  mapPaymentRowFromPreset,
  detectImportSourcePresetFromRows,
  normalizeRowKeys,
  normalizeMembershipDuration,
} from "../lib/importJobs";
import { toMonthStartDateString } from "../lib/financeDates";
import {
  isMigrationOnboardingCompleted,
  markMigrationOnboardingLocal,
} from "../lib/migrationOnboarding";
const CHUNK_SIZE = 500;
const SUBSCRIPTION_LOOKUP_CHUNK_SIZE = 1000;
const splitChunks = (rows, size = CHUNK_SIZE) => {
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
};
const normalizePhone = (value) => String(value || "").replace(/\D/g, "");
const normalizeEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
const normalizeName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
const parseDateOnly = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};
const getTodayMidnight = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};
const pickRowPhone = (normalizedSource = {}) =>
  normalizePhone(
    normalizedSource.sender_phone ||
      normalizedSource.phone ||
      normalizedSource.mobile_no ||
      normalizedSource.phone_number ||
      normalizedSource.customer_phone ||
      "",
  );
const pickRowEmail = (normalizedSource = {}) =>
  normalizeEmail(
    normalizedSource.sender_email ||
      normalizedSource.email ||
      normalizedSource.email_id ||
      normalizedSource.customer_email ||
      "",
  );
const getCustomerFullName = (customer) =>
  normalizeName(`${customer.first_name || ""} ${customer.last_name || ""}`);

const toDateKey = (value) => {
  const parsed = parseDateOnly(value);
  if (!parsed) return "";
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const resolveCustomerMatch = ({ senderName, sourceRow, customers }) => {
  const normalizedSenderName = normalizeName(senderName);
  if (!normalizedSenderName) {
    return {
      customer: null,
      reason: "Sender name missing.",
      tier: "unmatched",
      score: 0,
    };
  }

  const nameMatches = customers.filter(
    (customer) => getCustomerFullName(customer) === normalizedSenderName,
  );

  if (nameMatches.length === 0) {
    return {
      customer: null,
      reason: "No customer found for payer name.",
      tier: "unmatched",
      score: 0,
    };
  }

  if (nameMatches.length === 1) {
    return { customer: nameMatches[0], reason: null, tier: "exact", score: 100 };
  }

  const phone = pickRowPhone(sourceRow);
  if (phone) {
    const phoneMatches = nameMatches.filter(
      (customer) => normalizePhone(customer.phone) === phone,
    );
    if (phoneMatches.length === 1) {
      return { customer: phoneMatches[0], reason: null, tier: "exact", score: 100 };
    }
  }

  const email = pickRowEmail(sourceRow);
  if (email) {
    const emailMatches = nameMatches.filter(
      (customer) => normalizeEmail(customer.email) === email,
    );
    if (emailMatches.length === 1) {
      return { customer: emailMatches[0], reason: null, tier: "exact", score: 100 };
    }
  }

  return {
    customer: nameMatches[0] || null,
    reason: "Multiple customers found for payer name. Add payer phone/email in sheet.",
    tier: "review",
    score: 75,
  };
};
const removeEmptyRows = (rows = []) =>
  rows.filter((row) =>
    Object.values(row || {}).some((value) => String(value ?? "").trim() !== ""),
  );

const parseImportFile = (file) =>
  new Promise((resolve, reject) => {
    const fileName = String(file?.name || "").toLowerCase();
    const isXlsx = fileName.endsWith(".xlsx");
    const isXls = fileName.endsWith(".xls");

    if (isXls) {
      reject(
        new Error("Legacy .xls files are not supported. Please save as .xlsx or .csv."),
      );
      return;
    }

    if (isXlsx) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const arrayBuffer = event?.target?.result;
          if (!arrayBuffer) throw new Error("Failed to read Excel file.");

          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(arrayBuffer);
          const worksheet = workbook.worksheets?.[0];
          if (!worksheet) {
            resolve([]);
            return;
          }

          const headerRow = worksheet.getRow(1);
          const headers = [];
          headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            headers[colNumber - 1] = String(cell?.text || "").trim();
          });

          const rows = [];
          for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
            const row = worksheet.getRow(rowNumber);
            const rowPayload = {};
            let hasAnyValue = false;
            headers.forEach((header, index) => {
              if (!header) return;
              const cell = row.getCell(index + 1);
              const value = String(cell?.text ?? "").trim();
              if (value) hasAnyValue = true;
              rowPayload[header] = value;
            });
            if (hasAnyValue) {
              rows.push(rowPayload);
            }
          }

          resolve(removeEmptyRows(rows));
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () =>
        reject(new Error("Failed to parse Excel file. Please retry."));
      reader.readAsArrayBuffer(file);
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(removeEmptyRows(results.data || [])),
      error: (error) => reject(error),
    });
  });

const AutoMigrationPage = ({ onboarding = false, embedded = false }) => {
  const navigate = useNavigate();
  const [customerFile, setCustomerFile] = useState(null);
  const [paymentFile, setPaymentFile] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runStatus, setRunStatus] = useState(null);
  const [summary, setSummary] = useState(null);
  const [processingUser, setProcessingUser] = useState(null);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const notifyOnboardingRefresh = (detail = {}) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("onboarding:refresh", { detail }));
    }
  };
  const sourcePreset = getImportSourcePreset();
  const sourcePresetLabel = "Standard File Format";
  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await getUserWithRetry(supabase);
      setProcessingUser(user || null);
      if (onboarding && user && isMigrationOnboardingCompleted(user)) {
        navigate("/dashboard", { replace: true });
        return;
      }
      if (user && !isMigrationOnboardingCompleted(user)) {
        setShowDecisionModal(true);
      }
    };
    loadUser();
  }, [navigate, onboarding]);
  const markOnboardingCompleted = async ({ user = processingUser, metadataPatch = {} } = {}) => {
    if (!user) return;
    markMigrationOnboardingLocal();
    await supabase.auth.updateUser({
      data: {
        ...(user.user_metadata || {}),
        migration_onboarding_completed: true,
        ...metadataPatch,
      },
    });
    setProcessingUser((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        user_metadata: {
          ...(prev.user_metadata || {}),
          migration_onboarding_completed: true,
          ...metadataPatch,
        },
      };
    });
  };
  const handlePerformMigrationChoice = () => {
    setShowDecisionModal(false);
  };
  const handleSkipMigrationChoice = async () => {
    setDecisionLoading(true);
    try {
      await markOnboardingCompleted({ metadataPatch: { migration_onboarding_skipped: true } });
      notifyOnboardingRefresh({ migrationStepComplete: true });
      setShowDecisionModal(false);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      console.error("Failed to save migration choice:", error);
      setRunStatus({
        type: "error",
        message: "Could not save your migration choice. Please try again.",
      });
    } finally {
      setDecisionLoading(false);
    }
  };
  const runServerBackgroundMigration = async ({ user }) => {
    const customerCsv = customerFile ? await customerFile.text() : null;
    const paymentCsv = paymentFile ? await paymentFile.text() : null;
    return runAutoMigrationOnServer({
      sourcePreset,
      customerCsv,
      customerFileName: customerFile?.name || null,
      paymentCsv,
      paymentFileName: paymentFile?.name || null,
      notifyEmail: user?.email || null,
    });
  };
  const insertRowsWithFallback = async ({
    table,
    rows,
    rowErrors,
    errorCode,
  }) => {
    let successCount = 0;
    let failedCount = 0;
    const successfulRowIndices = [];
    const chunks = splitChunks(rows, CHUNK_SIZE);
    for (const chunk of chunks) {
      const { error } = await supabase
        .from(table)
        .insert(chunk.map((r) => r.payload));
      if (!error) {
        successCount += chunk.length;
        chunk.forEach((row) => successfulRowIndices.push(row.rowIndex));
        continue;
      }
      for (const row of chunk) {
        const { error: rowError } = await supabase
          .from(table)
          .insert(row.payload);
        if (rowError) {
          failedCount += 1;
          rowErrors.push({
            rowIndex: row.rowIndex,
            fieldName: null,
            errorCode,
            errorMessage:
              rowError.message || `Failed to insert row in ${table}.`,
          });
        } else {
          successCount += 1;
          successfulRowIndices.push(row.rowIndex);
        }
      }
    }
    return { successCount, failedCount, successfulRowIndices };
  };
  const processCustomers = async ({ userId, activePreset, rawRows = null }) => {
    if (!customerFile) {
      return { parsed: 0, inserted: 0, updated: 0, failed: 0, errors: [] };
    }
    const customerRows = Array.isArray(rawRows)
      ? rawRows
      : await parseImportFile(customerFile);
    const normalizedRows = [];
    const validationErrors = [];
    customerRows.forEach((row, index) => {
      const normalizedSource = normalizeRowKeys(row);
      const mapped = mapCustomerRowFromPreset(normalizedSource, activePreset);
      const normalizedPayload = {
        ...mapped,
        membership_duration: normalizeMembershipDuration(mapped.membership_duration),
        phone: normalizePhone(mapped.phone),
        email: normalizeEmail(mapped.email),
      };
      const rowErrors = [];
      if (!normalizedPayload.first_name && !normalizedPayload.last_name) {
        rowErrors.push("First or last name required");
      }
      if (!normalizedPayload.phone && !normalizedPayload.email) {
        rowErrors.push("Phone or email required");
      }
      const validationStatus = rowErrors.length ? "invalid" : "valid";
      normalizedRows.push({
        rowIndex: index + 1,
        normalizedSource,
        normalizedPayload,
        validationStatus,
      });
      rowErrors.forEach((message) => {
        validationErrors.push({
          rowIndex: index + 1,
          fieldName: null,
          errorCode: "CUSTOMER_VALIDATION",
          errorMessage: message,
        });
      });
    });
    const validRows = normalizedRows.filter(
      (row) => row.validationStatus === "valid",
    );
    const { data: existingCustomers, error: existingError } = await supabase
      .from("customers")
      .select(
        "id, first_name, last_name, phone, email, membership_duration, membership_start_date, membership_end_date",
      )
      .eq("gym_id", userId);
    if (existingError) throw existingError;
    const existingByPhone = new Map();
    const existingByEmail = new Map();
    const existingByName = new Map();
    (existingCustomers || []).forEach((customer) => {
      const phone = normalizePhone(customer.phone);
      const email = normalizeEmail(customer.email);
      const nameKey = `${String(customer.first_name || "").trim().toLowerCase()}|${String(customer.last_name || "").trim().toLowerCase()}`;
      if (phone) existingByPhone.set(phone, customer.id);
      if (email) existingByEmail.set(email, customer.id);
      if (nameKey !== "|") existingByName.set(nameKey, customer.id);
    });
    const updates = [];
    const insertRows = [];
    validRows.forEach((row) => {
      const payload = row.normalizedPayload;
      const phone = normalizePhone(payload.phone);
      const email = normalizeEmail(payload.email);
      const nameKey = `${String(payload.first_name || "").trim().toLowerCase()}|${String(payload.last_name || "").trim().toLowerCase()}`;
      const phoneMatch = phone && existingByPhone.get(phone);
      const emailMatch = email && existingByEmail.get(email);
      const nameMatch = nameKey !== "|" ? existingByName.get(nameKey) : null;
      const phoneAndEmailMatch =
        phoneMatch && emailMatch && phoneMatch === emailMatch ? phoneMatch : null;
      const matchId =
        phoneAndEmailMatch ||
        (phoneMatch && nameMatch && phoneMatch === nameMatch ? phoneMatch : null) ||
        (emailMatch && nameMatch && emailMatch === nameMatch ? emailMatch : null);
      if (matchId) {
        updates.push({
          rowIndex: row.rowIndex,
          id: matchId,
          payload: {
            updated_at: new Date().toISOString(),
            ...(payload.first_name ? { first_name: payload.first_name } : {}),
            ...(payload.last_name ? { last_name: payload.last_name } : {}),
            ...(payload.phone ? { phone: payload.phone } : {}),
            ...(payload.email ? { email: payload.email } : {}),
            ...(payload.membership_duration
              ? { membership_duration: payload.membership_duration }
              : {}),
            ...(payload.membership_start_date
              ? { membership_start_date: payload.membership_start_date }
              : {}),
            ...(payload.membership_end_date
              ? { membership_end_date: payload.membership_end_date }
              : {}),
          },
        });
        return;
      }
      insertRows.push({
        rowIndex: row.rowIndex,
        payload: {
          ...payload,
          gym_id: userId,
          updated_at: new Date().toISOString(),
        },
      });
    });
    const dbErrors = [...validationErrors];
    let updated = 0;
    let updateFailed = 0;
    const updateChunks = splitChunks(updates, 100);
    for (const updateChunk of updateChunks) {
      const results = await Promise.all(
        updateChunk.map(async (item) => {
          const { error } = await supabase
            .from("customers")
            .update(item.payload)
            .eq("id", item.id)
            .eq("gym_id", userId);
          return { item, error };
        }),
      );
      results.forEach(({ item, error }) => {
        if (error) {
          updateFailed += 1;
          dbErrors.push({
            rowIndex: item.rowIndex,
            fieldName: null,
            errorCode: "CUSTOMER_UPDATE_FAILED",
            errorMessage:
              error.message || "Failed to update existing customer.",
          });
        } else {
          updated += 1;
        }
      });
    }
    const { successCount: inserted } = await insertRowsWithFallback({
      table: "customers",
      rows: insertRows,
      rowErrors: dbErrors,
      errorCode: "CUSTOMER_INSERT_FAILED",
    });

    const { data: planRows, error: planError } = await supabase
      .from("membership_plans")
      .select("duration_type, price");
    if (planError) throw planError;

    const planPriceMap = new Map();
    (planRows || []).forEach((plan) => {
      planPriceMap.set(
        normalizeMembershipDuration(plan.duration_type),
        Number(plan.price || 0),
      );
    });

    const { data: refreshedCustomers, error: refreshedCustomersError } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone, email")
      .eq("gym_id", userId)
      .order("created_at", { ascending: false });
    if (refreshedCustomersError) throw refreshedCustomersError;

    const byPhone = new Map();
    const byEmail = new Map();
    const byName = new Map();
    (refreshedCustomers || []).forEach((customer) => {
      const phone = normalizePhone(customer.phone);
      const email = normalizeEmail(customer.email);
      const nameKey = getCustomerFullName(customer);
      if (phone && !byPhone.has(phone)) byPhone.set(phone, customer.id);
      if (email && !byEmail.has(email)) byEmail.set(email, customer.id);
      if (nameKey && !byName.has(nameKey)) byName.set(nameKey, customer.id);
    });

    const uniqueCustomerIds = Array.from(
      new Set((refreshedCustomers || []).map((c) => c.id).filter(Boolean)),
    );

    let existingSubscriptionKeySet = new Set();
    if (uniqueCustomerIds.length > 0) {
      const customerChunks = splitChunks(
        uniqueCustomerIds,
        SUBSCRIPTION_LOOKUP_CHUNK_SIZE,
      );
      for (const chunk of customerChunks) {
        const { data: existingSubs, error: existingSubsError } = await supabase
          .from("subscriptions")
          .select("customer_id, plan_name, created_at")
          .eq("gym_id", userId)
          .in("customer_id", chunk);
        if (existingSubsError) throw existingSubsError;
        (existingSubs || []).forEach((sub) => {
          existingSubscriptionKeySet.add(
            `${sub.customer_id}|${normalizeMembershipDuration(sub.plan_name)}|${toDateKey(sub.created_at)}`,
          );
        });
      }
    }

    const sortedForHistory = [...validRows].sort((left, right) => {
      const leftTime = parseDateOnly(left.normalizedPayload.membership_start_date)?.getTime() || 0;
      const rightTime = parseDateOnly(right.normalizedPayload.membership_start_date)?.getTime() || 0;
      return leftTime - rightTime;
    });

    let historyCreated = 0;
    for (const row of sortedForHistory) {
      const payload = row.normalizedPayload;
      const phone = normalizePhone(payload.phone);
      const email = normalizeEmail(payload.email);
      const nameKey = normalizeName(`${payload.first_name || ""} ${payload.last_name || ""}`);
      const customerId = byPhone.get(phone) || byEmail.get(email) || byName.get(nameKey);
      if (!customerId) continue;

      const normalizedDuration = normalizeMembershipDuration(payload.membership_duration);
      const startDate = parseDateOnly(payload.membership_start_date) || new Date();
      const endDate = parseDateOnly(payload.membership_end_date);
      const createdDateKey = toDateKey(startDate);
      const subscriptionKey = `${customerId}|${normalizedDuration}|${createdDateKey}`;
      if (existingSubscriptionKeySet.has(subscriptionKey)) continue;

      const { error: subInsertError } = await supabase.from("subscriptions").insert({
        gym_id: userId,
        customer_id: customerId,
        plan_name: normalizedDuration,
        amount: Number(planPriceMap.get(normalizedDuration) || 0),
        status: endDate && endDate < new Date() ? "COMPLETED" : "ACTIVE",
        created_at: startDate.toISOString(),
        updated_at: startDate.toISOString(),
      });
      if (subInsertError) {
        dbErrors.push({
          rowIndex: row.rowIndex,
          fieldName: "membership_duration",
          errorCode: "SUBSCRIPTION_HISTORY_FAILED",
          errorMessage: subInsertError.message || "Failed to create subscription history row.",
        });
        continue;
      }

      existingSubscriptionKeySet.add(subscriptionKey);
      historyCreated += 1;
    }
    await logImportJob({
      gymId: userId,
      importType: "customers",
      sourceName: `auto_${activePreset}`,
      fileName: customerFile.name,
      rawRows: customerRows,
      normalizedRows,
      errors: dbErrors,
      reconciliations: [
        {
          metricName: "customers_count",
          legacyValue: customerRows.length,
          importedValue: inserted + updated,
        },
        {
          metricName: "subscription_history_count",
          legacyValue: 0,
          importedValue: historyCreated,
        },
      ],
      status: "applied",
    });
    return {
      parsed: customerRows.length,
      inserted,
      updated,
      failed: Math.max(0, dbErrors.length - validationErrors.length),
      errors: dbErrors,
    };
  };
  const processPayments = async ({ userId, activePreset, rawRows = null }) => {
    if (!paymentFile) {
      return {
        parsed: 0,
        inserted: 0,
        failed: 0,
        errors: [],
        completedRevenue: 0,
      };
    }
    const paymentRows = Array.isArray(rawRows)
      ? rawRows
      : await parseImportFile(paymentFile);
    const normalizedRows = [];
    const validationErrors = [];
    paymentRows.forEach((row, index) => {
      const normalizedSource = normalizeRowKeys(row);
      const normalizedPayload = mapPaymentRowFromPreset(
        normalizedSource,
        activePreset,
      );
      const amount = parseFloat(normalizedPayload.amount || 0);
      const rowErrors = [];
      if (!Number.isFinite(amount) || amount <= 0) {
        rowErrors.push("Amount must be a valid number > 0");
      }
      if (
        !["completed", "pending", "failed"].includes(normalizedPayload.status)
      ) {
        rowErrors.push("Status must be completed, pending, or failed");
      }
      if (!normalizedPayload.sender_name) {
        rowErrors.push("Sender name required");
      }
      if (
        normalizedPayload.payment_mode === "upi" &&
        !normalizedPayload.source_transaction_id
      ) {
        rowErrors.push("Transaction ID required for UPI payments");
      }
      const validationStatus = rowErrors.length ? "invalid" : "valid";
      normalizedRows.push({
        rowIndex: index + 1,
        normalizedSource,
        normalizedPayload,
        validationStatus,
      });
      rowErrors.forEach((message) => {
        validationErrors.push({
          rowIndex: index + 1,
          fieldName: null,
          errorCode: "PAYMENT_VALIDATION",
          errorMessage: message,
        });
      });
    });
    const validRows = normalizedRows.filter(
      (row) => row.validationStatus === "valid",
    );
    const dbErrors = [...validationErrors];
    const { data: customersData, error: customersError } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone, email, membership_start_date, membership_end_date")
      .eq("gym_id", userId);
    if (customersError) throw customersError;
    const customers = customersData || [];
    let inserted = 0;
    let completedRevenue = 0;
    let unmatchedCount = 0;
    let reviewCount = 0;
    let matchedCount = 0;
    let inactiveCount = 0;
    let activeCount = 0;
    for (const row of validRows) {
      const { customer, reason, tier, score } = resolveCustomerMatch({
        senderName: row.normalizedPayload.sender_name,
        sourceRow: row.normalizedSource,
        customers,
      });

      const effectiveDate =
        parseDateOnly(row.normalizedPayload.created_at) || getTodayMidnight();
      const startDate = parseDateOnly(customer?.membership_start_date);
      const endDate = parseDateOnly(customer?.membership_end_date);
      const isActive = Boolean(
        startDate &&
          endDate &&
          effectiveDate &&
          startDate <= effectiveDate &&
          effectiveDate <= endDate,
      );

      const mappedStatus =
        tier === "review" ? "pending" : tier === "unmatched" ? "failed" : isActive ? row.normalizedPayload.status : "inactive";

      const insertPayload = {
        gym_id: userId,
        subscription_id: null,
        matched_customer_id: tier === "exact" ? customer?.id || null : null,
        revenue_month: toMonthStartDateString(customer?.membership_start_date || effectiveDate),
        ...row.normalizedPayload,
        status: mappedStatus,
      };
      const { error } = await supabase.from("payments").insert(insertPayload);
      if (error) {
        dbErrors.push({
          rowIndex: row.rowIndex,
          fieldName: null,
          errorCode: "PAYMENT_INSERT_FAILED",
          errorMessage: error.message || "Failed to import payment row.",
        });
        continue;
      }

      inserted += 1;
      if (tier === "review") {
        reviewCount += 1;
      } else if (tier === "unmatched") {
        unmatchedCount += 1;
      } else {
        matchedCount += 1;
      }

      if (mappedStatus === "completed") {
        activeCount += 1;
        completedRevenue += parseFloat(row.normalizedPayload.amount || 0);
      } else if (mappedStatus === "inactive") {
        inactiveCount += 1;
      } else {
        dbErrors.push({
          rowIndex: row.rowIndex,
          fieldName: "sender_name",
          errorCode: tier === "review" ? "PAYMENT_REVIEW_REQUIRED" : "PAYMENT_UNMATCHED",
          errorMessage:
            tier === "review"
              ? `${reason || "Close name match found."} Similarity ${score.toFixed(1)}%.`
              : "Name doesn't match any existing customer. Transaction saved as unmatched.",
        });
      }
    }
    await logImportJob({
      gymId: userId,
      importType: "payments",
      sourceName: `auto_${activePreset}`,
      fileName: paymentFile.name,
      rawRows: paymentRows,
      normalizedRows,
      errors: dbErrors,
      reconciliations: [
        {
          metricName: "payments_count",
          legacyValue: paymentRows.length,
          importedValue: inserted,
        },
        {
          metricName: "completed_revenue",
          legacyValue: 0,
          importedValue: completedRevenue,
        },
        {
          metricName: "payments_active",
          legacyValue: 0,
          importedValue: activeCount,
        },
        {
          metricName: "payments_inactive",
          legacyValue: 0,
          importedValue: inactiveCount,
        },
        {
          metricName: "payments_unmatched",
          legacyValue: 0,
          importedValue: unmatchedCount,
        },
        {
          metricName: "payments_review_required",
          legacyValue: 0,
          importedValue: reviewCount,
        },
      ],
      status: "applied",
    });
    return {
      parsed: paymentRows.length,
      inserted,
      matchedCount,
      reviewCount,
      unmatchedCount,
      failed: Math.max(0, dbErrors.length - validationErrors.length),
      errors: dbErrors,
      completedRevenue,
    };
  };
  const runAutoMigration = async () => {
    if (!customerFile && !paymentFile) {
      setRunStatus({
        type: "error",
        message: "Upload at least one CSV file before running auto migration.",
      });
      return;
    }
    setIsRunning(true);
    setRunStatus(null);
    setSummary(null);
    try {
      const {
        data: { user },
      } = await getUserWithRetry(supabase);
      if (!user) throw new Error("User not authenticated");
      setProcessingUser(user);

      const customerRawRows = customerFile
        ? await parseImportFile(customerFile)
        : [];
      const paymentRawRows = paymentFile
        ? await parseImportFile(paymentFile)
        : [];
      const detectedCustomerPreset = detectImportSourcePresetFromRows(customerRawRows);
      const detectedPaymentPreset = detectImportSourcePresetFromRows(paymentRawRows);
      const activePreset =
        detectedCustomerPreset !== "generic"
          ? detectedCustomerPreset
          : detectedPaymentPreset !== "generic"
            ? detectedPaymentPreset
            : sourcePreset;

      // Always process customers first so payment matching uses the latest customer data.
      const customerResult = await processCustomers({
        userId: user.id,
        activePreset,
        rawRows: customerRawRows,
      });

      const paymentResult = await processPayments({
        userId: user.id,
        activePreset,
        rawRows: paymentRawRows,
      });
      const finalSummary = {
        sourcePreset: sourcePresetLabel,
        customersParsed: customerResult.parsed,
        customersInserted: customerResult.inserted,
        customersUpdated: customerResult.updated,
        customersFailed: customerResult.failed,
        paymentsParsed: paymentResult.parsed,
        paymentsInserted: paymentResult.inserted,
        paymentsMatched: paymentResult.matchedCount,
        paymentsNeedsReview: paymentResult.reviewCount,
        paymentsUnmatched: paymentResult.unmatchedCount,
        paymentsFailed: paymentResult.failed,
        importedRevenue: paymentResult.completedRevenue,
      };
      setSummary(finalSummary);
      await markOnboardingCompleted({
        user,
        metadataPatch: { migration_onboarding_skipped: false },
      });
      notifyOnboardingRefresh({ migrationStepComplete: true });
      setRunStatus({
        type: "success",
        message:
          "Auto migration finished. Data has been imported without manual intervention.",
      });
      if (onboarding) {
        setTimeout(() => navigate("/dashboard"), 700);
      }
    } catch (error) {
      console.error("Auto migration failed:", error);
      setRunStatus({
        type: "error",
        message: error.message || "Auto migration failed.",
      });
    } finally {
      setIsRunning(false);
    }
  };
  const migrationContent = (
    <div className="migration-page-vibe space-y-6">
      <style>{` 
.migration-page-vibe { background-color: #ffffff !important; color: #0d0d0d; min-height: 100vh; }
.migration-page-vibe h1, .migration-page-vibe h2, .migration-page-vibe h3, .migration-page-vibe .migration-header-title { font-family: 'Playfair Display', serif; font-weight: 400; color: #0d0d0d; letter-spacing: 0.02em; }
.migration-page-vibe .migration-subtle { color: #666666; }
.migration-page-vibe [class*="text-white/"] { color: #666666 !important; }
.migration-page-vibe [class*="text-white"] { color: #0d0d0d !important; }
.migration-page-vibe [class*="bg-[#151921]"], .migration-page-vibe [class*="bg-white/[0.02]"], .migration-page-vibe [class*="bg-white/[0.04]"], .migration-page-vibe [class*="bg-white/[0.05]"], .migration-page-vibe [class*="bg-black/20"] { background-color: #fbfbfb !important; }
.migration-page-vibe [class*="border-white"] { border-color: #e6e6e6 !important; }
.migration-page-vibe button { border-color: #e0e0e0 !important; }
`}</style>
        {showDecisionModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-3 sm:px-4 animate-in fade-in duration-300"
          >
            <div
              className="bg-[#fbfbfb] border border-[#e6e6e6] w-full max-w-xl shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden rounded-2xl p-6 sm:p-8"
              role="dialog"
              aria-modal="true"
            >
              <h2 className="migration-header-title migration-decision-title text-xl sm:text-2xl leading-tight text-[#0d0d0d] mb-1">
                Migration Setup
              </h2>
              <p className="text-[13px] sm:text-sm migration-subtle leading-relaxed">
                Do you want to transfer old data? Choosing "Not right now" will skip data transferring and you will not be redirected to integrations on future logins.
                <br />
                You can perform migration later!
              </p>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={handleSkipMigrationChoice}
                  disabled={decisionLoading}
                  className="flex-1 px-4 py-3 text-[12px] sm:text-[13px] tracking-wide font-medium border border-[#e0e0e0] rounded-xl text-[#0d0d0d] hover:bg-[#f4f4f4] transition-colors disabled:opacity-50"
                >
                  {decisionLoading ? "Saving..." : "Not right now"}
                </button>
                <button
                  type="button"
                  onClick={handlePerformMigrationChoice}
                  disabled={decisionLoading}
                  className="flex-1 px-4 py-3 text-[12px] sm:text-[13px] tracking-wide font-medium rounded-xl bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50"
                >
                  Perform migration
                </button>
              </div>
            </div>
          </div>
        )}
        {" "}
        {!embedded && (
        <header className="space-y-2">
          {" "}
          <p className="text-[10px] tracking-[0.25em] font-mono migration-subtle">
            Automatic Data Move
          </p>{" "}
          <h1 className="migration-header-title text-3xl md:text-4xl font-medium tracking-[0.02em] text-[#0d0d0d]">
            {onboarding
              ? "Welcome Setup: Move Your Data"
              : "Move Your Data Automatically"}
          </h1>{" "}
          <p className="text-sm migration-subtle">
            {" "}
            Upload your data files and we will move everything for you. No
            manual mapping needed.{" "}
          </p>{" "}
          <div className="border border-[#e6e6e6] bg-white p-3 space-y-1 rounded-xl shadow-sm">
            {" "}
            <p className="migration-header-title text-[10px] tracking-[0.12em] text-[#0d0d0d] uppercase">
              Quick Steps
            </p>{" "}
            <p className="text-xs migration-subtle">Step 1: Select your files.</p>{" "}
            <p className="text-xs migration-subtle">
              Step 2: Start migration.
            </p>{" "}
            <p className="text-xs migration-subtle">
              Step 3: Wait for completion summary.
            </p>{" "}
          </div>{" "}
        </header>
        )}{" "}
        <section className="border border-[#e6e6e6] bg-[#fbfbfb] p-5 md:p-6 space-y-5 rounded-2xl shadow-sm">
          {" "}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {" "}
            <label className="border border-[#e6e6e6] p-4 cursor-pointer hover:border-[#d6d6d6] transition-colors rounded-xl bg-white">
              {" "}
              <p className="migration-header-title text-sm text-[#0d0d0d]">Member Data File</p>{" "}
              <p className="text-[10px] migration-subtle mt-1">
                Step 2A: Add your member file here.
              </p>{" "}
              <p className="text-[10px] text-[#666666] tracking-[0.15em] mt-1">
                {" "}
                {customerFile ? customerFile.name : "Select file"}{" "}
              </p>{" "}
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => setCustomerFile(e.target.files?.[0] || null)}
              />{" "}
            </label>{" "}
            <label className="border border-[#e6e6e6] p-4 cursor-pointer hover:border-[#d6d6d6] transition-colors rounded-xl bg-white">
              {" "}
              <p className="migration-header-title text-sm text-[#0d0d0d]">Payment Data File</p>{" "}
              <p className="text-[10px] migration-subtle mt-1">
                Step 2B: Add your payment file here.
              </p>{" "}
              <p className="text-[10px] text-[#666666] tracking-[0.15em] mt-1">
                {" "}
                {paymentFile ? paymentFile.name : "Select file"}{" "}
              </p>{" "}
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => setPaymentFile(e.target.files?.[0] || null)}
              />{" "}
            </label>{" "}
          </div>{" "}
          {runStatus && (
            <div
              className={`p-3 border text-xs rounded-xl ${runStatus.type === "success" ? "border-[#e6e6e6] bg-white text-[#0d0d0d]" : "border-red-500/30 bg-red-500/10 text-red-400"}`}
            >
              {" "}
              {runStatus.message}{" "}
            </div>
          )}{" "}
          <button
            type="button"
            onClick={runAutoMigration}
            disabled={isRunning}
            className="bg-white text-black px-5 py-2 text-[10px] tracking-[0.2em] font-medium border border-[#e6e6e6] rounded-lg disabled:opacity-50"
          >
            {" "}
            {isRunning ? "Starting Migration..." : "Start Automatic Move"}{" "}
          </button>{" "}
          <p className="text-[10px] migration-subtle">
            This now runs directly on this page to ensure all rows are processed consistently.
          </p>{" "}
        </section>{" "}
        {summary && (
          <section className="border border-[#e6e6e6] bg-[#fbfbfb] p-5 md:p-6 rounded-2xl shadow-sm">
            {" "}
            <p className="migration-header-title text-[10px] tracking-[0.2em] text-[#0d0d0d] uppercase mb-4">
              Move Summary
            </p>{" "}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {" "}
              <div className="border border-[#e6e6e6] p-3 rounded-xl bg-white">
                {" "}
                <p className="text-[9px] tracking-[0.15em] migration-subtle uppercase">
                  Members Found
                </p>{" "}
                <p className="text-lg text-[#0d0d0d] mt-1">
                  {summary.customersParsed}
                </p>{" "}
              </div>{" "}
              <div className="border border-[#e6e6e6] p-3 rounded-xl bg-white">
                {" "}
                <p className="text-[9px] tracking-[0.15em] migration-subtle uppercase">
                  Members Moved
                </p>{" "}
                <p className="text-lg text-[#0d0d0d] mt-1">
                  {summary.customersInserted + summary.customersUpdated}
                </p>{" "}
              </div>{" "}
              <div className="border border-[#e6e6e6] p-3 rounded-xl bg-white">
                {" "}
                <p className="text-[9px] tracking-[0.15em] migration-subtle uppercase">
                  Members Not Moved
                </p>{" "}
                <p className="text-lg text-red-400 mt-1">
                  {summary.customersFailed}
                </p>{" "}
              </div>{" "}
              <div className="border border-[#e6e6e6] p-3 rounded-xl bg-white">
                {" "}
                <p className="text-[9px] tracking-[0.15em] migration-subtle uppercase">
                  Payments Found
                </p>{" "}
                <p className="text-lg text-[#0d0d0d] mt-1">
                  {summary.paymentsParsed}
                </p>{" "}
              </div>{" "}
              <div className="border border-[#e6e6e6] p-3 rounded-xl bg-white">
                {" "}
                <p className="text-[9px] tracking-[0.15em] migration-subtle uppercase">
                  Payments Moved
                </p>{" "}
                <p className="text-lg text-[#0d0d0d] mt-1">
                  {summary.paymentsInserted}
                </p>{" "}
              </div>{" "}
              <div className="border border-[#e6e6e6] p-3 rounded-xl bg-white">
                {" "}
                <p className="text-[9px] tracking-[0.15em] migration-subtle uppercase">
                  Revenue Moved
                </p>{" "}
                <p className="text-lg text-[#0d0d0d] mt-1">
                  ₹{summary.importedRevenue.toLocaleString()}
                </p>{" "}
              </div>{" "}
            </div>{" "}
          </section>
        )}{" "}
    </div>
  );
  if (embedded) return migrationContent;
  return (
    <div className="app-page migration-page-vibe native-buttons-page p-6 md:p-10 integrations-typography">
      <div className="w-full max-w-[1200px] mx-auto">{migrationContent}</div>
    </div>
  );
};
export default AutoMigrationPage;

