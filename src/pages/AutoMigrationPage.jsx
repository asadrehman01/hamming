import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import {
  getImportSourcePreset,
  logImportJob,
  mapCustomerRowFromPreset,
  mapPaymentRowFromPreset,
  normalizeRowKeys,
} from "../lib/importJobs";
import {
  isMigrationOnboardingCompleted,
  markMigrationOnboardingLocal,
} from "../lib/migrationOnboarding";
const CHUNK_SIZE = 500;
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
const parseCsvFile = (file) =>
  new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data || []),
      error: (error) => reject(error),
    });
  });
const AutoMigrationPage = ({ onboarding = false }) => {
  const navigate = useNavigate();
  const [customerFile, setCustomerFile] = useState(null);
  const [paymentFile, setPaymentFile] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runStatus, setRunStatus] = useState(null);
  const [summary, setSummary] = useState(null);
  const [runMode, setRunMode] = useState("background");
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);
  const [processingUser, setProcessingUser] = useState(null);
  const sourcePreset = getImportSourcePreset();
  const sourcePresetLabel = useMemo(() => {
    if (sourcePreset === "legacy_a") return "Old App Format 1";
    if (sourcePreset === "legacy_b") return "Old App Format 2";
    return "Standard File Format";
  }, [sourcePreset]);
  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setProcessingUser(user || null);
      if (onboarding && user && isMigrationOnboardingCompleted(user)) {
        navigate("/dashboard", { replace: true });
      }
    };
    loadUser();
  }, [navigate, onboarding]);
  const markOnboardingCompleted = async () => {
    if (!processingUser) return;
    markMigrationOnboardingLocal();
    await supabase.auth.updateUser({
      data: {
        ...processingUser.user_metadata,
        migration_onboarding_completed: true,
      },
    });
  };
  const sendCompletionEmail = async (userEmail, resultSummary) => {
    if (!notifyOnComplete || !userEmail) return;
    const lines = [
      "Your migration run has completed.",
      "",
      `Source preset: ${resultSummary.sourcePreset}`,
      `Customers parsed: ${resultSummary.customersParsed}`,
      `Customers imported: ${resultSummary.customersInserted + resultSummary.customersUpdated}`,
      `Payments parsed: ${resultSummary.paymentsParsed}`,
      `Payments imported: ${resultSummary.paymentsInserted}`,
      `Imported revenue: INR ${resultSummary.importedRevenue.toLocaleString()}`,
    ];
    try {
      await supabase.functions.invoke("broadcast-email", {
        body: {
          subject: "Migration Completed",
          message: lines.join("\n"),
          recipientGroup: "INDIVIDUAL",
          recipientEmail: userEmail,
        },
      });
    } catch (error) {
      console.error("Completion email failed:", error);
    }
  };
  const runServerBackgroundMigration = async ({ user }) => {
    const customerCsv = customerFile ? await customerFile.text() : null;
    const paymentCsv = paymentFile ? await paymentFile.text() : null;
    const { data, error } = await supabase.functions.invoke(
      "run-auto-migration",
      {
        body: {
          sourcePreset,
          customerCsv,
          customerFileName: customerFile?.name || null,
          paymentCsv,
          paymentFileName: paymentFile?.name || null,
          notifyEmail: notifyOnComplete ? user.email : null,
        },
      },
    );
    if (error) throw error;
    return data;
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
  const processCustomers = async ({ userId }) => {
    if (!customerFile) {
      return { parsed: 0, inserted: 0, updated: 0, failed: 0, errors: [] };
    }
    const rawRows = await parseCsvFile(customerFile);
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
      if (!normalizedPayload.first_name && !normalizedPayload.last_name) {
        rowErrors.push("First or last name required");
      }
      if (!normalizedPayload.phone && !normalizedPayload.email) {
        rowErrors.push("Phone or email required");
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
    (existingCustomers || []).forEach((customer) => {
      const phone = normalizePhone(customer.phone);
      const email = normalizeEmail(customer.email);
      if (phone) existingByPhone.set(phone, customer.id);
      if (email) existingByEmail.set(email, customer.id);
    });
    const updates = [];
    const insertsByKey = new Map();
    validRows.forEach((row) => {
      const payload = row.normalizedPayload;
      const phone = normalizePhone(payload.phone);
      const email = normalizeEmail(payload.email);
      const matchId =
        (phone && existingByPhone.get(phone)) ||
        (email && existingByEmail.get(email));
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
      const key = phone || email || `row-${row.rowIndex}`;
      if (insertsByKey.has(key)) {
        const existing = insertsByKey.get(key);
        insertsByKey.set(key, {
          ...existing,
          normalizedPayload: {
            ...existing.normalizedPayload,
            ...Object.fromEntries(
              Object.entries(payload).filter(([, value]) => Boolean(value)),
            ),
          },
        });
        return;
      }
      insertsByKey.set(key, row);
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
    const insertRows = Array.from(insertsByKey.values()).map((row) => ({
      rowIndex: row.rowIndex,
      payload: {
        ...row.normalizedPayload,
        gym_id: userId,
        updated_at: new Date().toISOString(),
      },
    }));
    const { successCount: inserted } = await insertRowsWithFallback({
      table: "customers",
      rows: insertRows,
      rowErrors: dbErrors,
      errorCode: "CUSTOMER_INSERT_FAILED",
    });
    await logImportJob({
      gymId: userId,
      importType: "customers",
      sourceName: `auto_${sourcePreset}`,
      fileName: customerFile.name,
      rawRows,
      normalizedRows,
      errors: dbErrors,
      reconciliations: [
        {
          metricName: "customers_count",
          legacyValue: rawRows.length,
          importedValue: inserted + updated,
        },
      ],
      status: "applied",
    });
    return {
      parsed: rawRows.length,
      inserted,
      updated,
      failed: Math.max(0, dbErrors.length - validationErrors.length),
      errors: dbErrors,
    };
  };
  const processPayments = async ({ userId }) => {
    if (!paymentFile) {
      return {
        parsed: 0,
        inserted: 0,
        failed: 0,
        errors: [],
        completedRevenue: 0,
      };
    }
    const rawRows = await parseCsvFile(paymentFile);
    const normalizedRows = [];
    const validationErrors = [];
    rawRows.forEach((row, index) => {
      const normalizedSource = normalizeRowKeys(row);
      const normalizedPayload = mapPaymentRowFromPreset(
        normalizedSource,
        sourcePreset,
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
    const rowsForInsert = validRows.map((row) => ({
      rowIndex: row.rowIndex,
      payload: {
        gym_id: userId,
        subscription_id: null,
        ...row.normalizedPayload,
      },
    }));
    const { successCount: inserted, successfulRowIndices } =
      await insertRowsWithFallback({
        table: "payments",
        rows: rowsForInsert,
        rowErrors: dbErrors,
        errorCode: "PAYMENT_INSERT_FAILED",
      });
    const completedRevenue = validRows
      .filter(
        (row) =>
          row.normalizedPayload.status === "completed" &&
          successfulRowIndices.includes(row.rowIndex),
      )
      .reduce(
        (sum, row) => sum + parseFloat(row.normalizedPayload.amount || 0),
        0,
      );
    await logImportJob({
      gymId: userId,
      importType: "payments",
      sourceName: `auto_${sourcePreset}`,
      fileName: paymentFile.name,
      rawRows,
      normalizedRows,
      errors: dbErrors,
      reconciliations: [
        {
          metricName: "payments_count",
          legacyValue: rawRows.length,
          importedValue: inserted,
        },
        {
          metricName: "completed_revenue",
          legacyValue: 0,
          importedValue: completedRevenue,
        },
      ],
      status: "applied",
    });
    return {
      parsed: rawRows.length,
      inserted,
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
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      setProcessingUser(user);
      if (runMode === "background") {
        const backgroundResult = await runServerBackgroundMigration({ user });
        setRunStatus({
          type: "success",
          message:
            backgroundResult?.message ||
            "Background migration started. You can close the app and results will continue processing.",
        });
        if (onboarding) {
          await markOnboardingCompleted();
          setTimeout(() => navigate("/dashboard"), 600);
        }
        return;
      }
      const [customerResult, paymentResult] = await Promise.all([
        processCustomers({ userId: user.id }),
        processPayments({ userId: user.id }),
      ]);
      const finalSummary = {
        sourcePreset: sourcePresetLabel,
        customersParsed: customerResult.parsed,
        customersInserted: customerResult.inserted,
        customersUpdated: customerResult.updated,
        customersFailed: customerResult.failed,
        paymentsParsed: paymentResult.parsed,
        paymentsInserted: paymentResult.inserted,
        paymentsFailed: paymentResult.failed,
        importedRevenue: paymentResult.completedRevenue,
      };
      setSummary(finalSummary);
      await sendCompletionEmail(user.email, finalSummary);
      if (onboarding) {
        await markOnboardingCompleted();
      }
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
        message:
          runMode === "background"
            ? "Background runner is not deployed yet. Use In-App mode now, or deploy run-auto-migration edge function."
            : error.message || "Auto migration failed.",
      });
    } finally {
      setIsRunning(false);
    }
  };
  return (
    <div className="app-page native-buttons-page p-6 md:p-10">
      {" "}
      <div className="w-full max-w-[1200px] mx-auto space-y-6">
        {" "}
        <header className="space-y-2">
          {" "}
          <p className="text-[10px] tracking-[0.25em] font-mono text-white/40">
            Automatic Data Move
          </p>{" "}
          <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-white">
            {onboarding
              ? "Welcome Setup: Move Your Data"
              : "Move Your Data Automatically"}
          </h1>{" "}
          <p className="text-sm text-white/50">
            {" "}
            Upload your data files and we will move everything for you. No
            manual mapping needed.{" "}
          </p>{" "}
          <div className="border border-white/10 bg-white/[0.02] p-3 space-y-1">
            {" "}
            <p className="text-[10px] tracking-[0.12em] font-mono text-white/60">
              Quick Steps
            </p>{" "}
            <p className="text-xs text-white/55">
              Step 1: Pick how you want this to run.
            </p>{" "}
            <p className="text-xs text-white/55">
              Step 2: Select your member and payment files.
            </p>{" "}
            <p className="text-xs text-white/55">
              Step 3: Click Start Automatic Move.
            </p>{" "}
          </div>{" "}
        </header>{" "}
        <section className="border border-white/10 bg-white/[0.02] p-5 md:p-6 space-y-5">
          {" "}
          <p className="text-[10px] tracking-[0.15em] font-mono text-emerald-300">
            {" "}
            Selected format: {sourcePresetLabel}{" "}
          </p>{" "}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {" "}
            <button
              type="button"
              onClick={() => setRunMode("background")}
              className={`border p-3 text-left transition-colors ${runMode === "background" ? "border-emerald-500/40 bg-emerald-500/10" : "border-white/10 hover:border-white/20"}`}
            >
              {" "}
              <p className="text-sm text-white">Safe Background Mode</p>{" "}
              <p className="text-[10px] text-white/40 tracking-[0.15em] mt-1">
                Keeps running even if you close the app
              </p>{" "}
            </button>{" "}
            <button
              type="button"
              onClick={() => setRunMode("in_app")}
              className={`border p-3 text-left transition-colors ${runMode === "in_app" ? "border-emerald-500/40 bg-emerald-500/10" : "border-white/10 hover:border-white/20"}`}
            >
              {" "}
              <p className="text-sm text-white">Quick In-App Mode</p>{" "}
              <p className="text-[10px] text-white/40 tracking-[0.15em] mt-1">
                Runs now while this screen is open
              </p>{" "}
            </button>{" "}
          </div>{" "}
          <label className="flex items-center gap-2 text-[10px] tracking-[0.15em] text-white/50 font-mono">
            {" "}
            <input
              type="checkbox"
              checked={notifyOnComplete}
              onChange={(e) => setNotifyOnComplete(e.target.checked)}
            />{" "}
            Email me when migration completes{" "}
          </label>{" "}
          <p className="text-[10px] text-white/45 -mt-3">
            Optional: turn this on if you want a completion email.
          </p>{" "}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {" "}
            <label className="border border-white/10 p-4 cursor-pointer hover:border-white/20 transition-colors">
              {" "}
              <p className="text-sm text-white">Member Data File</p>{" "}
              <p className="text-[10px] text-white/45 mt-1">
                Step 2A: Add your member file here.
              </p>{" "}
              <p className="text-[10px] text-white/40 tracking-[0.15em] mt-1">
                {" "}
                {customerFile ? customerFile.name : "Select file"}{" "}
              </p>{" "}
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => setCustomerFile(e.target.files?.[0] || null)}
              />{" "}
            </label>{" "}
            <label className="border border-white/10 p-4 cursor-pointer hover:border-white/20 transition-colors">
              {" "}
              <p className="text-sm text-white">Payment Data File</p>{" "}
              <p className="text-[10px] text-white/45 mt-1">
                Step 2B: Add your payment file here.
              </p>{" "}
              <p className="text-[10px] text-white/40 tracking-[0.15em] mt-1">
                {" "}
                {paymentFile ? paymentFile.name : "Select file"}{" "}
              </p>{" "}
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => setPaymentFile(e.target.files?.[0] || null)}
              />{" "}
            </label>{" "}
          </div>{" "}
          {runStatus && (
            <div
              className={`p-3 border text-xs ${runStatus.type === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}
            >
              {" "}
              {runStatus.message}{" "}
            </div>
          )}{" "}
          <button
            type="button"
            onClick={runAutoMigration}
            disabled={isRunning}
            className="bg-white text-black px-5 py-2 text-[10px] tracking-[0.2em] font-medium disabled:opacity-50"
          >
            {" "}
            {isRunning
              ? runMode === "background"
                ? "Starting Background Migration..."
                : "Running Auto Migration..."
              : runMode === "background"
                ? "Start Automatic Move (Background)"
                : "Start Automatic Move Now"}{" "}
          </button>{" "}
          <p className="text-[10px] text-white/45">
            Step 3: Use this button to begin the automatic move.
          </p>{" "}
        </section>{" "}
        {summary && (
          <section className="border border-white/10 bg-white/[0.02] p-5 md:p-6">
            {" "}
            <p className="text-[10px] tracking-[0.2em] font-mono text-white/40 mb-4">
              Move Summary
            </p>{" "}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {" "}
              <div className="border border-white/10 p-3">
                {" "}
                <p className="text-[9px] tracking-[0.15em] text-white/30">
                  Members Found
                </p>{" "}
                <p className="text-lg text-white mt-1">
                  {summary.customersParsed}
                </p>{" "}
              </div>{" "}
              <div className="border border-white/10 p-3">
                {" "}
                <p className="text-[9px] tracking-[0.15em] text-white/30">
                  Members Moved
                </p>{" "}
                <p className="text-lg text-emerald-400 mt-1">
                  {summary.customersInserted + summary.customersUpdated}
                </p>{" "}
              </div>{" "}
              <div className="border border-white/10 p-3">
                {" "}
                <p className="text-[9px] tracking-[0.15em] text-white/30">
                  Members Not Moved
                </p>{" "}
                <p className="text-lg text-red-400 mt-1">
                  {summary.customersFailed}
                </p>{" "}
              </div>{" "}
              <div className="border border-white/10 p-3">
                {" "}
                <p className="text-[9px] tracking-[0.15em] text-white/30">
                  Payments Found
                </p>{" "}
                <p className="text-lg text-white mt-1">
                  {summary.paymentsParsed}
                </p>{" "}
              </div>{" "}
              <div className="border border-white/10 p-3">
                {" "}
                <p className="text-[9px] tracking-[0.15em] text-white/30">
                  Payments Moved
                </p>{" "}
                <p className="text-lg text-emerald-400 mt-1">
                  {summary.paymentsInserted}
                </p>{" "}
              </div>{" "}
              <div className="border border-white/10 p-3">
                {" "}
                <p className="text-[9px] tracking-[0.15em] text-white/30">
                  Revenue Moved
                </p>{" "}
                <p className="text-lg text-emerald-500 mt-1">
                  ₹{summary.importedRevenue.toLocaleString()}
                </p>{" "}
              </div>{" "}
            </div>{" "}
          </section>
        )}{" "}
      </div>{" "}
    </div>
  );
};
export default AutoMigrationPage;
