import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import Papa from "papaparse";
import { useNavigate } from "react-router-dom";
import {
  logImportJob,
  normalizeRowKeys,
  mapPaymentRowFromPreset,
  getImportSourcePreset,
} from "../lib/importJobs";
const TransactionsPage = () => {
  const navigate = useNavigate();
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
      } = await supabase.auth.getUser();
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
            created_at,
            subscriptions (
              plan_name,
              customers (
                first_name,
                last_name
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
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      const { data, error } = await supabase
        .from("customers")
        .select("id, first_name, last_name")
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
    for (const row of rows) {
      const insertPayload = {
        gym_id: userId,
        subscription_id: null,
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
      }
    }
    return { insertedCount, failedRows, applyErrors };
  };
  const applyPaymentImport = async () => {
    setPaymentImportLoading(true);
    setPaymentImportStatus(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      const validRows = paymentImportRows.filter(
        (r) => r.validationStatus === "valid",
      );
      const { insertedCount, failedRows, applyErrors } =
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
        message: `Imported ${insertedCount} payment rows. ${failedRows.length} rows failed and can be retried. ₹${completedTotal.toLocaleString()} revenue added.`,
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
      } = await supabase.auth.getUser();
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
        } = await supabase.auth.getUser();

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
      } = await supabase.auth.getUser();
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
  return (
    <div className="app-page transactions-typography p-8 md:p-12 lg:p-24 overflow-x-auto">
      {" "}
      <div className="w-full max-w-[1200px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-1000">
        {" "}
        <header className="mb-8 md:mb-12">
          {" "}
          <p className="text-[10px] tracking-[0.3em] text-white/40 font-mono mb-2">
            Payment Ledger
          </p>{" "}
          <h1 className="text-4xl md:text-5xl font-medium tracking-tighter">
            Transaction <span className="text-white/20">History</span>
          </h1>{" "}
        </header>{" "}
        <div className="mb-10 border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-6">
          {" "}
          <div className="flex items-center justify-between gap-4">
            {" "}
            <h3 className="transactions-form-heading text-lg md:text-xl text-white tracking-tight ">
              Transactions
            </h3>{" "}
            <span className="text-[9px] tracking-[0.2em] font-mono text-white/40">
              Cash / UPI
            </span>{" "}
          </div>{" "}
          <div className="border-t border-white/5 pt-6">
            {" "}
            <p className="text-[10px] tracking-[0.2em] font-mono text-white/40">
              Data Import Moved To Auto Migration
            </p>{" "}
            <p className="text-xs text-white/50 mt-1">
              To import old payment files, use Auto Migration for the full
              guided flow.
            </p>{" "}
            <button
              type="button"
              onClick={() => navigate("/auto-migration")}
              className="mt-3 bg-white text-black px-5 py-2 text-[10px] tracking-[0.2em] font-medium mb-6"
            >
              {" "}
              Open Auto Migration{" "}
            </button>{" "}
          </div>{" "}
          {/* Manual Entry Section */}{" "}
          <div className="border-t border-white/5 pt-6">
            {" "}
            <p className="text-[10px] tracking-[0.2em] font-mono text-white/40 mb-4">
              Add Manual Transaction
            </p>{" "}
            <p className="text-xs text-white/50 mb-4">
              Manual steps: choose mode and status, add amount, add sender name,
              then save.
            </p>{" "}
            {statusMessage && (
              <div
                className={`p-3 border text-xs tracking-wide ${statusMessage.type === "success" ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-red-500/30 text-red-400 bg-red-500/10"} transition-all duration-500 ease-out ${isStatusVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"}`}
              >
                {" "}
                {statusMessage.message}{" "}
              </div>
            )}{" "}
          </div>{" "}
          <form
            onSubmit={handleManualTransaction}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5"
          >
            {" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.2em] font-mono text-white/40">
                Payment Mode
              </label>{" "}
              <select
                value={formData.payment_mode}
                onChange={(e) =>
                  setFormData({ ...formData, payment_mode: e.target.value })
                }
                className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm text-white focus:outline-none focus:border-white/30"
              >
                {" "}
                <option value="cash" className="bg-[#0B0E14]">
                  Cash
                </option>{" "}
                <option value="upi" className="bg-[#0B0E14]">
                  UPI
                </option>{" "}
              </select>{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.2em] font-mono text-white/40">
                Status
              </label>{" "}
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
                className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm text-white focus:outline-none focus:border-white/30"
              >
                {" "}
                <option value="completed" className="bg-[#0B0E14]">
                  Completed
                </option>{" "}
                <option value="pending" className="bg-[#0B0E14]">
                  Pending
                </option>{" "}
                <option value="failed" className="bg-[#0B0E14]">
                  Failed
                </option>{" "}
              </select>{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.2em] font-mono text-white/40">
                Amount
              </label>{" "}
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: e.target.value })
                }
                placeholder="e.g. 1499"
                className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
                required
              />{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="text-[10px] tracking-[0.2em] font-mono text-white/40">
                Sender Name
              </label>{" "}
              <div className="relative">
                {" "}
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
                  className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
                  required
                />{" "}
                {showSenderMatches &&
                  formData.sender_name.trim() &&
                  senderMatches.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-[#0B0E14] border border-white/10 max-h-44 overflow-y-auto">
                      {" "}
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
                            className="native-inline-btn dropdown-item-btn w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
                          >
                            {" "}
                            {fullName}{" "}
                          </button>
                        );
                      })}{" "}
                    </div>
                  )}{" "}
              </div>{" "}
              {formData.sender_name.trim() && senderMatches.length === 0 && (
                <p className="text-[10px] text-amber-400 tracking-[0.15em] font-mono">
                  match not found
                </p>
              )}{" "}
              {selectedCustomerId && (
                <p className="text-[10px] text-emerald-400 tracking-[0.15em] font-mono">
                  customer matched
                </p>
              )}{" "}
            </div>{" "}
            {formData.payment_mode === "upi" && (
              <>
                {" "}
                <div className="space-y-2">
                  {" "}
                  <label className="text-[10px] tracking-[0.2em] font-mono text-white/40">
                    Account Name
                  </label>{" "}
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
                    className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
                    required
                  />{" "}
                </div>{" "}
                <div className="space-y-2">
                  {" "}
                  <label className="text-[10px] tracking-[0.2em] font-mono text-white/40">
                    Transaction ID
                  </label>{" "}
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
                    className="w-full bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
                    required
                  />{" "}
                </div>{" "}
              </>
            )}{" "}
            <div className="md:col-span-2 pt-2">
              {" "}
              <button
                type="submit"
                disabled={saving}
                className="w-full md:w-auto bg-white text-black font-medium px-8 py-3 text-[10px] tracking-[0.2em] hover:bg-white/90 transition-colors disabled:opacity-50"
              >
                {" "}
                {saving ? "Saving..." : "Add Transaction"}{" "}
              </button>{" "}
            </div>{" "}
          </form>{" "}
        </div>{" "}
        <div className="border border-white/10 overflow-hidden">
          {" "}
          <table className="w-full text-left border-collapse">
            {" "}
            <thead>
              {" "}
              <tr className="bg-white/5 border-b border-white/10">
                {" "}
                <th className="p-6 text-[10px] tracking-[0.2em] font-mono text-white/40">
                  Transaction ID
                </th>{" "}
                <th className="p-6 text-[10px] tracking-[0.2em] font-mono text-white/40">
                  Sender / Customer
                </th>{" "}
                <th className="p-6 text-[10px] tracking-[0.2em] font-mono text-white/40">
                  Mode
                </th>{" "}
                <th className="p-6 text-[10px] tracking-[0.2em] font-mono text-white/40">
                  Account / Ref
                </th>{" "}
                <th className="p-6 text-[10px] tracking-[0.2em] font-mono text-white/40">
                  Amount
                </th>{" "}
                <th className="p-6 text-[10px] tracking-[0.2em] font-mono text-white/40">
                  Date
                </th>{" "}
                <th className="p-6 text-[10px] tracking-[0.2em] font-mono text-white/40 text-right">
                  Status
                </th>{" "}
              </tr>{" "}
            </thead>{" "}
            <tbody>
              {" "}
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group"
                >
                  {" "}
                  <td className="p-6">
                    {" "}
                    <span className="text-[10px] text-white/40 font-mono tracking-widest ">
                      {" "}
                      #Tx-{tx.id.substring(0, 8)}{" "}
                    </span>{" "}
                  </td>{" "}
                  <td className="p-6">
                    {" "}
                    <div className="flex flex-col">
                      {" "}
                      <span className="text-sm font-medium tracking-tight text-white/40">
                        {" "}
                        {tx.sender_name ||
                          (tx.subscriptions?.customers
                            ? `${tx.subscriptions.customers.first_name} ${tx.subscriptions.customers.last_name}`
                            : "N/A")}{" "}
                      </span>{" "}
                      <span className="text-[9px] text-white/20 font-mono tracking-widest mt-1">
                        {" "}
                        Plan: {tx.subscriptions?.plan_name || "Individual"}{" "}
                      </span>{" "}
                    </div>{" "}
                  </td>{" "}
                  <td className="p-6 text-[10px] text-white/40 font-mono tracking-wider">
                    {" "}
                    {tx.payment_mode || "N/A"}{" "}
                  </td>{" "}
                  <td className="p-6">
                    {" "}
                    <div className="flex flex-col">
                      {" "}
                      <span className="text-[10px] text-white/40 font-mono tracking-wide ">
                        {" "}
                        {tx.sender_account_name || "-"}{" "}
                      </span>{" "}
                      <span className="text-[9px] text-white/20 font-mono tracking-widest mt-1">
                        {" "}
                        {tx.source_transaction_id || "-"}{" "}
                      </span>{" "}
                    </div>{" "}
                  </td>{" "}
                  <td className="p-6">
                    {" "}
                    <span className="text-sm font-medium text-white/40 tracking-widest">
                      {" "}
                      ₹{tx.amount || "0"}{" "}
                    </span>{" "}
                  </td>{" "}
                  <td className="p-6 text-sm text-white/40 font-mono">
                    {" "}
                    {new Date(tx.created_at).toLocaleDateString()}{" "}
                  </td>{" "}
                  <td className="p-6 text-right">
                    {" "}
                    <span
                      className={`text-[9px] tracking-[0.2em] font-medium px-3 py-1 border ${tx.status === "completed" ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" : "text-amber-500 bg-amber-500/10 border-amber-500/20"}`}
                    >
                      {" "}
                      {String(tx.status || "completed")
                        .charAt(0)
                        .toUpperCase()}
                      {String(tx.status || "completed").slice(1)}{" "}
                    </span>{" "}
                  </td>{" "}
                </tr>
              ))}{" "}
            </tbody>{" "}
          </table>{" "}
          {loading && (
            <div className="p-24 text-center">
              {" "}
              <span className="text-[10px] tracking-[0.5em] text-white/20 animate-pulse font-mono font-medium">
                Downloading Ledger...
              </span>{" "}
            </div>
          )}{" "}
          {!loading && transactions.length === 0 && (
            <div className="p-24 text-center text-white/40 flex flex-col items-center gap-4">
              {" "}
              <span className="text-[10px] tracking-[0.3em] font-mono font-medium">
                No Recent Transactions Found
              </span>{" "}
              <span className="text-[9px] tracking-widest">
                Transactions will appear here once applications are processed
                and paid.
              </span>{" "}
            </div>
          )}{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
};
export default TransactionsPage;
