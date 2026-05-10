import { createClient } from "@supabase/supabase-js";
import Papa from "papaparse";
import { getEnv } from "./_env.js";

const CHUNK_SIZE = 500;

const getBearerToken = (req) => {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header || typeof header !== "string") return "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
};

const parseBody = (req) => {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
};

const splitChunks = (rows, size = CHUNK_SIZE) => {
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
};

const normalizeHeader = (header) =>
  String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const normalizeRowKeys = (row) => {
  const out = {};
  Object.entries(row || {}).forEach(([k, v]) => {
    out[normalizeHeader(k)] = v;
  });
  return out;
};

const normalizePhone = (value) => String(value || "").replace(/\D/g, "");
const normalizeEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const parseCsvText = (csvText) => {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors?.length) {
    const firstError = parsed.errors[0];
    throw new Error(firstError?.message || "Failed to parse CSV input.");
  }
  return parsed.data || [];
};

const mapCustomerRowFromPreset = (normalizedSource, sourcePreset) => {
  if (sourcePreset === "legacy_a") {
    return {
      first_name: String(normalizedSource.first_name || "").trim(),
      last_name: String(normalizedSource.last_name || "").trim(),
      phone: String(normalizedSource.mobile_no || normalizedSource.phone || "").trim(),
      email: String(normalizedSource.email_id || normalizedSource.email || "").trim().toLowerCase(),
      membership_duration: String(normalizedSource.plan || normalizedSource.membership_duration || "1 MONTH").trim(),
      membership_start_date: String(normalizedSource.start_date || normalizedSource.membership_start_date || "").trim(),
      membership_end_date: String(normalizedSource.end_date || normalizedSource.membership_end_date || "").trim(),
    };
  }

  if (sourcePreset === "legacy_b") {
    return {
      first_name: String(normalizedSource.firstname || normalizedSource.first_name || "").trim(),
      last_name: String(normalizedSource.lastname || normalizedSource.last_name || "").trim(),
      phone: String(normalizedSource.phone_number || normalizedSource.phone || "").trim(),
      email: String(normalizedSource.email || "").trim().toLowerCase(),
      membership_duration: String(normalizedSource.plan_name || normalizedSource.membership_duration || "1 MONTH").trim(),
      membership_start_date: String(normalizedSource.start_date || normalizedSource.membership_start_date || "").trim(),
      membership_end_date: String(normalizedSource.end_date || normalizedSource.membership_end_date || "").trim(),
    };
  }

  return {
    first_name: String(normalizedSource.first_name || normalizedSource.firstname || "").trim(),
    last_name: String(normalizedSource.last_name || normalizedSource.lastname || "").trim(),
    phone: String(normalizedSource.phone || normalizedSource.phone_number || "").trim(),
    email: String(normalizedSource.email || "").trim().toLowerCase(),
    membership_duration: String(normalizedSource.membership_duration || normalizedSource.plan_name || "1 MONTH").trim(),
    membership_start_date: String(normalizedSource.membership_start_date || normalizedSource.start_date || "").trim(),
    membership_end_date: String(normalizedSource.membership_end_date || normalizedSource.end_date || "").trim(),
  };
};

const mapPaymentRowFromPreset = (normalizedSource, sourcePreset) => {
  if (sourcePreset === "legacy_a") {
    return {
      amount: parseFloat(String(normalizedSource.amount || 0)),
      status: String(normalizedSource.status || "completed").toLowerCase(),
      payment_mode: String(normalizedSource.mode || normalizedSource.payment_mode || "cash").toLowerCase(),
      sender_name: String(normalizedSource.customer_name || normalizedSource.sender_name || "").trim(),
      sender_account_name: String(normalizedSource.account_name || normalizedSource.sender_account_name || "").trim(),
      source_transaction_id: String(normalizedSource.transaction_id || normalizedSource.source_transaction_id || "").trim(),
      created_at: String(normalizedSource.payment_date || normalizedSource.created_at || new Date().toISOString()),
    };
  }

  if (sourcePreset === "legacy_b") {
    return {
      amount: parseFloat(String(normalizedSource.amount || 0)),
      status: String(normalizedSource.payment_status || normalizedSource.status || "completed").toLowerCase(),
      payment_mode: String(normalizedSource.mode || normalizedSource.payment_mode || "cash").toLowerCase(),
      sender_name: String(normalizedSource.customer_name || normalizedSource.sender_name || "").trim(),
      sender_account_name: String(normalizedSource.sender_account_name || "").trim(),
      source_transaction_id: String(normalizedSource.transaction_id || normalizedSource.source_transaction_id || "").trim(),
      created_at: String(normalizedSource.created_at || new Date().toISOString()),
    };
  }

  return {
    amount: parseFloat(String(normalizedSource.amount || 0)),
    status: String(normalizedSource.status || "completed").toLowerCase(),
    payment_mode: String(normalizedSource.payment_mode || "cash").toLowerCase(),
    sender_name: String(normalizedSource.sender_name || normalizedSource.customer_name || "").trim(),
    sender_account_name: String(normalizedSource.sender_account_name || "").trim(),
    source_transaction_id: String(normalizedSource.transaction_id || normalizedSource.source_transaction_id || "").trim(),
    created_at: String(normalizedSource.created_at || new Date().toISOString()),
  };
};

const logImportJob = async (admin, {
  gymId,
  importType,
  sourceName,
  fileName,
  rawRows,
  normalizedRows,
  errors,
  reconciliations,
}) => {
  const startedAt = new Date().toISOString();

  const { data: job, error: jobError } = await admin
    .from("import_jobs")
    .insert({
      gym_id: gymId,
      source_name: sourceName,
      import_type: importType,
      status: "applied",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (jobError || !job) {
    throw jobError || new Error("Failed to create import job");
  }

  const jobId = job.id;

  const { error: fileError } = await admin.from("import_files").insert({
    job_id: jobId,
    gym_id: gymId,
    original_name: fileName,
    row_count: rawRows.length,
  });
  if (fileError) throw fileError;

  if (normalizedRows.length > 0) {
    const rowsToInsert = normalizedRows.map((row, index) => ({
      job_id: jobId,
      gym_id: gymId,
      row_index: index + 1,
      raw_payload: rawRows[index] || {},
      normalized_payload: row.normalizedPayload || {},
      validation_status: row.validationStatus || "valid",
    }));

    const rowChunks = splitChunks(rowsToInsert, 1000);
    for (const chunk of rowChunks) {
      const { error: rowsError } = await admin.from("import_rows").insert(chunk);
      if (rowsError) throw rowsError;
    }
  }

  if (errors.length > 0) {
    const errorsToInsert = errors.map((err) => ({
      job_id: jobId,
      gym_id: gymId,
      row_index: err.rowIndex,
      field_name: err.fieldName || null,
      error_code: err.errorCode || "VALIDATION_ERROR",
      error_message: err.errorMessage,
    }));

    const errorChunks = splitChunks(errorsToInsert, 1000);
    for (const chunk of errorChunks) {
      const { error: insertError } = await admin.from("import_errors").insert(chunk);
      if (insertError) throw insertError;
    }
  }

  if (reconciliations.length > 0) {
    const recRows = reconciliations.map((rec) => ({
      job_id: jobId,
      gym_id: gymId,
      metric_name: rec.metricName,
      legacy_value: rec.legacyValue || 0,
      imported_value: rec.importedValue || 0,
      variance: (rec.importedValue || 0) - (rec.legacyValue || 0),
    }));

    const { error: recError } = await admin.from("import_reconciliations").insert(recRows);
    if (recError) throw recError;
  }
};

const insertRowsWithFallback = async (admin, { table, rows, rowErrors, errorCode }) => {
  let successCount = 0;
  const successfulRowIndices = [];

  const chunks = splitChunks(rows, CHUNK_SIZE);
  for (const chunk of chunks) {
    const { error } = await admin.from(table).insert(chunk.map((r) => r.payload));
    if (!error) {
      successCount += chunk.length;
      chunk.forEach((row) => successfulRowIndices.push(row.rowIndex));
      continue;
    }

    for (const row of chunk) {
      const { error: rowError } = await admin.from(table).insert(row.payload);
      if (rowError) {
        rowErrors.push({
          rowIndex: row.rowIndex,
          fieldName: null,
          errorCode,
          errorMessage: rowError.message || `Failed to insert row in ${table}.`,
        });
      } else {
        successCount += 1;
        successfulRowIndices.push(row.rowIndex);
      }
    }
  }

  return { successCount, successfulRowIndices };
};

const sendNotifyEmail = async ({ notifyEmail, summary, resendApiKey, resendFromEmail }) => {
  if (!notifyEmail || !resendApiKey || !resendFromEmail) {
    return;
  }

  const lines = [
    "Your migration run has completed.",
    "",
    `Source preset: ${summary.sourcePreset}`,
    `Customers parsed: ${summary.customersParsed}`,
    `Customers imported: ${summary.customersInserted + summary.customersUpdated}`,
    `Payments parsed: ${summary.paymentsParsed}`,
    `Payments imported: ${summary.paymentsInserted}`,
    `Imported revenue: INR ${summary.importedRevenue.toLocaleString()}`,
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    signal: controller.signal,
    body: JSON.stringify({
      from: resendFromEmail,
      to: [notifyEmail],
      subject: "Migration Completed",
      text: lines.join("\n"),
    }),
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Failed to send migration completion email: ${response.status} ${errorText}`.trim());
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = getEnv("RESEND_API_KEY");
    const resendFromEmail = getEnv("RESEND_FROM_EMAIL");

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      throw new Error("Missing Supabase environment variables for migration runner.");
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Missing Authorization header" });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser(token);

    if (authError || !user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = parseBody(req);

    const sourcePreset = ["generic", "legacy_a", "legacy_b"].includes(body?.sourcePreset)
      ? body.sourcePreset
      : "generic";

    const customerCsv = String(body?.customerCsv || "").trim();
    const paymentCsv = String(body?.paymentCsv || "").trim();
    const customerFileName = String(body?.customerFileName || "customers.csv");
    const paymentFileName = String(body?.paymentFileName || "payments.csv");
    const notifyEmail = String(body?.notifyEmail || "").trim();

    if (!customerCsv && !paymentCsv) {
      return res.status(400).json({ error: "No CSV payload provided" });
    }

    const gymId = user.id;

    let customersParsed = 0;
    let customersInserted = 0;
    let customersUpdated = 0;
    let customersFailed = 0;

    let paymentsParsed = 0;
    let paymentsInserted = 0;
    let paymentsFailed = 0;
    let importedRevenue = 0;

    if (customerCsv) {
      const rawRows = parseCsvText(customerCsv);
      customersParsed = rawRows.length;

      const normalizedRows = [];
      const validationErrors = [];

      rawRows.forEach((row, index) => {
        const normalizedSource = normalizeRowKeys(row);
        const mapped = mapCustomerRowFromPreset(normalizedSource, sourcePreset);

        const normalizedPayload = {
          ...mapped,
          phone: normalizePhone(mapped.phone),
          email: normalizeEmail(mapped.email),
        };

        const rowErrors = [];
        if (!normalizedPayload.first_name && !normalizedPayload.last_name) rowErrors.push("First or last name required");
        if (!normalizedPayload.phone && !normalizedPayload.email) rowErrors.push("Phone or email required");

        const validationStatus = rowErrors.length ? "invalid" : "valid";
        normalizedRows.push({
          rowIndex: index + 1,
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

      const validRows = normalizedRows.filter((r) => r.validationStatus === "valid");

      const existingByPhone = new Map();
      const existingByEmail = new Map();
      const batchSize = 100;

      const incomingPhones = new Set();
      const incomingEmails = new Set();

      validRows.forEach((row) => {
        const phone = normalizePhone(row.normalizedPayload.phone);
        const email = normalizeEmail(row.normalizedPayload.email);
        if (phone) incomingPhones.add(phone);
        if (email) incomingEmails.add(email);
      });

      const phoneBatches = Array.from(incomingPhones).reduce((acc, phone, idx) => {
        if (idx % batchSize === 0) acc.push([]);
        acc[Math.floor(idx / batchSize)].push(phone);
        return acc;
      }, []);

      const emailBatches = Array.from(incomingEmails).reduce((acc, email, idx) => {
        if (idx % batchSize === 0) acc.push([]);
        acc[Math.floor(idx / batchSize)].push(email);
        return acc;
      }, []);

      for (const phoneBatch of phoneBatches) {
        const { data: matches, error } = await admin
          .from("customers")
          .select("id, phone")
          .eq("gym_id", gymId)
          .in("phone", phoneBatch);
        if (error) throw error;
        (matches || []).forEach((customer) => {
          const phone = normalizePhone(customer.phone);
          if (phone) existingByPhone.set(phone, customer.id);
        });
      }

      for (const emailBatch of emailBatches) {
        const { data: matches, error } = await admin
          .from("customers")
          .select("id, email")
          .eq("gym_id", gymId)
          .in("email", emailBatch);
        if (error) throw error;
        (matches || []).forEach((customer) => {
          const email = normalizeEmail(customer.email);
          if (email) existingByEmail.set(email, customer.id);
        });
      }

      const updates = [];
      const insertsByKey = new Map();

      validRows.forEach((row) => {
        const payload = row.normalizedPayload;
        const phone = normalizePhone(payload.phone);
        const email = normalizeEmail(payload.email);
        const matchId = (phone && existingByPhone.get(phone)) || (email && existingByEmail.get(email));

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
              ...(payload.membership_duration ? { membership_duration: payload.membership_duration } : {}),
              ...(payload.membership_start_date ? { membership_start_date: payload.membership_start_date } : {}),
              ...(payload.membership_end_date ? { membership_end_date: payload.membership_end_date } : {}),
            },
          });
          return;
        }

        const key = phone || email || `row-${row.rowIndex}`;
        if (!insertsByKey.has(key)) {
          insertsByKey.set(key, {
            rowIndex: row.rowIndex,
            normalizedPayload: payload,
          });
        }
      });

      const dbErrors = [...validationErrors];

      const updateChunks = splitChunks(updates, 100);
      for (const updateChunk of updateChunks) {
        const results = await Promise.all(
          updateChunk.map(async (item) => {
            const { error } = await admin
              .from("customers")
              .update(item.payload)
              .eq("id", item.id)
              .eq("gym_id", gymId);
            return { item, error };
          }),
        );

        results.forEach(({ item, error }) => {
          if (error) {
            dbErrors.push({
              rowIndex: item.rowIndex,
              fieldName: null,
              errorCode: "CUSTOMER_UPDATE_FAILED",
              errorMessage: error.message || "Failed to update existing customer.",
            });
          } else {
            customersUpdated += 1;
          }
        });
      }

      const insertRows = Array.from(insertsByKey.values()).map((row) => ({
        rowIndex: row.rowIndex,
        payload: {
          ...row.normalizedPayload,
          gym_id: gymId,
          updated_at: new Date().toISOString(),
        },
      }));

      const { successCount } = await insertRowsWithFallback(admin, {
        table: "customers",
        rows: insertRows,
        rowErrors: dbErrors,
        errorCode: "CUSTOMER_INSERT_FAILED",
      });

      customersInserted = successCount;
      customersFailed = dbErrors.length - validationErrors.length;

      await logImportJob(admin, {
        gymId,
        importType: "customers",
        sourceName: `auto_${sourcePreset}`,
        fileName: customerFileName,
        rawRows,
        normalizedRows: normalizedRows.map((row) => ({
          normalizedPayload: row.normalizedPayload,
          validationStatus: row.validationStatus,
        })),
        errors: dbErrors,
        reconciliations: [
          {
            metricName: "customers_count",
            legacyValue: rawRows.length,
            importedValue: customersInserted + customersUpdated,
          },
        ],
      });
    }

    if (paymentCsv) {
      const rawRows = parseCsvText(paymentCsv);
      paymentsParsed = rawRows.length;

      const normalizedRows = [];
      const validationErrors = [];

      rawRows.forEach((row, index) => {
        const normalizedSource = normalizeRowKeys(row);
        const normalizedPayload = mapPaymentRowFromPreset(normalizedSource, sourcePreset);

        const amount = parseFloat(String(normalizedPayload.amount || 0));
        const rowErrors = [];

        if (!Number.isFinite(amount) || amount <= 0) rowErrors.push("Amount must be a valid number > 0");
        if (!["completed", "pending", "failed"].includes(normalizedPayload.status)) {
          rowErrors.push("Status must be completed, pending, or failed");
        }
        if (!normalizedPayload.sender_name) rowErrors.push("Sender name required");
        if (normalizedPayload.payment_mode === "upi" && !normalizedPayload.source_transaction_id) {
          rowErrors.push("Transaction ID required for UPI payments");
        }

        const validationStatus = rowErrors.length ? "invalid" : "valid";
        normalizedRows.push({
          rowIndex: index + 1,
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

      const validRows = normalizedRows.filter((r) => r.validationStatus === "valid");
      const dbErrors = [...validationErrors];

      const rowsForInsert = validRows.map((row) => ({
        rowIndex: row.rowIndex,
        payload: {
          gym_id: gymId,
          subscription_id: null,
          ...row.normalizedPayload,
        },
      }));

      const { successCount, successfulRowIndices } = await insertRowsWithFallback(admin, {
        table: "payments",
        rows: rowsForInsert,
        rowErrors: dbErrors,
        errorCode: "PAYMENT_INSERT_FAILED",
      });

      paymentsInserted = successCount;
      paymentsFailed = dbErrors.length - validationErrors.length;

      const successfulRowIndexSet = new Set(successfulRowIndices);
      importedRevenue = validRows
        .filter((row) => row.normalizedPayload.status === "completed" && successfulRowIndexSet.has(row.rowIndex))
        .reduce((sum, row) => sum + parseFloat(String(row.normalizedPayload.amount || 0)), 0);

      await logImportJob(admin, {
        gymId,
        importType: "payments",
        sourceName: `auto_${sourcePreset}`,
        fileName: paymentFileName,
        rawRows,
        normalizedRows: normalizedRows.map((row) => ({
          normalizedPayload: row.normalizedPayload,
          validationStatus: row.validationStatus,
        })),
        errors: dbErrors,
        reconciliations: [
          {
            metricName: "payments_count",
            legacyValue: rawRows.length,
            importedValue: paymentsInserted,
          },
          {
            metricName: "completed_revenue",
            legacyValue: 0,
            importedValue: importedRevenue,
          },
        ],
      });
    }

    const summary = {
      sourcePreset,
      customersParsed,
      customersInserted,
      customersUpdated,
      customersFailed,
      paymentsParsed,
      paymentsInserted,
      paymentsFailed,
      importedRevenue,
    };

    await sendNotifyEmail({
      notifyEmail,
      summary,
      resendApiKey,
      resendFromEmail,
    });

    return res.status(200).json({
      success: true,
      message: "Background migration completed on server.",
      summary,
    });
  } catch (error) {
    console.error("run-auto-migration error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown server error",
    });
  }
}
