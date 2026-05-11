import { supabase } from './supabaseClient';

export const IMPORT_SOURCE_PRESET_KEY = 'hmg_import_source_preset';

export const normalizeHeader = (header) =>
  String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

export const normalizeRowKeys = (row) => {
  const normalized = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    normalized[normalizeHeader(key)] = value;
  });
  return normalized;
};

export const setImportSourcePreset = (preset) => {
  const safePreset = ['generic', 'legacy_a', 'legacy_b'].includes(preset) ? preset : 'generic';
  localStorage.setItem(IMPORT_SOURCE_PRESET_KEY, safePreset);
};

export const getImportSourcePreset = () => {
  const preset = localStorage.getItem(IMPORT_SOURCE_PRESET_KEY);
  return ['generic', 'legacy_a', 'legacy_b'].includes(preset) ? preset : 'generic';
};

export const detectImportSourcePresetFromRows = (rows = []) => {
  const firstNonEmpty = (rows || []).find((row) =>
    Object.values(row || {}).some((value) => String(value || '').trim() !== '')
  );

  if (!firstNonEmpty) return 'generic';

  const keys = Object.keys(firstNonEmpty || {}).map(normalizeHeader);
  const keySet = new Set(keys);

  const matchesLegacyA =
    keySet.has('mobile_no') ||
    keySet.has('email_id') ||
    keySet.has('payment_date') ||
    keySet.has('plan');

  if (matchesLegacyA) return 'legacy_a';

  const matchesLegacyB =
    keySet.has('firstname') ||
    keySet.has('phone_number') ||
    keySet.has('payment_status') ||
    keySet.has('plan_name');

  if (matchesLegacyB) return 'legacy_b';

  return 'generic';
};

export const normalizeMembershipDuration = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '1 MONTH';

  const normalized = raw.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

  if (/\b(1\s*year|12\s*months?)\b/.test(normalized)) return '1 YEAR';
  if (/\b6\s*months?\b/.test(normalized)) return '6 MONTHS';
  if (/\b3\s*months?\b/.test(normalized)) return '3 MONTHS';
  if (/\b(1\s*month|monthly)\b/.test(normalized)) return '1 MONTH';

  return raw.toUpperCase();
};

export const mapCustomerRowFromPreset = (normalizedSource, sourcePreset = 'generic') => {
  const parseDate = (dateStr) => {
    if (!dateStr) return '';
    const trimmed = String(dateStr || '').trim();
    if (!trimmed) return '';

    // Already ISO (YYYY-MM-DD): keep as-is.
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    // DD/MM/YY, DD/MM/YYYY, DD-MM-YY, DD-MM-YYYY
    const parts = trimmed.split(/[\/-]/).map((part) => String(part).trim());
    if (parts.length === 3) {
      const [d, m, y] = parts;
      if (d && m && y) {
        const dayNum = parseInt(d, 10);
        const monthNum = parseInt(m, 10);
        const yearNum = parseInt(y, 10);
        const yyyy = y.length === 2 ? String(2000 + yearNum) : String(yearNum);
        if (
          Number.isFinite(dayNum) &&
          Number.isFinite(monthNum) &&
          Number.isFinite(parseInt(yyyy, 10)) &&
          dayNum >= 1 &&
          dayNum <= 31 &&
          monthNum >= 1 &&
          monthNum <= 12
        ) {
          const dd = String(dayNum).padStart(2, '0');
          const mm = String(monthNum).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        }
      }
    }
    return trimmed;
  };

  if (sourcePreset === 'legacy_a') {
    return {
      first_name: String(normalizedSource.first_name || '').trim(),
      last_name: String(normalizedSource.last_name || '').trim(),
      phone: String(normalizedSource.mobile_no || normalizedSource.phone || '').trim(),
      email: String(normalizedSource.email_id || normalizedSource.email || '').trim().toLowerCase(),
      membership_duration: normalizeMembershipDuration(
        normalizedSource.plan || normalizedSource.membership_duration || '1 MONTH',
      ),
      membership_start_date: parseDate(normalizedSource.start_date || normalizedSource.membership_start_date || ''),
      membership_end_date: parseDate(normalizedSource.end_date || normalizedSource.membership_end_date || ''),
      // Member ID: 'Member ID' column normalises to 'member_id'; 'ID' normalises to 'id'
      gym_member_id: String(normalizedSource.member_id || normalizedSource.id || '').trim() || undefined,
    };
  }

  if (sourcePreset === 'legacy_b') {
    return {
      first_name: String(normalizedSource.firstname || normalizedSource.first_name || '').trim(),
      last_name: String(normalizedSource.lastname || normalizedSource.last_name || '').trim(),
      phone: String(normalizedSource.phone_number || normalizedSource.phone || '').trim(),
      email: String(normalizedSource.email || '').trim().toLowerCase(),
      membership_duration: normalizeMembershipDuration(
        normalizedSource.plan_name || normalizedSource.membership_duration || '1 MONTH',
      ),
      membership_start_date: parseDate(normalizedSource.start_date || normalizedSource.membership_start_date || ''),
      membership_end_date: parseDate(normalizedSource.end_date || normalizedSource.membership_end_date || ''),
      gym_member_id: String(normalizedSource.member_id || normalizedSource.id || '').trim() || undefined,
    };
  }

  return {
    first_name: String(normalizedSource.first_name || normalizedSource.firstname || '').trim(),
    last_name: String(normalizedSource.last_name || normalizedSource.lastname || '').trim(),
    phone: String(normalizedSource.phone || normalizedSource.phone_number || '').trim(),
    email: String(normalizedSource.email || '').trim().toLowerCase(),
    membership_duration: normalizeMembershipDuration(
      normalizedSource.membership_duration || normalizedSource.plan_name || '1 MONTH',
    ),
    membership_start_date: parseDate(normalizedSource.membership_start_date || normalizedSource.start_date || ''),
    membership_end_date: parseDate(normalizedSource.membership_end_date || normalizedSource.end_date || ''),
    gym_member_id: String(normalizedSource.member_id || normalizedSource.id || '').trim() || undefined,
  };
};

export const mapPaymentRowFromPreset = (normalizedSource, sourcePreset = 'generic') => {
  const parsePaymentCreatedAt = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return new Date().toISOString();

    // Keep ISO-like values untouched.
    if (/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(raw)) {
      return raw;
    }

    // Treat slash/dash dates as DD/MM/YY or DD/MM/YYYY.
    const datePart = raw.split(/[T\s]/)[0];
    const parts = datePart.split(/[\/-]/).map((part) => String(part).trim());
    if (parts.length === 3) {
      const [d, m, y] = parts;
      const day = Number.parseInt(d, 10);
      const month = Number.parseInt(m, 10);
      const yearNum = Number.parseInt(y, 10);
      if (
        Number.isFinite(day) &&
        Number.isFinite(month) &&
        Number.isFinite(yearNum) &&
        day >= 1 &&
        day <= 31 &&
        month >= 1 &&
        month <= 12
      ) {
        const yyyy = y.length === 2 ? 2000 + yearNum : yearNum;
        const dd = String(day).padStart(2, '0');
        const mm = String(month).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
    }

    return raw;
  };

  if (sourcePreset === 'legacy_a') {
    const parsedAmount = parseFloat(normalizedSource.amount || 0);
    return {
      amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
      status: String(normalizedSource.status || 'completed').toLowerCase(),
      payment_mode: String(normalizedSource.mode || normalizedSource.payment_mode || 'cash').toLowerCase(),
      sender_name: String(normalizedSource.customer_name || normalizedSource.sender_name || '').trim(),
      sender_account_name: String(normalizedSource.account_name || normalizedSource.sender_account_name || '').trim(),
      source_transaction_id: String(normalizedSource.transaction_id || normalizedSource.source_transaction_id || '').trim(),
      created_at: parsePaymentCreatedAt(normalizedSource.payment_date || normalizedSource.created_at),
    };
  }

  if (sourcePreset === 'legacy_b') {
    const parsedAmount = parseFloat(normalizedSource.amount || 0);
    return {
      amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
      status: String(normalizedSource.payment_status || normalizedSource.status || 'completed').toLowerCase(),
      payment_mode: String(normalizedSource.mode || normalizedSource.payment_mode || 'cash').toLowerCase(),
      sender_name: String(normalizedSource.customer_name || normalizedSource.sender_name || '').trim(),
      sender_account_name: String(normalizedSource.sender_account_name || '').trim(),
      source_transaction_id: String(normalizedSource.transaction_id || normalizedSource.source_transaction_id || '').trim(),
      created_at: parsePaymentCreatedAt(normalizedSource.created_at),
    };
  }

  return {
    amount: (() => {
      const parsedAmount = parseFloat(normalizedSource.amount || 0);
      return Number.isFinite(parsedAmount) ? parsedAmount : 0;
    })(),
    status: String(normalizedSource.status || 'completed').toLowerCase(),
    payment_mode: String(normalizedSource.payment_mode || 'cash').toLowerCase(),
    sender_name: String(normalizedSource.sender_name || normalizedSource.customer_name || '').trim(),
    sender_account_name: String(normalizedSource.sender_account_name || '').trim(),
    source_transaction_id: String(normalizedSource.transaction_id || normalizedSource.source_transaction_id || '').trim(),
    created_at: parsePaymentCreatedAt(normalizedSource.created_at),
  };
};

export const logImportJob = async ({
  gymId,
  importType,
  sourceName,
  fileName,
  rawRows,
  normalizedRows,
  errors,
  reconciliations,
  status = 'applied',
}) => {
  const startedAt = new Date().toISOString();

  const { data: job, error: jobError } = await supabase
    .from('import_jobs')
    .insert({
      gym_id: gymId,
      source_name: sourceName,
      import_type: importType,
      status,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (jobError) throw jobError;

  const jobId = job.id;

  try {
    const { error: fileError } = await supabase.from('import_files').insert({
      job_id: jobId,
      gym_id: gymId,
      original_name: fileName || `${importType}.csv`,
      row_count: (rawRows || []).length,
    });
    if (fileError) throw fileError;

    if ((normalizedRows || []).length > 0) {
      const rowsToInsert = normalizedRows.map((row, index) => ({
        job_id: jobId,
        gym_id: gymId,
        row_index: index + 1,
        raw_payload: (rawRows || [])[index] || {},
        normalized_payload: row.normalizedPayload || {},
        validation_status: row.validationStatus || 'valid',
      }));

      const { error: rowsError } = await supabase.from('import_rows').insert(rowsToInsert);
      if (rowsError) throw rowsError;
    }

    if ((errors || []).length > 0) {
      const errorsToInsert = errors.map((err) => ({
        job_id: jobId,
        gym_id: gymId,
        row_index: err.rowIndex,
        field_name: err.fieldName || null,
        error_code: err.errorCode || 'VALIDATION_ERROR',
        error_message: err.errorMessage,
      }));

      const { error: errorsError } = await supabase.from('import_errors').insert(errorsToInsert);
      if (errorsError) throw errorsError;
    }

    if ((reconciliations || []).length > 0) {
      const reconciliationsToInsert = reconciliations.map((rec) => ({
        job_id: jobId,
        gym_id: gymId,
        metric_name: rec.metricName,
        legacy_value: rec.legacyValue || 0,
        imported_value: rec.importedValue || 0,
        variance: (rec.importedValue || 0) - (rec.legacyValue || 0),
      }));

      const { error: recError } = await supabase.from('import_reconciliations').insert(reconciliationsToInsert);
      if (recError) throw recError;
    }
  } catch (error) {
    // Compensation: delete the import_jobs record on any subsequent error
    await supabase.from('import_jobs').delete().eq('id', jobId);
    throw error;
  }

  return jobId;
};

export const saveImportMappingProfile = async ({ gymId, importType, mappingJson }) => {
  const { error } = await supabase.from('import_mappings').insert({
    gym_id: gymId,
    import_type: importType,
    mapping_json: mappingJson,
    created_at: new Date().toISOString(),
  });

  if (error) throw error;
};

export const getImportMappingProfiles = async ({ gymId, importType }) => {
  const { data, error } = await supabase
    .from('import_mappings')
    .select('*')
    .eq('gym_id', gymId)
    .eq('import_type', importType)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};
