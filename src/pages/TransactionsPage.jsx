import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { getUserWithRetry } from "../lib/authUser";
import Papa from "papaparse";
import {
  logImportJob,
  normalizeRowKeys,
  mapPaymentRowFromPreset,
  getImportSourcePreset,
} from "../lib/importJobs";
import { toMonthStartDateString } from "../lib/financeDates";
const TransactionsPage = () => {
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
  const isCustomerActiveNow = (customer) => {
    const start = parseDateOnly(customer?.membership_start_date);
    const end = parseDateOnly(customer?.membership_end_date);
    if (!start || !end) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return start <= today && today <= end;
  };
  const [transactions, setTransactions] = useState([]);
  const [customerDirectory, setCustomerDirectory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [isStatusVisible, setIsStatusVisible] = useState(false);
  const [senderMatches, setSenderMatches] = useState([]);
  const [showSenderMatches, setShowSenderMatches] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [paymentImportFileName, setPaymentImportFileName] = useState("");
  const [paymentImportRows, setPaymentImportRows] = useState([]);
  const [paymentImportErrors, setPaymentImportErrors] = useState([]);
  const [paymentFailedRows, setPaymentFailedRows] = useState([]);
  const [paymentImportLoading, setPaymentImportLoading] = useState(false);
  const [paymentImportStatus, setPaymentImportStatus] = useState(null);
  const [isSelectingSender, setIsSelectingSender] = useState(false);
  const blurTimeoutRef = useRef(null);
  const currentSourcePreset = getImportSourcePreset();
  const sourcePresetLabel =
    currentSourcePreset === "legacy_a"
      ? "Old App Format 1"
      : currentSourcePreset === "legacy_b"
        ? "Old App Format 2"
        : "Standard File Format";
  const [formData, setFormData] = useState({
    payment_mode: "cash",
    status: "completed",
    amount: "",
    sender_name: "",
    sender_account_name: "",
    source_transaction_id: "",
  });
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    fetchTransactions();
    fetchCustomerDirectory();
  }, []);
  useEffect(() => {
    const channel = supabase
      .channel("transactions-ledger-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        () => {
          fetchTransactions();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        () => {
          fetchCustomerDirectory();
          fetchTransactions();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  useEffect(() => {
    if (!statusMessage) return;
    setIsStatusVisible(true);
    const fadeOutId = setTimeout(() => {
      setIsStatusVisible(false);
    }, 14500);
    const timeoutId = setTimeout(() => {
      setStatusMessage(null);
    }, 15000);
    return () => {
      clearTimeout(fadeOutId);
      clearTimeout(timeoutId);
    };
  }, [statusMessage]);
  useEffect(() => {
    if (isSelectingSender) {
      setIsSelectingSender(false);
      return;
    }
    const query = formData.sender_name.trim().toLowerCase();
    if (!query) {
      setSenderMatches([]);
      setShowSenderMatches(false);
      setSelectedCustomerId(null);
      return;
    }
    const matches = customerDirectory.filter((customer) => {
      const fullName =
        `${customer.first_name || ""} ${customer.last_name || ""}`
          .trim()
          .toLowerCase();
      return fullName.includes(query);
    });
    setSenderMatches(matches);
    setShowSenderMatches(true);
  }, [formData.sender_name, customerDirectory]);
  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await getUserWithRetry(supabase);
      if (!user) throw new Error("User not authenticated");
      const { data, error } = await supabase
        .from("payments")
        .select(
          `
            id,
            amount,
            status,
            payment_mode,
            sender_name,
            sender_account_name,
            source_transaction_id,
            matched_customer_id,
            revenue_month,
            created_at,
            subscriptions (
              plan_name,
              customers (
                first_name,
                last_name,
                membership_start_date,
                membership_end_date
              )
            )
          `,
        )
        .eq("gym_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setLoading(false);
    }
  };
  const fetchCustomerDirectory = async () => {
    try {
      const {
        data: { user },
      } = await getUserWithRetry(supabase);
      if (!user) throw new Error("User not authenticated");
      const { data, error } = await supabase
        .from("customers")
        .select("id, first_name, last_name, membership_start_date, membership_end_date")
        .eq("gym_id", user.id)
        .order("first_name", { ascending: true });
      if (error) throw error;
      setCustomerDirectory(data || []);
    } catch (error) {
      console.error("Error fetching customer directory:", error);
    }
  };
  const handleSenderNameChange = (value) => {
    setFormData({ ...formData, sender_name: value });
    setSelectedCustomerId(null);
  };
  const handleSelectSender = (customer) => {
    setIsSelectingSender(true);
    const fullName =
      `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
    setFormData({ ...formData, sender_name: fullName });
    setSelectedCustomerId(customer.id);
    setShowSenderMatches(false);
  };
  const parsePaymentCsv = async (file) => {
    if (!file) return;
    setPaymentImportStatus(null);
    setPaymentImportFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data || [];
        const sourcePreset = getImportSourcePreset();
        const normalizedRows = [];
        const validationErrors = [];
        rows.forEach((row, index) => {
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
            !["completed", "pending", "failed"].includes(
              normalizedPayload.status,
            )
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
            normalizedPayload,
            validationStatus,
            rowIndex: index + 1,
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
        setPaymentImportRows(normalizedRows);
        setPaymentImportErrors(validationErrors);
        setPaymentFailedRows([]);
      },
      error: () => {
        setPaymentImportStatus({
          type: "error",
          message: "Failed to parse CSV file.",
        });
      },
    });
  };
  const runPaymentImportRows = async ({ rows, userId }) => {
    let insertedCount = 0;
    const failedRows = [];
    const applyErrors = [];
    let matchedCount = 0;
    let unmatchedCount = 0;
    const directorySnapshot = [...customerDirectory];
    for (const row of rows) {
      const matchedCustomer = directorySnapshot.find(
        (customer) =>
          normalizeName(`${customer.first_name || ""} ${customer.last_name || ""}`) ===
          normalizeName(row.normalizedPayload.sender_name),
      );
      const sourceDate = row.normalizedPayload.created_at || new Date().toISOString();
      const insertPayload = {
        gym_id: userId,
        subscription_id: null,
        matched_customer_id: matchedCustomer?.id || null,
        revenue_month: toMonthStartDateString(matchedCustomer?.membership_start_date || sourceDate),
        ...row.normalizedPayload,
      };
      const { error } = await supabase.from("payments").insert(insertPayload);
      if (error) {
        failedRows.push(row);
        applyErrors.push({
          rowIndex: row.rowIndex,
          fieldName: null,
          errorCode: "PAYMENT_INSERT_FAILED",
          errorMessage: error.message || "Failed to import payment row.",
        });
      } else {
        insertedCount += 1;
        if (matchedCustomer) {
          matchedCount += 1;
        } else {
          unmatchedCount += 1;
        }
      }
    }
    return { insertedCount, failedRows, applyErrors, matchedCount, unmatchedCount };
  };
  const applyPaymentImport = async () => {
    setPaymentImportLoading(true);
    setPaymentImportStatus(null);
    try {
      const {
        data: { user },
      } = await getUserWithRetry(supabase);
      if (!user) throw new Error("User not authenticated");
      const validRows = paymentImportRows.filter(
        (r) => r.validationStatus === "valid",
      );
      const { insertedCount, failedRows, applyErrors, matchedCount, unmatchedCount } =
        await runPaymentImportRows({ rows: validRows, userId: user.id });
      setPaymentFailedRows(failedRows);
      const completedTotal = validRows
        .filter((r) => r.normalizedPayload.status === "completed")
        .reduce(
          (sum, r) => sum + parseFloat(r.normalizedPayload.amount || 0),
          0,
        );
      await logImportJob({
        gymId: user.id,
        importType: "payments",
        sourceName: "csv_upload",
        fileName: paymentImportFileName,
        rawRows: paymentImportRows.map((r) => r.normalizedPayload),
        normalizedRows: paymentImportRows,
        errors: [...paymentImportErrors, ...applyErrors],
        reconciliations: [
          {
            metricName: "payments_count",
            legacyValue: paymentImportRows.length,
            importedValue: insertedCount,
          },
          {
            metricName: "completed_revenue",
            legacyValue: 0,
            importedValue: completedTotal,
          },
        ],
      });
      setPaymentImportStatus({
        type: "success",
        message: `Imported ${insertedCount} payment rows. ${matchedCount} matched customers, ${unmatchedCount} unmatched. ${failedRows.length} rows failed and can be retried. ₹${completedTotal.toLocaleString()} revenue added.`,
      });
      await fetchTransactions();
    } catch (error) {
      console.error("Payment import failed:", error);
      setPaymentImportStatus({
        type: "error",
        message: error.message || "Payment import failed.",
      });
    } finally {
      setPaymentImportLoading(false);
    }
  };
  const retryFailedPaymentRows = async () => {
    if (paymentFailedRows.length === 0) return;
    setPaymentImportLoading(true);
    setPaymentImportStatus(null);
    const rowsToLog = paymentFailedRows;
    try {
      const {
        data: { user },
      } = await getUserWithRetry(supabase);
      if (!user) throw new Error("User not authenticated");
      const { insertedCount, failedRows, applyErrors } =
        await runPaymentImportRows({
          rows: paymentFailedRows,
          userId: user.id,
        });
      setPaymentFailedRows(failedRows);

      await logImportJob({
        gymId: user.id,
        importType: "payments",
        sourceName: "csv_retry",
        fileName: paymentImportFileName || "retry_rows",
        rawRows: rowsToLog.map((row) => row.normalizedPayload),
        normalizedRows: rowsToLog,
        errors: applyErrors,
        reconciliations: [
          {
            metricName: "payments_count",
            legacyValue: rowsToLog.length,
            importedValue: insertedCount,
          },
        ],
        status: failedRows.length === 0 ? "applied" : "failed",
      });
      setPaymentImportStatus({
        type: failedRows.length === 0 ? "success" : "error",
        message:
          failedRows.length === 0
            ? `Retry successful. ${insertedCount} rows imported.`
            : `Retry finished. ${failedRows.length} rows are still failing.`,
      });
      await fetchTransactions();
    } catch (error) {
      console.error("Retry failed:", error);
      try {
        const {
          data: { user },
        } = await getUserWithRetry(supabase);

        if (user?.id) {
          await logImportJob({
            gymId: user.id,
            importType: "payments",
            sourceName: "csv_retry",
            fileName: paymentImportFileName || "retry_rows",
            rawRows: rowsToLog.map((row) => row.normalizedPayload),
            normalizedRows: rowsToLog,
            errors: [
              {
                rowIndex: null,
                fieldName: null,
                errorCode: "PAYMENT_RETRY_FAILED",
                errorMessage: error.message || "Retry failed.",
              },
            ],
            reconciliations: [],
            status: "failed",
          });
        }
      } catch (logError) {
        console.error("Failed to log retry failure:", logError);
      }

      setPaymentImportStatus({
        type: "error",
        message: error.message || "Retry failed.",
      });
    } finally {
      setPaymentImportLoading(false);
    }
  };
  const handleManualTransaction = async (e) => {
    e.preventDefault();
    setStatusMessage(null);
    const parsedAmount = Number(formData.amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setStatusMessage({
        type: "error",
        message: "Enter a valid amount greater than 0.",
      });
      return;
    }
    if (!formData.sender_name.trim()) {
      setStatusMessage({ type: "error", message: "Sender name is required." });
      return;
    }
    if (formData.payment_mode === "upi") {
      if (!formData.sender_account_name.trim()) {
        setStatusMessage({
          type: "error",
          message: "Account name is required for UPI payments.",
        });
        return;
      }
      if (!formData.source_transaction_id.trim()) {
        setStatusMessage({
          type: "error",
          message: "Transaction ID is required for UPI payments.",
        });
        return;
      }
    }
    setSaving(true);
    try {
      const {
        data: { user },
      } = await getUserWithRetry(supabase);
      if (!user) throw new Error("User not authenticated");
      const payload = {
        gym_id: user.id,
        subscription_id: null,
        amount: parsedAmount,
        status: formData.status,
        payment_mode: formData.payment_mode,
        sender_name: formData.sender_name.trim(),
        sender_account_name:
          formData.payment_mode === "upi"
            ? formData.sender_account_name.trim()
            : null,
        source_transaction_id:
          formData.payment_mode === "upi"
            ? formData.source_transaction_id.trim()
            : null,
      };
      const matchedCustomer =
        customerDirectory.find(
          (customer) =>
            normalizeName(`${customer.first_name || ""} ${customer.last_name || ""}`) ===
            normalizeName(formData.sender_name),
        ) || null;
      payload.matched_customer_id = selectedCustomerId || matchedCustomer?.id || null;
      payload.revenue_month = toMonthStartDateString(
        matchedCustomer?.membership_start_date || new Date(),
      );
      const { error } = await supabase.from("payments").insert(payload);
      if (error) throw error;
      setStatusMessage({
        type: "success",
        message: "Transaction added successfully.",
      });
      setFormData({
        payment_mode: "cash",
        status: "completed",
        amount: "",
        sender_name: "",
        sender_account_name: "",
        source_transaction_id: "",
      });
      setSelectedCustomerId(null);
      setSenderMatches([]);
      setShowSenderMatches(false);
      fetchTransactions();
    } catch (error) {
      console.error("Error adding transaction:", error);
      setStatusMessage({
        type: "error",
        message: error.message || "Failed to add transaction.",
      });
    } finally {
      setSaving(false);
    }
  };
  const computeTransactionDisplayData = (tx, customerDirectory) => {
    const rawStatus = String(tx.status || "completed").toLowerCase();
    const linkedCustomer = tx.subscriptions?.customers || null;
    const fallbackCustomer = customerDirectory.find(
      (customer) =>
        normalizeName(`${customer.first_name || ""} ${customer.last_name || ""}`) ===
        normalizeName(tx.sender_name),
    );
    const resolvedCustomer = linkedCustomer || fallbackCustomer || null;
    const adjustedStatus =
      rawStatus === "inactive" && resolvedCustomer && isCustomerActiveNow(resolvedCustomer)
        ? "completed"
        : rawStatus;
    const statusClass =
      adjustedStatus === "completed"
        ? "text-emerald-600 bg-emerald-50 border-emerald-200"
        : adjustedStatus === "inactive"
          ? "text-red-600 bg-red-50 border-red-200"
          : "text-amber-600 bg-amber-50 border-amber-200";
    const statusLabel = adjustedStatus.charAt(0).toUpperCase() + adjustedStatus.slice(1);
    const matchLabel = resolvedCustomer
      ? `Matched: ${resolvedCustomer.first_name || ""} ${resolvedCustomer.last_name || ""}`.trim()
      : tx.matched_customer_id
        ? "Matched customer record"
        : "No matching customer";

    return {
      rawStatus,
      resolvedCustomer,
      adjustedStatus,
      statusClass,
      statusLabel,
      matchLabel,
    };
  };

  return (
    <div
      className="app-page transactions-page-vibe transactions-typography p-8 md:p-12 lg:p-24 overflow-x-hidden md:overflow-x-visible"
      style={{
        "--app-theme-page-bg": "#ffffff",
        "--app-theme-card-bg": "#fbfbfb",
        "--app-theme-card-bg-alt": "#f4f4f4",
        color: "#0d0d0d",
      }}
    >
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=DM+Sans:wght@400;500;600&display=swap");
        .transactions-page-vibe {
          background: #ffffff !important;
          color: #0d0d0d !important;
          font-family: "DM Sans", system-ui, sans-serif;
          min-height: 100vh;
        }
        .transactions-page-vibe .transactions-header-title {
          font-family: "Playfair Display", Georgia, serif;
        }
        .transactions-page-vibe .transactions-card {
          background: #fbfbfb !important;
          border-color: #e6e6e6 !important;
        }
        .transactions-page-vibe .transactions-card-alt {
          background: #ffffff !important;
          border-color: #e6e6e6 !important;
        }
        .transactions-page-vibe .transactions-subtle {
          color: #8a8a8a !important;
        }
        .transactions-page-vibe .transactions-muted {
          color: #666666 !important;
        }
        .transactions-page-vibe .transactions-value {
          font-family: "Helvetica Neue", Helvetica, Arial, sans-serif !important;
          font-weight: 500 !important;
          letter-spacing: 0.02em !important;
        }
        .transactions-page-vibe [class*="bg-white/"] {
          background: #fbfbfb !important;
        }
        .transactions-page-vibe [class*="text-white/"] {
          color: #8a8a8a !important;
        }
        .transactions-page-vibe [class*="bg-\\[#0B0E14\\]"] {
          background: #ffffff !important;
        }
        .transactions-page-vibe .text-white {
          color: #0d0d0d !important;
        }
        .transactions-page-vibe [class*="border-white/"] {
          border-color: #e6e6e6 !important;
        }
        .transactions-page-vibe input,
        .transactions-page-vibe select {
          background: #ffffff !important;
          color: #0d0d0d !important;
          border-color: #e0e0e0 !important;
        }
        .transactions-page-vibe input::placeholder {
          color: #a0a0a0 !important;
        }
        .transactions-page-vibe option {
          background: #ffffff;
          color: #0d0d0d;
        }
      `}</style>

      <div className="w-full max-w-[1200px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <header className="mb-8 md:mb-12">
          <p className="text-[10px] tracking-[0.08em] text-[#8a8a8a] font-light mb-2">
            Payment Ledger
          </p>
          <h1 className="transactions-header-title text-4xl md:text-5xl font-medium tracking-tighter text-[#0d0d0d]">
            Transaction <span className="transactions-subtle">History</span>
          </h1>
        </header>

        <div className="transactions-card mb-10 border border-white/10 p-6 md:p-8 space-y-6 rounded-2xl">
          <div className="flex items-center justify-between gap-4">
            <h3 className="transactions-form-heading text-lg md:text-xl text-[#0d0d0d] tracking-tight">
              Transactions
            </h3>
            <span className="text-[9px] tracking-[0.08em] font-light transactions-subtle">
              Cash / UPI
            </span>
          </div>

          <div className="border-t border-[#e6e6e6] pt-6">
            <p className="text-[10px] tracking-[0.08em] font-light transactions-subtle mb-4">
              Data Import Moved To Auto Migration
            </p>
            <p className="text-xs transactions-muted mb-4">
              To import old payment files, use Auto Migration for the full guided flow.
            </p>
            <button
              type="button"
              onClick={() => navigate("/auto-migration")}
              className="mt-1 bg-white text-[#0d0d0d] border border-[#e0e0e0] px-5 py-2 text-[10px] tracking-[0.08em] font-medium mb-6 rounded-xl hover:bg-[#f4f4f4] hover:border-[#d0d0d0] transition-colors"
            >
              Open Auto Migration
            </button>
          </div>

          <div className="border-t border-[#e6e6e6] pt-6">
            <p className="text-[10px] tracking-[0.08em] font-light transactions-subtle mb-4">
              Add Manual Transaction
            </p>
            <p className="text-xs transactions-muted mb-4">
              Manual steps: choose mode and status, add amount, add sender name, then save.
            </p>
            {statusMessage && (
              <div
                className={`p-3 border text-xs tracking-wide ${statusMessage.type === "success" ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-red-200 text-red-700 bg-red-50"} transition-all duration-500 ease-out ${isStatusVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"}`}
              >
                {statusMessage.message}
              </div>
            )}
          </div>

          <form
            onSubmit={handleManualTransaction}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5"
          >
            <div className="space-y-2">
              <label className="text-[10px] tracking-[0.08em] font-light transactions-subtle">
                Payment Mode
              </label>
              <select
                value={formData.payment_mode}
                onChange={(e) =>
                  setFormData({ ...formData, payment_mode: e.target.value })
                }
                className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-sm text-[#0d0d0d] focus:outline-none focus:border-black/30 rounded-xl"
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] tracking-[0.08em] font-light transactions-subtle">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
                className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-sm text-[#0d0d0d] focus:outline-none focus:border-black/30 rounded-xl"
              >
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] tracking-[0.08em] font-light transactions-subtle">
                Amount
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: e.target.value })
                }
                placeholder="e.g. 1499"
                className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-sm text-[#0d0d0d] placeholder:text-[#a0a0a0] focus:outline-none focus:border-black/30 rounded-xl"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] tracking-[0.08em] font-light transactions-subtle">
                Sender Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.sender_name}
                  onChange={(e) => handleSenderNameChange(e.target.value)}
                  onFocus={() => {
                    if (formData.sender_name.trim()) setShowSenderMatches(true);
                  }}
                  onBlur={() => {
                    if (blurTimeoutRef.current) {
                      clearTimeout(blurTimeoutRef.current);
                    }
                    blurTimeoutRef.current = setTimeout(() => {
                      setShowSenderMatches(false);
                    }, 120);
                  }}
                  placeholder="Name of sender"
                  className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-sm text-[#0d0d0d] placeholder:text-[#a0a0a0] focus:outline-none focus:border-black/30 rounded-xl"
                  required
                />
                {showSenderMatches &&
                  formData.sender_name.trim() &&
                  senderMatches.length > 0 && (
                    <div className="absolute z-20 mt-2 w-full bg-white border border-[#e0e0e0] max-h-44 overflow-y-auto rounded-xl shadow-lg">
                      {senderMatches.map((customer) => {
                        const fullName =
                          `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
                        return (
                          <button
                            key={customer.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              if (blurTimeoutRef.current) {
                                clearTimeout(blurTimeoutRef.current);
                              }
                              handleSelectSender(customer);
                            }}
                            className="native-inline-btn dropdown-item-btn w-full text-left px-4 py-2 text-sm text-[#0d0d0d] hover:bg-[#f4f4f4] transition-colors"
                          >
                            {fullName}
                          </button>
                        );
                      })}
                    </div>
                  )}
              </div>
              {formData.sender_name.trim() && senderMatches.length === 0 && (
                <p className="text-[10px] text-amber-600 tracking-[0.08em] font-light">
                  match not found
                </p>
              )}
              {selectedCustomerId && (
                <p className="text-[10px] text-emerald-600 tracking-[0.08em] font-light">
                  customer matched
                </p>
              )}
            </div>

            {formData.payment_mode === "upi" && (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] tracking-[0.08em] font-light transactions-subtle">
                    Account Name
                  </label>
                  <input
                    type="text"
                    value={formData.sender_account_name}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sender_account_name: e.target.value,
                      })
                    }
                    placeholder="UPI account name"
                    className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-sm text-[#0d0d0d] placeholder:text-[#a0a0a0] focus:outline-none focus:border-black/30 rounded-xl"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] tracking-[0.08em] font-light transactions-subtle">
                    Transaction ID
                  </label>
                  <input
                    type="text"
                    value={formData.source_transaction_id}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        source_transaction_id: e.target.value,
                      })
                    }
                    placeholder="UPI transaction reference"
                    className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-sm text-[#0d0d0d] placeholder:text-[#a0a0a0] focus:outline-none focus:border-black/30 rounded-xl"
                    required
                  />
                </div>
              </>
            )}

            <div className="md:col-span-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full md:w-auto bg-white text-[#0d0d0d] border border-[#e0e0e0] font-medium px-8 py-3 text-[10px] tracking-[0.08em] font-light rounded-xl hover:bg-[#f4f4f4] hover:border-[#d0d0d0] transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Add Transaction"}
              </button>
            </div>
          </form>
        </div>

        <div className="transactions-card-alt border border-white/10 overflow-hidden rounded-2xl">
          <div className="md:hidden divide-y divide-[#e6e6e6]">
            {transactions.map((tx) => {
              const { statusClass, statusLabel, matchLabel } =
                computeTransactionDisplayData(tx, customerDirectory);

              return (
                <div key={`mobile-${tx.id}`} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[10px] tracking-[0.08em] font-light transactions-subtle">
                        Transaction ID
                      </p>
                      <p className="mt-1 text-sm font-medium text-[#0d0d0d] break-all">
                        <span className="transactions-value">
                        #Tx-{tx.id.substring(0, 8)}
                        </span>
                      </p>
                    </div>
                    <span className={`shrink-0 text-[9px] tracking-[0.08em] font-medium px-3 py-1 border rounded-full ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </div>

                  <div className="space-y-2 text-[11px]">
                    <div className="flex items-start justify-between gap-4">
                      <span className="transactions-subtle shrink-0">Sender</span>
                      <span className="text-[#0d0d0d] text-right break-words max-w-[65%]">
                        <span className="transactions-value">
                        {tx.sender_name ||
                          (tx.subscriptions?.customers
                            ? `${tx.subscriptions.customers.first_name} ${tx.subscriptions.customers.last_name}`
                            : "N/A")}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="transactions-subtle shrink-0">Match</span>
                      <span className="text-[#0d0d0d] text-right break-words max-w-[65%] transactions-value">
                        {matchLabel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="transactions-subtle shrink-0">Mode</span>
                      <span className="text-[#0d0d0d] text-right transactions-value">
                        {tx.payment_mode || "N/A"}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="transactions-subtle shrink-0">Account / Ref</span>
                      <div className="max-w-[65%] text-right text-[#0d0d0d] break-words">
                        <div className="transactions-value">{tx.sender_account_name || "-"}</div>
                        <div className="mt-1 transactions-value">{tx.source_transaction_id || "-"}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="transactions-subtle shrink-0">Amount</span>
                      <span className="text-[#0d0d0d] font-medium transactions-value">
                        ₹{tx.amount || "0"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="transactions-subtle shrink-0">Date</span>
                      <span className="text-[#0d0d0d] text-right transactions-value">
                        {tx.created_at && !Number.isNaN(new Date(tx.created_at).getTime())
                          ? new Date(tx.created_at).toLocaleDateString("en-GB")
                          : "-"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {!loading && transactions.length === 0 && (
              <div className="p-8 text-center text-[#8a8a8a] flex flex-col items-center gap-4">
                <span className="text-[10px] tracking-[0.08em] font-light">
                  No Recent Transactions Found
                </span>
                <span className="text-[9px] tracking-[0.08em] font-light">
                  Transactions will appear here once applications are processed and paid.
                </span>
              </div>
            )}

            {loading && (
              <div className="p-8 text-center">
                <span className="text-[10px] tracking-[0.08em] text-[#8a8a8a] animate-pulse font-light">
                  Downloading Ledger...
                </span>
              </div>
            )}
          </div>

          <div className="hidden md:block overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse table-auto">
            <thead className="bg-[#f7f7f7]">
              <tr className="border-b border-[#e6e6e6]">
                <th className="p-2 md:p-3 lg:p-4 text-[10px] tracking-[0.08em] font-light transactions-subtle">
                  Transaction ID
                </th>
                <th className="p-2 md:p-3 lg:p-4 text-[10px] tracking-[0.08em] font-light transactions-subtle">
                  Sender / Customer
                </th>
                <th className="p-2 md:p-3 lg:p-4 text-[10px] tracking-[0.08em] font-light transactions-subtle">
                  Mode
                </th>
                <th className="p-2 md:p-3 lg:p-4 text-[10px] tracking-[0.08em] font-light transactions-subtle">
                  Account / Ref
                </th>
                <th className="p-2 md:p-3 lg:p-4 text-[10px] tracking-[0.08em] font-light transactions-subtle">
                  Amount
                </th>
                <th className="p-2 md:p-3 lg:p-4 text-[10px] tracking-[0.08em] font-light transactions-subtle">
                  Date
                </th>
                <th className="p-2 md:p-3 lg:p-4 text-[10px] tracking-[0.08em] font-light transactions-subtle text-right">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const { statusClass, statusLabel, matchLabel } =
                  computeTransactionDisplayData(tx, customerDirectory);
                return (
                  <tr key={tx.id} className="border-b border-[#e6e6e6] hover:bg-[#f9f9f9] transition-colors group">
                      <td className="p-2 md:p-3 lg:p-4 align-top w-[80px]">
                        <span className="text-[10px] text-[#8a8a8a] font-light tracking-[0.08em] transactions-value whitespace-nowrap">
                          {tx.id.substring(0, 8)}
                        </span>
                      </td>
                      <td className="p-2 md:p-3 lg:p-4 align-top max-w-[180px]">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-medium tracking-tight text-[#0d0d0d] transactions-value">
                            {tx.sender_name ||
                              (tx.subscriptions?.customers
                                ? `${tx.subscriptions.customers.first_name} ${tx.subscriptions.customers.last_name}`
                                : "N/A")}
                          </span>
                          <span className="text-[9px] text-[#8a8a8a] font-light tracking-[0.08em]">
                            {matchLabel}
                          </span>
                          <span className="text-[9px] text-[#8a8a8a] font-light tracking-[0.08em]">
                            Plan: {tx.subscriptions?.plan_name || "Individual"}
                          </span>
                        </div>
                      </td>
                      <td className="p-2 md:p-3 lg:p-4 text-[10px] text-[#8a8a8a] font-light tracking-[0.08em] align-top transactions-value">
                        {tx.payment_mode || "N/A"}
                      </td>
                      <td className="p-2 md:p-3 lg:p-4 align-top max-w-[140px]">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-[#8a8a8a] font-light tracking-[0.08em] transactions-value break-words">
                            {tx.sender_account_name || "-"}
                          </span>
                          <span className="text-[9px] text-[#8a8a8a] font-light tracking-[0.08em] transactions-value break-words">
                            {tx.source_transaction_id || "-"}
                          </span>
                        </div>
                      </td>
                      <td className="p-2 md:p-3 lg:p-4 align-top">
                        <span className="text-sm font-medium text-[#0d0d0d] tracking-widest transactions-value whitespace-nowrap">
                          ₹{tx.amount || "0"}
                        </span>
                      </td>
                      <td className="p-2 md:p-3 lg:p-4 text-sm text-[#8a8a8a] font-light tracking-[0.08em] align-top transactions-value whitespace-nowrap">
                        {tx.created_at && !Number.isNaN(new Date(tx.created_at).getTime())
                          ? new Date(tx.created_at).toLocaleDateString("en-GB")
                          : "-"}
                      </td>
                      <td className="p-2 md:p-3 lg:p-4 text-right">
                        <span className={`text-[9px] tracking-[0.08em] font-medium px-3 py-1 border rounded-full ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
              })}
            </tbody>
            </table>
          </div>

          {loading && (
            <div className="p-24 text-center">
              <span className="text-[10px] tracking-[0.08em] text-[#8a8a8a] animate-pulse font-light">
                Downloading Ledger...
              </span>
            </div>
          )}

          {!loading && transactions.length === 0 && (
            <div className="p-24 text-center text-[#8a8a8a] flex flex-col items-center gap-4">
              <span className="text-[10px] tracking-[0.08em] font-light">
                No Recent Transactions Found
              </span>
              <span className="text-[9px] tracking-[0.08em] font-light">
                Transactions will appear here once applications are processed and paid.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default TransactionsPage;
