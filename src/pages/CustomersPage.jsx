import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import CustomerModal from "../components/CustomerModal";
import ClientDocsModal from "../components/ClientDocsModal";
import CustomerDetailsModal from "../components/CustomerDetailsModal";
import SecureImage from "../components/SecureImage";
import {
  logImportJob,
  normalizeRowKeys,
  mapCustomerRowFromPreset,
  getImportSourcePreset,
} from "../lib/importJobs";
const CustomersPage = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [isRenewalMode, setIsRenewalMode] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [filterType, setFilterType] = useState("active");
  // 'active' or 'all'
  const [searchQuery, setSearchQuery] = useState("");
  const [customerImportFileName, setCustomerImportFileName] = useState("");
  const [customerImportRows, setCustomerImportRows] = useState([]);
  const [customerImportErrors, setCustomerImportErrors] = useState([]);
  const [customerDuplicateRows, setCustomerDuplicateRows] = useState([]);
  const [customerDuplicateResolutions, setCustomerDuplicateResolutions] =
    useState({});
  const [customerFailedRows, setCustomerFailedRows] = useState([]);
  const [customerImportLoading, setCustomerImportLoading] = useState(false);
  const [customerImportStatus, setCustomerImportStatus] = useState(null);
  const menuRef = useRef(null);
  const currentSourcePreset = getImportSourcePreset();
  const sourcePresetLabel =
    currentSourcePreset === "legacy_a"
      ? "Old App Format 1"
      : currentSourcePreset === "legacy_b"
        ? "Old App Format 2"
        : "Standard File Format";
  const normalizePhone = (value) => String(value || "").replace(/\D/g, "");
  const normalizeEmail = (value) =>
    String(value || "")
      .trim()
      .toLowerCase();
  // Initial mock data as requested
  const mockCustomers = [
    {
      id: "mock-1",
      first_name: "Shayaan",
      last_name: "Shaikh",
      email: "shayaan@example.com",
      phone: "1234567890",
      created_at: new Date().toISOString(),
    },
    {
      id: "mock-2",
      first_name: "Ayaan",
      last_name: "Shaikh",
      email: "ayaan@example.com",
      phone: "0987654321",
      created_at: new Date().toISOString(),
    },
  ];
  useEffect(() => {
    fetchCustomers();
    // Click outside to close menu
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  const fetchCustomers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error fetching customers:", error);
    } else {
      setCustomers(data || []);
    }
    setLoading(false);
  };
  const handleTerminate = async (customerId) => {
    if (!window.confirm("Are you sure you want to terminate this membership?"))
      return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const y = yesterday.getFullYear();
    const m = String(yesterday.getMonth() + 1).padStart(2, "0");
    const d = String(yesterday.getDate()).padStart(2, "0");
    const expiredDate = `${y}-${m}-${d}`;
    try {
      // 1. Update customers table
      const { error: updateError } = await supabase
        .from("customers")
        .update({ membership_end_date: expiredDate })
        .eq("id", customerId);
      if (updateError) throw updateError;
      // 2. Refresh list
      await fetchCustomers();
    } catch (err) {
      console.error("Error terminating membership:", err);
      alert("Failed to terminate membership");
    }
  };
  const handleDeleteCustomer = async (customer) => {
    const fullName =
      `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
    const shouldDelete = window.confirm(
      `Delete user ${fullName || "this customer"}? This cannot be undone.`,
    );
    if (!shouldDelete) return;
    try {
      const { error } = await supabase
        .from("customers")
        .delete()
        .eq("id", customer.id);
      if (error) throw error;
      setActiveMenuId(null);
      await fetchCustomers();
    } catch (err) {
      console.error("Error deleting customer:", err);
      alert("Failed to delete user");
    }
  };
  const handleOpenNewModal = () => {
    setEditingCustomer(null);
    setIsRenewalMode(false);
    setIsModalOpen(true);
  };
  const handleOpenEditModal = (customer, forRenewal = false) => {
    setEditingCustomer(customer);
    setIsRenewalMode(forRenewal);
    setIsModalOpen(true);
    setActiveMenuId(null);
  };
  const handleOpenDocsModal = (customer) => {
    setEditingCustomer(customer);
    setIsDocsModalOpen(true);
    setActiveMenuId(null);
  };
  const handleOpenDetailsModal = (customer) => {
    setEditingCustomer(customer);
    setIsDetailsModalOpen(true);
    setActiveMenuId(null);
  };
  const handleCustomerSaved = (savedCustomer) => {
    if (editingCustomer) {
      setCustomers(
        customers.map((c) => (c.id === savedCustomer.id ? savedCustomer : c)),
      );
    } else {
      setCustomers([savedCustomer, ...customers]);
    }
  };
  const toggleMenu = (e, id) => {
    e.stopPropagation();
    setActiveMenuId(activeMenuId === id ? null : id);
  };
  const parseCustomerCsv = async (file) => {
    if (!file) return;
    setCustomerImportStatus(null);
    setCustomerImportFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data || [];
        const sourcePreset = getImportSourcePreset();
        const normalizedRows = [];
        const validationErrors = [];
        const duplicateRows = [];
        const initialResolutions = {};
        const existingByPhone = new Map();
        const existingByEmail = new Map();
        (customers || []).forEach((customer) => {
          const phone = normalizePhone(customer.phone);
          const email = normalizeEmail(customer.email);
          if (phone) {
            const existing = existingByPhone.get(phone) || [];
            existingByPhone.set(phone, [...existing, customer]);
          }
          if (email) {
            const existing = existingByEmail.get(email) || [];
            existingByEmail.set(email, [...existing, customer]);
          }
        });
        rows.forEach((row, index) => {
          const normalizedSource = normalizeRowKeys(row);
          const presetPayload = mapCustomerRowFromPreset(
            normalizedSource,
            sourcePreset,
          );
          const normalizedPhone = normalizePhone(presetPayload.phone);
          const normalizedEmailValue = normalizeEmail(presetPayload.email);
          const normalizedPayload = {
            ...presetPayload,
            phone: normalizedPhone,
            email: normalizedEmailValue,
          };
          const rowErrors = [];
          if (!normalizedPayload.first_name && !normalizedPayload.last_name) {
            rowErrors.push("First or last name required");
          }
          if (!normalizedPayload.phone && !normalizedPayload.email) {
            rowErrors.push("Phone or email required");
          }
          const validationStatus = rowErrors.length ? "invalid" : "valid";
          const phoneMatches = normalizedPhone
            ? existingByPhone.get(normalizedPhone)
            : null;
          const emailMatches = normalizedEmailValue
            ? existingByEmail.get(normalizedEmailValue)
            : null;
          let duplicateMatch = null;
          if (phoneMatches && emailMatches) {
            // Check if both arrays have unambiguous single matches
            if (
              phoneMatches.length === 1 &&
              emailMatches.length === 1 &&
              phoneMatches[0].id !== emailMatches[0].id
            ) {
              duplicateMatch = {
                type: "ambiguous",
                reason: "Phone and email match different customers",
                matches: [phoneMatches[0], emailMatches[0]],
              };
              initialResolutions[index + 1] = {
                action: "review",
                selectedCustomerId: "",
              };
            } else if (
              phoneMatches.length === 1 &&
              (!emailMatches || emailMatches.length !== 1)
            ) {
              // Phone match is unambiguous
              duplicateMatch = {
                type: "phone",
                reason: "Exact phone match",
                matches: [phoneMatches[0]],
              };
              initialResolutions[index + 1] = {
                action: "merge_existing",
                selectedCustomerId: phoneMatches[0].id,
              };
            } else if (
              emailMatches.length === 1 &&
              (!phoneMatches || phoneMatches.length !== 1)
            ) {
              // Email match is unambiguous
              duplicateMatch = {
                type: "email",
                reason: "Exact email match",
                matches: [emailMatches[0]],
              };
              initialResolutions[index + 1] = {
                action: "merge_existing",
                selectedCustomerId: emailMatches[0].id,
              };
            } else {
              // Ambiguous: multiple matches on one or both fields
              duplicateMatch = {
                type: "ambiguous",
                reason: "Multiple phone or email matches",
                matches: [...(phoneMatches || []), ...(emailMatches || [])],
              };
              initialResolutions[index + 1] = {
                action: "review",
                selectedCustomerId: "",
              };
            }
          } else if (phoneMatches) {
            if (phoneMatches.length === 1) {
              duplicateMatch = {
                type: "phone",
                reason: "Exact phone match",
                matches: [phoneMatches[0]],
              };
              initialResolutions[index + 1] = {
                action: "merge_existing",
                selectedCustomerId: phoneMatches[0].id,
              };
            } else {
              duplicateMatch = {
                type: "ambiguous",
                reason: "Multiple phone matches",
                matches: phoneMatches,
              };
              initialResolutions[index + 1] = {
                action: "review",
                selectedCustomerId: "",
              };
            }
          } else if (emailMatches) {
            if (emailMatches.length === 1) {
              duplicateMatch = {
                type: "email",
                reason: "Exact email match",
                matches: [emailMatches[0]],
              };
              initialResolutions[index + 1] = {
                action: "merge_existing",
                selectedCustomerId: emailMatches[0].id,
              };
            } else {
              duplicateMatch = {
                type: "ambiguous",
                reason: "Multiple email matches",
                matches: emailMatches,
              };
              initialResolutions[index + 1] = {
                action: "review",
                selectedCustomerId: "",
              };
            }
          }
          const normalizedRow = {
            rowIndex: index + 1,
            normalizedPayload,
            validationStatus,
            duplicateMatch,
          };
          normalizedRows.push(normalizedRow);
          if (duplicateMatch) {
            duplicateRows.push(normalizedRow);
          }
          rowErrors.forEach((message) => {
            validationErrors.push({
              rowIndex: index + 1,
              fieldName: null,
              errorCode: "CUSTOMER_VALIDATION",
              errorMessage: message,
            });
          });
        });
        setCustomerImportRows(normalizedRows);
        setCustomerImportErrors(validationErrors);
        setCustomerDuplicateRows(duplicateRows);
        setCustomerDuplicateResolutions(initialResolutions);
        setCustomerFailedRows([]);
      },
      error: () => {
        setCustomerImportStatus({
          type: "error",
          message: "Failed to parse CSV file.",
        });
      },
    });
  };
  const updateCustomerDuplicateResolution = (rowIndex, patch) => {
    setCustomerDuplicateResolutions((prev) => ({
      ...prev,
      [rowIndex]: {
        ...(prev[rowIndex] || { action: "review", selectedCustomerId: "" }),
        ...patch,
      },
    }));
  };
  const runCustomerImportRows = async ({ rows, userId }) => {
    let insertedCount = 0;
    let mergedCount = 0;
    let skippedCount = 0;
    const failedRows = [];
    const applyErrors = [];
    for (const row of rows) {
      const resolution = customerDuplicateResolutions[row.rowIndex] || {
        action: "create_new",
        selectedCustomerId: "",
      };
      const payload = row.normalizedPayload;
      if (row.duplicateMatch && resolution.action === "skip") {
        skippedCount += 1;
        continue;
      }
      if (row.duplicateMatch && resolution.action === "merge_existing") {
        const targetCustomerId = resolution.selectedCustomerId;
        if (!targetCustomerId) {
          failedRows.push(row);
          applyErrors.push({
            rowIndex: row.rowIndex,
            fieldName: "duplicate_resolution",
            errorCode: "MERGE_TARGET_REQUIRED",
            errorMessage: "Duplicate row is missing a merge target.",
          });
          continue;
        }
        const updatePayload = { updated_at: new Date().toISOString() };
        [
          "first_name",
          "last_name",
          "phone",
          "email",
          "membership_duration",
          "membership_start_date",
          "membership_end_date",
        ].forEach((field) => {
          const value = payload[field];
          if (
            field in payload &&
            value !== undefined &&
            value !== null &&
            value !== ""
          ) {
            updatePayload[field] = value;
          }
        });
        const { error } = await supabase
          .from("customers")
          .update(updatePayload)
          .eq("id", targetCustomerId)
          .eq("gym_id", userId);
        if (error) {
          failedRows.push(row);
          applyErrors.push({
            rowIndex: row.rowIndex,
            fieldName: null,
            errorCode: "CUSTOMER_MERGE_FAILED",
            errorMessage:
              error.message || "Failed to merge duplicate customer row.",
          });
        } else {
          mergedCount += 1;
        }
        continue;
      }
      const { error } = await supabase.from("customers").insert({
        ...payload,
        gym_id: userId,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        failedRows.push(row);
        applyErrors.push({
          rowIndex: row.rowIndex,
          fieldName: null,
          errorCode: "CUSTOMER_INSERT_FAILED",
          errorMessage: error.message || "Failed to import customer row.",
        });
      } else {
        insertedCount += 1;
      }
    }
    return {
      insertedCount,
      mergedCount,
      skippedCount,
      failedRows,
      applyErrors,
    };
  };
  const applyCustomerImport = async () => {
    setCustomerImportLoading(true);
    setCustomerImportStatus(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      const unresolvedDuplicates = customerDuplicateRows.filter((row) => {
        const resolution = customerDuplicateResolutions[row.rowIndex];
        if (!resolution) return true;
        if (resolution.action === "review") return true;
        if (
          resolution.action === "merge_existing" &&
          !resolution.selectedCustomerId
        )
          return true;
        return false;
      });
      if (unresolvedDuplicates.length > 0) {
        throw new Error(
          `Resolve ${unresolvedDuplicates.length} duplicate rows before applying import.`,
        );
      }
      const validRows = customerImportRows.filter(
        (r) => r.validationStatus === "valid",
      );
      const {
        insertedCount,
        mergedCount,
        skippedCount,
        failedRows,
        applyErrors,
      } = await runCustomerImportRows({ rows: validRows, userId: user.id });
      setCustomerFailedRows(failedRows);
      await logImportJob({
        gymId: user.id,
        importType: "customers",
        sourceName: "csv_upload",
        fileName: customerImportFileName,
        rawRows: customerImportRows.map((r) => r.normalizedPayload),
        normalizedRows: customerImportRows,
        errors: [...customerImportErrors, ...applyErrors],
        reconciliations: [
          {
            metricName: "customers_count",
            legacyValue: customerImportRows.length,
            importedValue: insertedCount + mergedCount,
          },
        ],
      });
      setCustomerImportStatus({
        type: "success",
        message: `Inserted ${insertedCount}, merged ${mergedCount}, skipped ${skippedCount}. ${failedRows.length} rows failed and can be retried.`,
      });
      await fetchCustomers();
    } catch (error) {
      console.error("Customer import failed:", error);
      setCustomerImportStatus({
        type: "error",
        message: error.message || "Customer import failed.",
      });
    } finally {
      setCustomerImportLoading(false);
    }
  };
  const retryFailedCustomerRows = async () => {
    if (customerFailedRows.length === 0) return;
    setCustomerImportLoading(true);
    setCustomerImportStatus(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      const { insertedCount, mergedCount, skippedCount, failedRows } =
        await runCustomerImportRows({
          rows: customerFailedRows,
          userId: user.id,
        });
      setCustomerFailedRows(failedRows);
      setCustomerImportStatus({
        type: failedRows.length === 0 ? "success" : "error",
        message:
          failedRows.length === 0
            ? `Retry successful. Inserted ${insertedCount}, merged ${mergedCount}, skipped ${skippedCount}.`
            : `Retry finished. ${failedRows.length} rows are still failing.`,
      });
      await fetchCustomers();
    } catch (error) {
      setCustomerImportStatus({
        type: "error",
        message: error.message || "Retry failed.",
      });
    } finally {
      setCustomerImportLoading(false);
    }
  };
  const baseCustomers =
    customers.length > 0 ? customers : loading ? [] : mockCustomers;
  const customerFilterIndex = filterType === "active" ? 0 : 1;
  const displayCustomers = baseCustomers.filter((customer) => {
    // Search filter
    const fullName =
      `${customer.first_name} ${customer.last_name}`.toLowerCase();
    const matchesSearch = fullName.includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    // Membership filter
    if (filterType === "all") return true;
    if (!customer.membership_end_date) return false;
    const end = new Date(customer.membership_end_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return end >= today;
  });
  return (
    <div className="app-page px-4 md:px-6 lg:px-8 pt-12 md:pt-14 lg:pt-16 pb-4 md:pb-6 lg:pb-8">
      {" "}
      <div className="w-full max-w-[1200px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-1000">
        {" "}
        <div className="flex-shrink-0 mb-6 md:mb-8">
          {" "}
          <p className="text-[10px] tracking-[0.3em] text-white/40 font-mono mb-2">
            Member Operations
          </p>{" "}
          <h1 className="text-4xl md:text-5xl font-medium tracking-tighter text-white">
            Customer <span className="text-white/20">Directory</span>
          </h1>{" "}
          <div className="mt-6 border border-white/10 bg-white/[0.02] p-4 md:p-5">
            {" "}
            <p className="text-[10px] tracking-[0.2em] font-mono text-white/40">
              Data Import Moved To Auto Migration
            </p>{" "}
            <p className="text-xs text-white/50 mt-1">
              To import old member files, use Auto Migration for the full guided
              flow.
            </p>{" "}
            <button
              type="button"
              onClick={() => navigate("/auto-migration")}
              className="brand-action-btn mt-3 px-5 py-2 text-[10px] tracking-[0.2em] font-medium"
            >
              {" "}
              Open Auto Migration{" "}
            </button>{" "}
          </div>{" "}
          <div className="mt-6 flex flex-col lg:flex-row items-stretch lg:items-center gap-3 md:gap-4 w-full">
            {" "}
            <button
              onClick={handleOpenNewModal}
              className="brand-action-btn px-4 py-2 text-[10px] tracking-[0.14em] font-medium whitespace-nowrap transition-all duration-300"
            >
              {" "}
              New Application{" "}
            </button>{" "}
            {/* Search and Filter Area */}{" "}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto lg:ml-auto">
              {" "}
              {/* Search Bar */}{" "}
              <div className="relative group">
                {" "}
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-56 lg:w-64 bg-white/5 border border-white/10 px-10 py-2.5 text-[10px] tracking-[0.1em] focus:border-white/30 focus:bg-white/10 outline-none transition-all placeholder:text-white/20"
                />{" "}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-white/40 transition-colors"
                >
                  {" "}
                  <circle cx="11" cy="11" r="8" />{" "}
                  <path d="M21 21l-4.35-4.35" />{" "}
                </svg>{" "}
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors"
                  >
                    {" "}
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      {" "}
                      <path d="M18 6L6 18M6 6l12 12" />{" "}
                    </svg>{" "}
                  </button>
                )}{" "}
              </div>{" "}
              {/* Filter Toggle */}{" "}
              <div
                className="toggle-button-group members-filter-toggle"
                style={{ "--toggle-active-index": customerFilterIndex }}
              >
                {" "}
                <button
                  onClick={() => setFilterType("active")}
                  className={`toggle-button ${filterType === "active" ? "is-active" : ""}`}
                >
                  {" "}
                  Active Only{" "}
                </button>{" "}
                <button
                  onClick={() => setFilterType("all")}
                  className={`toggle-button ${filterType === "all" ? "is-active" : ""}`}
                >
                  {" "}
                  All Users{" "}
                </button>{" "}
              </div>{" "}
            </div>{" "}
          </div>{" "}
        </div>{" "}
        <div className="border border-white/10 overflow-x-auto custom-scrollbar">
          {" "}
          <div className="md:hidden divide-y divide-white/10">
            {" "}
            {displayCustomers.map((customer) => (
              <div key={`mobile-${customer.id}`} className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <SecureImage
                    filePath={customer.photo_url}
                    className="w-10 h-10 rounded-full border border-white/10 flex-shrink-0"
                    fallback={
                      <div className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex-shrink-0 flex items-center justify-center font-mono text-white/40 text-[10px]">
                        {" "}
                        {customer.first_name?.[0]}
                        {customer.last_name?.[0]}{" "}
                      </div>
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-white font-medium truncate">
                      {customer.first_name} {customer.last_name}
                    </p>
                    <p className="text-[9px] text-white/35 font-mono tracking-widest truncate">
                      Id:{" "}
                      {(customer?.id != null
                        ? String(customer.id)
                        : "-"
                      ).substring(0, 8)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-[11px]">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-white/45 tracking-wide">Email</span>
                    <span className="text-white/75 text-right break-all">
                      {customer.email || "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-white/45 tracking-wide">Phone</span>
                    <span className="text-white/75 text-right">
                      {customer.phone || "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-white/45 tracking-wide">
                      Membership
                    </span>
                    <span className="text-white/90 text-right">
                      {customer.membership_duration || "N/A"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    onClick={() => handleOpenEditModal(customer, false)}
                    className="native-inline-btn text-[10px] tracking-wider text-white/70"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleOpenDocsModal(customer)}
                    className="native-inline-btn text-[10px] tracking-wider text-white/70"
                  >
                    Docs
                  </button>
                  <button
                    onClick={() => handleOpenDetailsModal(customer)}
                    className="native-inline-btn text-[10px] tracking-wider text-white/70"
                  >
                    View
                  </button>
                  {(() => {
                    if (!customer.membership_end_date) return null;
                    const end = new Date(customer.membership_end_date);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const isActive = end >= today;
                    return isActive ? (
                      <button
                        onClick={() => handleTerminate(customer.id)}
                        className="native-inline-btn text-[10px] tracking-wider text-red-400/85"
                      >
                        Terminate
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOpenEditModal(customer, true)}
                        className="native-inline-btn text-[10px] tracking-wider text-emerald-400/85"
                      >
                        Renew
                      </button>
                    );
                  })()}
                  <button
                    onClick={() => handleDeleteCustomer(customer)}
                    className="native-inline-btn text-[10px] tracking-wider text-red-400/85"
                  >
                    Delete User
                  </button>
                </div>
              </div>
            ))}
          </div>
          <table className="hidden md:table w-full text-left border-collapse table-fixed">
            {" "}
            <thead>
              {" "}
              <tr className="bg-white/5 border-b border-white/10">
                {" "}
                <th className="p-4 text-[10px] tracking-[0.2em] font-mono text-white/40">
                  Name
                </th>{" "}
                <th className="p-4 text-[10px] tracking-[0.2em] font-mono text-white/40">
                  Email
                </th>{" "}
                <th className="p-4 text-[10px] tracking-[0.2em] font-mono text-white/40">
                  Phone
                </th>{" "}
                <th className="p-4 text-[10px] tracking-[0.2em] font-mono text-white/40">
                  Membership
                </th>{" "}
                <th className="p-4 text-[10px] tracking-[0.2em] font-mono text-white/40 text-right">
                  Actions
                </th>{" "}
              </tr>{" "}
            </thead>{" "}
            <tbody>
              {" "}
              {displayCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group"
                >
                  {" "}
                  <td className="p-4">
                    {" "}
                    <div className="flex items-center gap-4">
                      {" "}
                      {/* Avatar / Photo */}{" "}
                      <SecureImage
                        filePath={customer.photo_url}
                        className="w-10 h-10 rounded-full border border-white/10 flex-shrink-0"
                        fallback={
                          <div className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex-shrink-0 flex items-center justify-center font-mono text-white/40 text-[10px]">
                            {" "}
                            {customer.first_name?.[0]}
                            {customer.last_name?.[0]}{" "}
                          </div>
                        }
                      />{" "}
                      <div className="flex flex-col">
                        {" "}
                        <div className="flex items-center gap-3">
                          {" "}
                          <span className="text-[13px] font-medium tracking-tight ">
                            {" "}
                            {customer.first_name} {customer.last_name}{" "}
                          </span>{" "}
                          {/* Status Badge */}{" "}
                          {(() => {
                            if (!customer.membership_end_date) return null;
                            const end = new Date(customer.membership_end_date);
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const isActive = end >= today;
                            return isActive ? (
                              <span className="px-2 py-0.5 bg-emerald-500 text-black text-[8px] font-medium tracking-[0.1em] rounded-sm">
                                {" "}
                                Active{" "}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 border border-red-500/50 text-red-500 text-[8px] font-medium tracking-[0.1em] rounded-sm">
                                {" "}
                                Expired{" "}
                              </span>
                            );
                          })()}{" "}
                        </div>{" "}
                        <span className="text-[9px] text-white/20 font-mono tracking-widest mt-1">
                          {" "}
                          Id:{" "}
                          {(customer?.id != null
                            ? String(customer.id)
                            : "-"
                          ).substring(0, 8)}{" "}
                        </span>{" "}
                      </div>{" "}
                    </div>{" "}
                  </td>{" "}
                  <td className="p-4 text-sm text-white/60 font-body lowercase tracking-tight truncate">
                    {" "}
                    {customer.email}{" "}
                  </td>{" "}
                  <td className="p-4 text-sm text-white/60 font-mono tracking-tight whitespace-nowrap">
                    {" "}
                    {customer.phone}{" "}
                  </td>{" "}
                  <td className="p-4">
                    {" "}
                    <div className="flex flex-col">
                      {" "}
                      <span className="text-[10px] text-white tracking-widest font-medium">
                        {" "}
                        {customer.membership_duration || "N/A"}{" "}
                      </span>{" "}
                      <span className="text-[9px] text-white/40 font-mono mt-1">
                        {" "}
                        Until{" "}
                        {customer.membership_end_date
                          ? new Date(
                              customer.membership_end_date,
                            ).toLocaleDateString()
                          : "---"}{" "}
                      </span>{" "}
                    </div>{" "}
                  </td>{" "}
                  <td className="p-4 text-right relative">
                    {" "}
                    <div className="flex justify-end gap-3 items-center">
                      {" "}
                      {(() => {
                        if (!customer.membership_end_date) return null;
                        const end = new Date(customer.membership_end_date);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const isActive = end >= today;
                        return isActive ? (
                          <button
                            onClick={() => handleTerminate(customer.id)}
                            className="native-inline-btn text-[10px] tracking-widest text-red-500/60 font-medium hover:text-red-500 transition-colors"
                          >
                            {" "}
                            Terminate{" "}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleOpenEditModal(customer, true)}
                            className="native-inline-btn text-[10px] tracking-widest text-emerald-500/60 font-medium hover:text-emerald-500 transition-colors"
                          >
                            {" "}
                            Renew{" "}
                          </button>
                        );
                      })()}{" "}
                      <button
                        onClick={(e) => toggleMenu(e, customer.id)}
                        className="native-inline-btn text-white/40 hover:text-white transition-colors p-2"
                      >
                        {" "}
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                        >
                          {" "}
                          <circle cx="8" cy="3" r="1.5" />{" "}
                          <circle cx="8" cy="8" r="1.5" />{" "}
                          <circle cx="8" cy="13" r="1.5" />{" "}
                        </svg>{" "}
                      </button>{" "}
                    </div>{" "}
                    {activeMenuId === customer.id && (
                      <div
                        ref={menuRef}
                        className="absolute right-6 top-12 z-10 w-48 bg-[#1A1A1A] border border-white/10 shadow-3xl animate-in fade-in zoom-in-95 duration-200"
                      >
                        {" "}
                        <button
                          onClick={() => handleOpenEditModal(customer, false)}
                          className="native-inline-btn w-full text-left p-4 text-[10px] tracking-[0.2em] font-mono text-white/60 hover:text-white hover:bg-white/5 transition-colors border-b border-white/5"
                        >
                          {" "}
                          Edit Information{" "}
                        </button>{" "}
                        <button
                          onClick={() => handleOpenDocsModal(customer)}
                          className="native-inline-btn w-full text-left p-4 text-[10px] tracking-[0.2em] font-mono text-white/60 hover:text-white hover:bg-white/5 transition-colors border-b border-white/5"
                        >
                          {" "}
                          Client Docs{" "}
                        </button>{" "}
                        <button
                          onClick={() => handleOpenDetailsModal(customer)}
                          className="native-inline-btn w-full text-left p-4 text-[10px] tracking-[0.2em] font-mono text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                        >
                          {" "}
                          View Information{" "}
                        </button>{" "}
                        <button
                          onClick={() => handleDeleteCustomer(customer)}
                          className="native-inline-btn w-full text-left p-4 text-[10px] tracking-[0.2em] font-mono text-red-400/80 hover:text-red-300 hover:bg-red-500/10 transition-colors border-t border-white/5"
                        >
                          {" "}
                          Delete User{" "}
                        </button>{" "}
                      </div>
                    )}{" "}
                  </td>{" "}
                </tr>
              ))}{" "}
            </tbody>{" "}
          </table>{" "}
          {loading && customers.length === 0 && (
            <div className="p-24 text-center">
              {" "}
              <span className="text-[10px] tracking-[0.5em] text-white/20 animate-pulse font-mono font-medium">
                Synchronizing workspace...
              </span>{" "}
            </div>
          )}{" "}
          {!loading && displayCustomers.length === 0 && (
            <div className="p-24 text-center text-white/20 flex flex-col items-center gap-4">
              {" "}
              <span className="text-[10px] tracking-[0.3em] font-mono font-medium">
                No customer records found
              </span>{" "}
              <button
                onClick={handleOpenNewModal}
                className="text-[10px] tracking-[0.2em] font-medium text-white/60 hover:text-white underline underline-offset-4"
              >
                {" "}
                Create initial application{" "}
              </button>{" "}
            </div>
          )}{" "}
        </div>{" "}
      </div>{" "}
      {/* Customer Modal */}{" "}
      <CustomerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCustomerSaved={handleCustomerSaved}
        initialData={editingCustomer}
        isRenewal={isRenewalMode}
      />{" "}
      {/* Client Documents Modal */}{" "}
      <ClientDocsModal
        isOpen={isDocsModalOpen}
        onClose={() => setIsDocsModalOpen(false)}
        customer={editingCustomer}
        onDocsUpdated={handleCustomerSaved}
      />{" "}
      {/* Customer Details (Read-Only Info) Modal */}{" "}
      <CustomerDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        customer={editingCustomer}
      />{" "}
    </div>
  );
};
export default CustomersPage;
