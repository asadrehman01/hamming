import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { getUserWithRetry } from "../lib/authUser";
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
  normalizeMembershipDuration,
 } from "../lib/importJobs";
import { toMonthStartDateString } from "../lib/financeDates";
const CustomersPage = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [isRenewalMode, setIsRenewalMode] = useState(false);
  const [activeCustomerPopup, setActiveCustomerPopup] = useState(null);
  const [deleteTargetCustomer, setDeleteTargetCustomer] = useState(null);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);
  const [filterType, setFilterType] = useState("all");
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
  const [applicationDeliveryStatus, setApplicationDeliveryStatus] = useState(null);
  const [isDeliveryStatusVisible, setIsDeliveryStatusVisible] = useState(false);
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
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const normalizeCustomerFullName = (customer) =>
    `${String(customer?.first_name || "").trim()} ${String(customer?.last_name || "").trim()}`
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const buildPlanPriceMap = async () => {
    const { data, error } = await supabase
      .from("membership_plans")
      .select("duration_type, price");
    if (error) throw error;
    const planPriceMap = new Map();
    (data || []).forEach((plan) => {
      const key = normalizeMembershipDuration(plan.duration_type);
      if (key) {
        planPriceMap.set(key, Number(plan.price || 0));
      }
    });
    return planPriceMap;
  };
  const formatDateDMY = (value) => {
    const date = parseDateOnly(value);
    if (!date) return "---";
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = String(date.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  };
  useEffect(() => {
    fetchCustomers();
    return () => {
      return undefined;
    };
  }, []);
  useEffect(() => {
    const channel = supabase
      .channel("customers-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        () => {
          fetchCustomers();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  useEffect(() => {
    if (!applicationDeliveryStatus) {
      setIsDeliveryStatusVisible(false);
      return undefined;
    }

    setIsDeliveryStatusVisible(true);
    const fadeTimer = window.setTimeout(() => {
      setIsDeliveryStatusVisible(false);
    }, 9400);
    const removeTimer = window.setTimeout(() => {
      setApplicationDeliveryStatus(null);
    }, 10000);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, [applicationDeliveryStatus]);
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
      setActiveCustomerPopup(null);
      // 2. Refresh list
      await fetchCustomers();
    } catch (err) {
      console.error("Error terminating membership:", err);
      alert("Failed to terminate membership");
    }
  };
  const requestDeleteCustomer = (customer) => {
    setActiveCustomerPopup(null);
    setDeleteTargetCustomer(customer);
  };

  const handleDeleteCustomer = async () => {
    if (!deleteTargetCustomer) return;
    setIsDeletingCustomer(true);
    try {
      const customerId = deleteTargetCustomer.id;
      const gymId = deleteTargetCustomer.gym_id;
      // Delete app-side transactions/revenue rows linked to this customer.
      const { data: customerSubscriptions, error: subscriptionLookupError } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("gym_id", gymId)
        .eq("customer_id", customerId);
      if (subscriptionLookupError) throw subscriptionLookupError;

      const subscriptionIds = (customerSubscriptions || [])
        .map((subscription) => subscription?.id)
        .filter(Boolean);

      const { error: deleteMatchedPaymentsError } = await supabase
        .from("payments")
        .delete()
        .eq("gym_id", gymId)
        .eq("matched_customer_id", customerId);
      if (deleteMatchedPaymentsError) throw deleteMatchedPaymentsError;

      if (subscriptionIds.length > 0) {
        const { error: deleteSubscriptionPaymentsError } = await supabase
          .from("payments")
          .delete()
          .eq("gym_id", gymId)
          .in("subscription_id", subscriptionIds);
        if (deleteSubscriptionPaymentsError) throw deleteSubscriptionPaymentsError;

        const { error: deleteSubscriptionsError } = await supabase
          .from("subscriptions")
          .delete()
          .eq("gym_id", gymId)
          .in("id", subscriptionIds);
        if (deleteSubscriptionsError) throw deleteSubscriptionsError;
      }

      if (customerId) {
        // 4. Delete attendance logs
        await supabase
          .from("attendance_logs")
          .delete()
          .eq("user_id", gymId)
          .eq("customer_id", customerId);

        // 5. Delete communication logs
        await supabase
          .from("communication_logs")
          .delete()
          .eq("gym_id", gymId)
          .eq("customer_id", customerId);
      }

      const folderPrefix = `${deleteTargetCustomer.gym_id}/${deleteTargetCustomer.id}`;
      const storage = supabase.storage.from("customer-docs");
      const { data: existingDocs, error: listError } = await storage.list(folderPrefix);
      if (listError) throw listError;

      if (existingDocs?.length) {
        const docPaths = existingDocs
          .filter((item) => item.name)
          .map((item) => `${folderPrefix}/${item.name}`);

        if (docPaths.length) {
          const { error: removeError } = await storage.remove(docPaths);
          if (removeError) throw removeError;
        }
      }

      const { error } = await supabase
        .from("customers")
        .delete()
        .eq("id", customerId);
      if (error) throw error;

      setDeleteTargetCustomer(null);
      setActiveCustomerPopup(null);
      await fetchCustomers();
    } catch (err) {
      console.error("Error deleting customer:", err);
      alert("Failed to delete user");
    } finally {
      setIsDeletingCustomer(false);
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
    setActiveCustomerPopup(null);
  };
  const handleOpenDocsModal = (customer) => {
    setEditingCustomer(customer);
    setIsDocsModalOpen(true);
    setActiveCustomerPopup(null);
  };
  const handleOpenDetailsModal = (customer) => {
    setEditingCustomer(customer);
    setIsDetailsModalOpen(true);
    setActiveCustomerPopup(null);
  };
  const handleCustomerSaved = (savedCustomer, deliveryStatus = null) => {
    if (editingCustomer) {
      setCustomers(
        customers.map((c) => (c.id === savedCustomer.id ? savedCustomer : c)),
      );
    } else {
      setCustomers([savedCustomer, ...customers]);
    }

    if (deliveryStatus?.isNewApplication) {
      setApplicationDeliveryStatus({
        onboardingStatus: deliveryStatus.onboardingStatus || "Not available.",
        receiptStatus: deliveryStatus.receiptStatus || "Not available.",
      });
    }
  };
  const openCustomerPopup = (customer) => {
    if (window.getSelection().toString().length > 0) {
      return;
    }
    setActiveCustomerPopup(customer);
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
            membership_duration: normalizeMembershipDuration(
              presetPayload.membership_duration,
            ),
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
            } else if (phoneMatches.length === 1) {
              duplicateMatch = {
                type: "phone",
                reason: "Exact phone match",
                matches: [phoneMatches[0]],
              };
              initialResolutions[index + 1] = {
                action: "merge_existing",
                selectedCustomerId: phoneMatches[0].id,
              };
            } else if (emailMatches.length === 1) {
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
    let historyRowsCreated = 0;
    // ─ Member ID tracking ─────────────────────────────────────────────
    let idsFromSheet = 0;
    let idsAutoGenerated = 0;
    let idConflictsResolved = 0;
    const idConflictNotes = [];
    // ──────────────────────────────────────────────────────
    const failedRows = [];
    const applyErrors = [];

    const sortedRows = [...rows].sort((left, right) => {
      const leftDate = parseDateOnly(left.normalizedPayload.membership_start_date);
      const rightDate = parseDateOnly(right.normalizedPayload.membership_start_date);
      const leftTime = leftDate ? leftDate.getTime() : 0;
      const rightTime = rightDate ? rightDate.getTime() : 0;
      return leftTime - rightTime;
    });

    const planPriceMap = await buildPlanPriceMap();
    const { data: currentCustomers, error: customersError } = await supabase
      .from("customers")
      .select("id, phone, created_at")
      .eq("gym_id", userId)
      .order("created_at", { ascending: false });
    if (customersError) throw customersError;

    // Pre-load existing gym_member_ids to detect conflicts before inserting
    const { data: existingIdRows } = await supabase
      .from("customers")
      .select("gym_member_id")
      .eq("gym_id", userId)
      .not("gym_member_id", "is", null);
    const existingMemberIds = new Set(
      (existingIdRows || []).map((r) => r.gym_member_id).filter(Boolean)
    );
    // Tracks IDs assigned within this batch to catch intra-batch duplicates
    const batchMemberIds = new Set();

    const phoneTargetMap = new Map();
    (currentCustomers || []).forEach((customer) => {
      const phone = normalizePhone(customer.phone);
      if (phone && !phoneTargetMap.has(phone)) {
        phoneTargetMap.set(phone, customer.id);
      }
    });

    for (const row of sortedRows) {
      const resolution = customerDuplicateResolutions[row.rowIndex] || {
        action: "create_new",
        selectedCustomerId: "",
      };
      const payload = row.normalizedPayload;
      const normalizedPhone = normalizePhone(payload.phone);
      const normalizedDuration = normalizeMembershipDuration(
        payload.membership_duration,
      );
      const membershipStart = parseDateOnly(payload.membership_start_date);
      const membershipEnd = parseDateOnly(payload.membership_end_date);
      const ledgerCreatedAt = (membershipStart || new Date()).toISOString();
      const planAmount = Number(planPriceMap.get(normalizedDuration) || 0);

      if (row.duplicateMatch && resolution.action === "skip") {
        skippedCount += 1;
        continue;
      }

      let customerId =
        (row.duplicateMatch && resolution.action === "merge_existing"
          ? resolution.selectedCustomerId
          : "") ||
        (normalizedPhone ? phoneTargetMap.get(normalizedPhone) : "");

      if (customerId) {
        const updatePayload = { updated_at: new Date().toISOString() };
        [
          "first_name",
          "last_name",
          "phone",
          "email",
          "membership_duration",
          "membership_start_date",
          "membership_end_date",
          "price_paid",
        ].forEach((field) => {
          const value =
            field === "membership_duration"
              ? normalizedDuration
              : payload[field];
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
          .eq("id", customerId)
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
          continue;
        }
        mergedCount += 1;
      } else {
        // ── Gym Member ID resolution ───────────────────────────────────────
        const sheetMemberId = String(payload.gym_member_id || "").trim();
        let resolvedMemberId;

        if (sheetMemberId) {
          const hasConflict =
            existingMemberIds.has(sheetMemberId) || batchMemberIds.has(sheetMemberId);

          if (hasConflict) {
            // Conflict: auto-generate a fresh ID and flag it
            const { data: gid, error: ge } = await supabase.rpc(
              "generate_gym_member_id",
              { p_user_id: userId }
            );
            if (ge) throw new Error(`Failed to auto-generate member ID: ${ge.message}`);
            resolvedMemberId = gid;
            idConflictsResolved++;
            const note = `Row ${row.rowIndex}: Member ID ${sheetMemberId} already exists, a new ID was auto-generated: ${resolvedMemberId}`;
            idConflictNotes.push(note);
            applyErrors.push({
              rowIndex: row.rowIndex,
              fieldName: "gym_member_id",
              errorCode: "MEMBER_ID_CONFLICT_RESOLVED",
              errorMessage: note,
            });
          } else {
            resolvedMemberId = sheetMemberId;
            idsFromSheet++;
          }
        } else {
          // No ID in sheet → auto-generate
          const { data: gid, error: ge } = await supabase.rpc(
            "generate_gym_member_id",
            { p_user_id: userId }
          );
          if (ge) throw new Error(`Failed to auto-generate member ID: ${ge.message}`);
          resolvedMemberId = gid;
          idsAutoGenerated++;
        }

        // Register for intra-batch + future-row conflict detection
        batchMemberIds.add(resolvedMemberId);
        existingMemberIds.add(resolvedMemberId);
        // ──────────────────────────────────────────────────────────

        const { data: insertedCustomer, error } = await supabase
          .from("customers")
          .insert({
            ...payload,
            membership_duration: normalizedDuration,
            phone: normalizedPhone,
            gym_id: userId,
            gym_member_id: resolvedMemberId,
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (error) {
          failedRows.push(row);
          applyErrors.push({
            rowIndex: row.rowIndex,
            fieldName: null,
            errorCode: "CUSTOMER_INSERT_FAILED",
            errorMessage: error.message || "Failed to import customer row.",
          });
          continue;
        }
        customerId = insertedCustomer?.id || "";
        if (normalizedPhone && customerId) {
          phoneTargetMap.set(normalizedPhone, customerId);
        }
        insertedCount += 1;
      }

      if (!customerId) {
        failedRows.push(row);
        applyErrors.push({
          rowIndex: row.rowIndex,
          fieldName: null,
          errorCode: "CUSTOMER_ID_MISSING",
          errorMessage: "Could not resolve a customer record for this row.",
        });
        continue;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const normalizedMembershipEnd = membershipEnd
        ? new Date(membershipEnd.getTime())
        : null;
      if (normalizedMembershipEnd) {
        normalizedMembershipEnd.setHours(0, 0, 0, 0);
      }

      const { data: subscriptionRow, error: subscriptionError } = await supabase
        .from("subscriptions")
        .insert({
          gym_id: userId,
          customer_id: customerId,
          plan_name: normalizedDuration,
          amount: planAmount,
          status:
            normalizedMembershipEnd && normalizedMembershipEnd < today
              ? "COMPLETED"
              : "ACTIVE",
          created_at: ledgerCreatedAt,
          updated_at: ledgerCreatedAt,
        })
        .select("id")
        .single();

      if (subscriptionError) {
        failedRows.push(row);
        applyErrors.push({
          rowIndex: row.rowIndex,
          fieldName: null,
          errorCode: "SUBSCRIPTION_HISTORY_FAILED",
          errorMessage:
            subscriptionError.message || "Failed to create subscription history row.",
        });
        continue;
      }

      const paymentPayload = {
        gym_id: userId,
        subscription_id: subscriptionRow?.id || null,
        matched_customer_id: customerId,
        amount: planAmount,
        status: "completed",
        payment_mode: "cash",
        sender_name: `${payload.first_name || ""} ${payload.last_name || ""}`.trim(),
        sender_account_name: payload.email || null,
        revenue_month: toMonthStartDateString(
          payload.membership_start_date || new Date(),
        ),
        created_at: ledgerCreatedAt,
      };

      const { error: paymentError } = await supabase
        .from("payments")
        .insert(paymentPayload);
      if (paymentError) {
        failedRows.push(row);
        applyErrors.push({
          rowIndex: row.rowIndex,
          fieldName: null,
          errorCode: "PAYMENT_HISTORY_FAILED",
          errorMessage:
            paymentError.message || "Failed to create payment history row.",
        });
        continue;
      }

      historyRowsCreated += 1;
    }

    return {
      insertedCount,
      mergedCount,
      skippedCount,
      historyRowsCreated,
      failedRows,
      applyErrors,
      // Member ID stats
      idsFromSheet,
      idsAutoGenerated,
      idConflictsResolved,
      idConflictNotes,
    };
  };
  const applyCustomerImport = async () => {
    setCustomerImportLoading(true);
    setCustomerImportStatus(null);
    try {
      const {
        data: { user },
      } = await getUserWithRetry(supabase);
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
        historyRowsCreated,
        failedRows,
        applyErrors,
        idsFromSheet,
        idsAutoGenerated,
        idConflictsResolved,
        idConflictNotes,
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
          {
            metricName: "subscription_history_count",
            legacyValue: 0,
            importedValue: historyRowsCreated,
          },
        ],
      });
      setCustomerImportStatus({
        type: "success",
        message: [
          `Inserted ${insertedCount}, merged ${mergedCount}, created ${historyRowsCreated} history entries, skipped ${skippedCount}.`,
          `Member IDs: ${idsFromSheet} from sheet, ${idsAutoGenerated} auto-generated, ${idConflictsResolved} conflict(s) resolved.`,
          idConflictNotes.length > 0 ? idConflictNotes.join(" | ") : null,
          failedRows.length > 0 ? `${failedRows.length} rows failed and can be retried.` : null,
        ].filter(Boolean).join(" "),
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
      } = await getUserWithRetry(supabase);
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
    customers.length > 0 ? customers : [];
  const customerFilterIndex = filterType === "active" ? 0 : 1;
  const displayCustomers = baseCustomers.filter((customer) => {
    // Search filter
    const fullName =
      `${customer.first_name} ${customer.last_name}`.toLowerCase();
    const matchesSearch = fullName.includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    // Membership filter
    if (filterType === "all") return true;
    if (!customer.membership_start_date || !customer.membership_end_date) {
      return false;
    }
    const start = parseDateOnly(customer.membership_start_date);
    const end = parseDateOnly(customer.membership_end_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isValidStart = Boolean(start) && Number.isFinite(start.getTime());
    const isValidEnd = Boolean(end) && Number.isFinite(end.getTime());
    if (!isValidStart || !isValidEnd) return false;
    return start <= today && today <= end;
  });
  return (
    <div
      className="app-page members-page-vibe px-4 md:px-6 lg:px-8 pt-12 md:pt-14 lg:pt-16 pb-4 md:pb-6 lg:pb-8"
      style={{
        "--app-theme-page-bg": "#ffffff",
        "--app-theme-card-bg": "#fbfbfb",
        "--app-theme-card-bg-alt": "#f4f4f4",
        color: "#0d0d0d",
      }}
    >
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=DM+Sans:wght@400;500;600&display=swap");
        .members-page-vibe {
          background: #ffffff !important;
          color: #0d0d0d !important;
          font-family: "DM Sans", system-ui, sans-serif;
          min-height: 100vh;
        }
        .members-page-vibe .members-header-title {
          font-family: "Playfair Display", Georgia, serif;
        }
        .members-page-vibe .members-card {
          background: #fafafa !important;
          border-color: rgba(0, 0, 0, 0.12) !important;
        }
        .members-page-vibe .members-card-alt {
          background: #ffffff !important;
          border-color: rgba(0, 0, 0, 0.12) !important;
        }
        .members-page-vibe .members-subtle {
          color: #8a8a8a !important;
        }
        .members-page-vibe .members-muted {
          color: #666666 !important;
        }
        .members-page-vibe .members-card-title {
          color: #6b6b6b !important;
        }
        .members-page-vibe .members-value {
          font-family: "Helvetica Neue", Helvetica, Arial, sans-serif !important;
          font-weight: 500 !important;
          letter-spacing: 0.02em !important;
        }
        .members-page-vibe [class*="bg-white/"] {
          background: #fafafa !important;
        }
        .members-page-vibe [class*="text-white/"] {
          color: #8a8a8a !important;
        }
        .members-page-vibe .text-white {
          color: #0d0d0d !important;
        }
        .members-page-vibe [class*="border-white/"] {
          border-color: rgba(0, 0, 0, 0.12) !important;
        }
        .members-page-vibe input,
        .members-page-vibe select {
          background: #ffffff !important;
          color: #0d0d0d !important;
          border-color: #e0e0e0 !important;
        }
        .members-page-vibe input::placeholder {
          color: #a0a0a0 !important;
        }
        .members-page-vibe option {
          background: #ffffff;
          color: #0d0d0d;
        }
        .members-page-vibe .mobile-customer-row {
          border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
          transition: background-color 0.2s ease;
        }
        .members-page-vibe .mobile-customer-row:last-child {
          border-bottom: none !important;
        }
        .members-page-vibe .mobile-customer-row:hover {
          background-color: rgba(0, 0, 0, 0.015) !important;
        }
        .members-page-vibe .new-application-btn {
          background: #2b2d31 !important;
          color: #ffffff !important;
          border: 1px solid #2b2d31 !important;
          border-radius: 12px !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
        }
        .members-page-vibe .new-application-btn:hover {
          background: #1a1b1e !important;
          border-color: #1a1b1e !important;
          transform: translateY(-1px) !important;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15) !important;
        }
        .members-page-vibe .new-application-btn:active {
          transform: translateY(0) !important;
        }
      `}</style>

      <div className="w-full max-w-[1200px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-1000">
        
        <div className="flex-shrink-0 mb-6 md:mb-8">
          <div className="space-y-2">
            <p className="text-[10px] tracking-[0.08em] members-subtle dm-sans-light-008">
              Member Operations
            </p>
            <h1 className="members-header-title text-4xl md:text-5xl font-medium tracking-tighter text-[#0d0d0d]">
              Customer <span className="members-subtle">Directory</span>
            </h1>
          </div>
          <div className="mt-6 flex flex-col lg:flex-row items-stretch lg:items-center gap-3 md:gap-4 w-full">
            
            <button
              onClick={handleOpenNewModal}
              className="new-application-btn px-5 py-2.5 text-[10px] tracking-[0.12em] dm-sans-light-008 font-medium whitespace-nowrap"
            >
              
              New Application
            </button>
            {/* Search and Filter Area */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto lg:ml-auto">
              
              {/* Search Bar */}
              <div className="relative group">
                
                <input
                  id="customer-search"
                  name="customer-search"
                  type="text"
                  placeholder="Search by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-56 lg:w-64 bg-white/5 border border-white/10 px-10 py-2.5 text-[10px] tracking-[0.1em] rounded-xl focus:border-white/30 focus:bg-white/10 outline-none transition-all placeholder:text-white/20"
                />
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-white/40 transition-colors"
                >
                  
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors"
                  >
                    
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {/* Filter Toggle */}
              <div
                className="toggle-button-group members-filter-toggle"
                style={{ "--toggle-active-index": customerFilterIndex }}
              >
                
                <button
                  onClick={() => setFilterType("active")}
                  className={`toggle-button ${filterType === "active" ? "is-active" : ""}`}
                >
                  
                  Active Only
                </button>
                <button
                  onClick={() => setFilterType("all")}
                  className={`toggle-button ${filterType === "all" ? "is-active" : ""}`}
                >
                  
                  All Users
                </button>
              </div>
            </div>
          </div>

          {applicationDeliveryStatus && (
            <div
              className={`mt-3 md:mt-4 border border-white/10 bg-white/[0.03] rounded-xl px-3 py-2.5 transition-opacity duration-500 ${isDeliveryStatusVisible ? "opacity-100" : "opacity-0"}`}
            >
              <p className="text-[9px] tracking-[0.12em] text-white/45 dm-sans-light-008 uppercase">
                Application Delivery Status
              </p>
              <p className="mt-1 text-[10px] tracking-[0.08em] text-white/80 dm-sans-light-008">
                Onboarding message: {applicationDeliveryStatus.onboardingStatus}
              </p>
              <p className="text-[10px] tracking-[0.08em] text-white/80 dm-sans-light-008">
                Receipt: {applicationDeliveryStatus.receiptStatus}
              </p>
            </div>
          )}
        </div>
        <div className="members-card mb-6 border p-4 md:p-6 overflow-x-auto custom-scrollbar rounded-2xl shadow-lg shadow-black/5">
          
          <div className="md:hidden">
            
            {displayCustomers.map((customer) => (
              <div
                key={`mobile-${customer.id}`}
                className="mobile-customer-row p-4 space-y-3 cursor-pointer"
                onClick={() => openCustomerPopup(customer)}
              >
                <div className="flex items-center gap-3">
                  <SecureImage
                    filePath={customer.photo_url}
                    className="w-10 h-10 rounded-full border border-white/10 flex-shrink-0"
                    fallback={
                      <div className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex-shrink-0 flex items-center justify-center font-mono text-white/40 text-[10px]">
                        
                        {customer.first_name?.[0]}
                        {customer.last_name?.[0]}
                      </div>
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] text-white font-medium truncate">
                        {customer.first_name} {customer.last_name}
                      </p>
                      {(() => {
                        if (!customer.membership_end_date) return null;
                        const end = parseDateOnly(customer.membership_end_date);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const isActive = end && end >= today;
                        return isActive ? (
                          <span className="px-2 py-0.5 bg-emerald-500 text-black text-[8px] font-medium tracking-[0.1em] rounded-sm flex-shrink-0">
                            Active
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 border border-red-500/50 text-red-500 text-[8px] font-medium tracking-[0.1em] rounded-sm flex-shrink-0">
                            Expired
                          </span>
                        );
                      })()}
                    </div>
                    <p className="text-[9px] text-white/35 dm-sans-light-008 tracking-[0.08em] truncate mt-0.5">
                      Id:
                      {(customer?.id != null
                        ? String(customer.id)
                        : "-"
                      ).substring(0, 8)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openCustomerPopup(customer);
                    }}
                    className="native-inline-btn text-white/45 hover:text-white p-1"
                    aria-label="Open customer actions"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                    >
                      <circle cx="8" cy="3" r="1.5" />
                      <circle cx="8" cy="8" r="1.5" />
                      <circle cx="8" cy="13" r="1.5" />
                    </svg>
                  </button>
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
                    <span className="text-white/45 tracking-[0.08em] dm-sans-light-008">
                      Membership
                    </span>
                    <span className="text-white/90 text-right dm-sans-light-008 tracking-[0.08em]">
                      {customer.membership_duration || "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-white/45 tracking-[0.08em] dm-sans-light-008">
                      Status
                    </span>
                    {(() => {
                      if (!customer.membership_end_date) return (
                        <span className="text-white/45 dm-sans-light-008 tracking-[0.08em]">N/A</span>
                      );
                      const end = parseDateOnly(customer.membership_end_date);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const isActive = end && end >= today;
                      return isActive ? (
                        <span className="text-emerald-400 font-medium tracking-[0.08em] dm-sans-light-008">
                          Active
                        </span>
                      ) : (
                        <span className="text-red-400 font-medium tracking-[0.08em] dm-sans-light-008">
                          Expired
                        </span>
                      );
                    })()}
                  </div>
                </div>

                <div className="pt-1">
                  <span className="text-[10px] tracking-[0.08em] text-white/45 dm-sans-light-008">
                    Tap user card for actions
                  </span>
                </div>
              </div>
            ))}
          </div>
          <table className="hidden md:table w-full text-left border-collapse table-fixed">
            
            <thead>
              
              <tr className="bg-white/5 border-b border-white/10">
                
                <th className="p-4 text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/40">
                  Name
                </th>
                <th className="p-4 text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/40">
                  Email
                </th>
                <th className="p-4 text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/40">
                  Phone
                </th>
                <th className="p-4 text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/40">
                  Membership
                </th>
                <th className="p-4 text-[10px] tracking-[0.08em] dm-sans-light-008 text-white/40 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
               {displayCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group cursor-pointer"
                  onClick={() => openCustomerPopup(customer)}
                >
                  
                  <td className="p-4">
                    
                    <div className="flex items-center gap-4">
                      
                      {/* Avatar / Photo */}
                      <SecureImage
                        filePath={customer.photo_url}
                        className="w-10 h-10 rounded-full border border-white/10 flex-shrink-0"
                        fallback={
                          <div className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex-shrink-0 flex items-center justify-center font-mono text-white/40 text-[10px]">
                            
                            {customer.first_name?.[0]}
                            {customer.last_name?.[0]}
                          </div>
                        }
                      />
                      <div className="flex flex-col">
                        
                        <div className="flex items-center gap-3">
                          
                          <span className="text-[13px] font-medium tracking-tight ">
                            
                            {customer.first_name} {customer.last_name}
                          </span>
                          {/* Status Badge */}
                          {(() => {
                            if (!customer.membership_end_date) return null;
                            const end = parseDateOnly(customer.membership_end_date);
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const isActive = end && end >= today;
                            return isActive ? (
                              <span className="px-2 py-0.5 bg-emerald-500 text-black text-[8px] font-medium tracking-[0.1em] rounded-sm">
                                
                                Active
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 border border-red-500/50 text-red-500 text-[8px] font-medium tracking-[0.1em] rounded-sm">
                                
                                Expired
                              </span>
                            );
                          })()}
                        </div>
                        <span className="text-[9px] text-white/20 dm-sans-light-008 tracking-[0.08em] mt-1">
                          
                          Id:
                          {(customer?.id != null
                            ? String(customer.id)
                            : "-"
                          ).substring(0, 8)}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-white/60 font-body lowercase tracking-tight truncate">
                    
                    {customer.email}
                  </td>
                  <td className="p-4 text-sm text-white/60 font-mono tracking-tight whitespace-nowrap">
                    
                    {customer.phone}
                  </td>
                  <td className="p-4">
                    
                    <div className="flex flex-col">
                      
                      <span className="text-[10px] text-white tracking-[0.08em] dm-sans-light-008">
                        
                        {customer.membership_duration || "N/A"}
                      </span>
                      <span className="text-[9px] text-white/40 dm-sans-light-008 tracking-[0.08em] mt-1">
                        
                        Until 
                        {formatDateDMY(customer.membership_end_date)}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-right relative">
                    
                    <div className="flex justify-end gap-3 items-center">
                      
                      {(() => {
                        if (!customer.membership_end_date) return null;
                         const end = parseDateOnly(customer.membership_end_date);
                         const today = new Date();
                         today.setHours(0, 0, 0, 0);
                         const isActive = end && end >= today;
                        return isActive ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTerminate(customer.id);
                            }}
                            className="native-inline-btn text-[10px] tracking-widest text-red-500/60 font-medium hover:text-red-500 transition-colors"
                          >
                            
                            Terminate
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditModal(customer, true);
                            }}
                            className="native-inline-btn text-[10px] tracking-widest text-emerald-500/60 font-medium hover:text-emerald-500 transition-colors"
                          >
                            
                            Renew
                          </button>
                        );
                      })()}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openCustomerPopup(customer);
                        }}
                        className="native-inline-btn text-white/40 hover:text-white transition-colors p-2"
                      >
                        
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                        >
                          
                          <circle cx="8" cy="3" r="1.5" />
                          <circle cx="8" cy="8" r="1.5" />
                          <circle cx="8" cy="13" r="1.5" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && customers.length === 0 && (
            <div className="p-24 text-center">
              
              <span className="text-[10px] tracking-[0.5em] text-white/20 animate-pulse font-mono font-medium">
                Synchronizing workspace...
              </span>
            </div>
          )}
          {!loading && displayCustomers.length === 0 && (
            <div className="p-24 text-center text-white/20 flex flex-col items-center gap-4">
              
              <span className="text-[10px] tracking-[0.3em] font-mono font-medium">
                No customer records found
              </span>
              <button
                onClick={handleOpenNewModal}
                className="px-5 py-2.5 bg-white text-black border border-white/10 rounded-xl text-[10px] tracking-[0.12em] dm-sans-light-008 hover:bg-white/90 transition-colors"
              >
                
                Create initial application
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Customer Modal */}
      <CustomerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCustomerSaved={handleCustomerSaved}
        initialData={editingCustomer}
        isRenewal={isRenewalMode}
      />
      {/* Client Documents Modal */}
      <ClientDocsModal
        isOpen={isDocsModalOpen}
        onClose={() => setIsDocsModalOpen(false)}
        customer={editingCustomer}
        onDocsUpdated={handleCustomerSaved}
      />
      {/* Customer Details (Read-Only Info) Modal */}
      <CustomerDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        customer={editingCustomer}
      />

      {activeCustomerPopup && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setActiveCustomerPopup(null)}
        >
          <div
            className="w-full sm:max-w-md bg-[#0a0c10] border border-white/10 rounded-2xl p-4 sm:p-5 dm-sans-light-008 shadow-[0_22px_80px_rgba(0,0,0,0.55)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-1 pb-3 border-b border-white/10 mb-3">
              <p className="text-[10px] tracking-[0.08em] text-white/45 uppercase">Customer Actions</p>
              <p className="text-white text-[15px] tracking-[0.08em] font-light mt-0.5">
                {activeCustomerPopup.first_name} {activeCustomerPopup.last_name}
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleOpenEditModal(activeCustomerPopup, false)}
              className="w-full text-left px-3 py-3 text-[11px] tracking-[0.08em] text-white/85 bg-white/[0.02] border border-white/10 rounded-xl hover:bg-white/[0.05] transition-colors"
            >
              Edit Information
            </button>
            <button
              type="button"
              onClick={() => handleOpenDocsModal(activeCustomerPopup)}
              className="mt-2 w-full text-left px-3 py-3 text-[11px] tracking-[0.08em] text-white/85 bg-white/[0.02] border border-white/10 rounded-xl hover:bg-white/[0.05] transition-colors"
            >
              Client Docs
            </button>
            <button
              type="button"
              onClick={() => handleOpenDetailsModal(activeCustomerPopup)}
              className="mt-2 w-full text-left px-3 py-3 text-[11px] tracking-[0.08em] text-white/85 bg-white/[0.02] border border-white/10 rounded-xl hover:bg-white/[0.05] transition-colors"
            >
              View Information
            </button>

            {(() => {
              if (!activeCustomerPopup.membership_end_date) return null;
              const end = parseDateOnly(activeCustomerPopup.membership_end_date);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const isActive = end && end >= today;

              if (isActive) {
                return (
                  <button
                    type="button"
                    onClick={() => handleTerminate(activeCustomerPopup.id)}
                    className="mt-2 w-full text-left px-3 py-3 text-[11px] tracking-[0.08em] text-red-300/90 bg-red-400/[0.05] border border-red-300/15 rounded-xl hover:bg-red-400/[0.1] transition-colors"
                  >
                    Terminate
                  </button>
                );
              }

              return (
                <button
                  type="button"
                  onClick={() => handleOpenEditModal(activeCustomerPopup, true)}
                  className="mt-2 w-full text-left px-3 py-3 text-[11px] tracking-[0.08em] text-white/85 bg-white/[0.02] border border-white/10 rounded-xl hover:bg-white/[0.05] transition-colors"
                >
                  Renew
                </button>
              );
            })()}

            <button
              type="button"
              onClick={() => requestDeleteCustomer(activeCustomerPopup)}
              className="mt-2 w-full text-left px-3 py-3 text-[11px] tracking-[0.08em] text-red-300/90 bg-red-400/[0.05] border border-red-300/15 rounded-xl hover:bg-red-400/[0.1] transition-colors"
            >
              Delete User
            </button>

            <button
              type="button"
              onClick={() => setActiveCustomerPopup(null)}
              className="mt-3 w-full text-center px-3 py-2.5 text-[10px] tracking-[0.08em] text-white/65 border border-white/10 rounded-xl hover:bg-white/[0.04] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {deleteTargetCustomer && (
        <div
          className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => {
            if (!isDeletingCustomer) setDeleteTargetCustomer(null);
          }}
        >
          <div
            className="w-full max-w-sm bg-[#0a0c10] border border-white/10 rounded-2xl p-4 sm:p-5 dm-sans-light-008 shadow-[0_22px_80px_rgba(0,0,0,0.55)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-1 pb-3 border-b border-white/10 mb-3">
              <p className="text-[10px] tracking-[0.08em] text-red-300/90 uppercase">Delete User</p>
              <p className="text-white text-[15px] tracking-[0.08em] font-light mt-1">
                {deleteTargetCustomer.first_name} {deleteTargetCustomer.last_name}
              </p>
            </div>

            <p className="text-[11px] tracking-[0.08em] text-white/75 leading-relaxed">
              This action permanently deletes this customer from the app, removes related transaction and revenue logs, and removes related files from cloud storage. This cannot be undone.
            </p>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDeleteTargetCustomer(null)}
                disabled={isDeletingCustomer}
                className="flex-1 px-3 py-2.5 text-[10px] tracking-[0.08em] text-white/70 border border-white/10 rounded-xl hover:bg-white/[0.04] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteCustomer}
                disabled={isDeletingCustomer}
                className="flex-1 px-3 py-2.5 text-[10px] tracking-[0.08em] text-red-200 bg-red-500/[0.13] border border-red-300/25 rounded-xl hover:bg-red-500/[0.2] transition-colors disabled:opacity-50"
              >
                {isDeletingCustomer ? "Deleting..." : "Delete User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default CustomersPage;



