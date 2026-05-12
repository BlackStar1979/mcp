import {
  normalizeInventoryEntry,
} from './remote_site_retention_inventory.js';
import {
  evaluateOpsPolicy,
} from './remote_site_ops_policy.js';



function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function classifyOpsLogLine(line) {
  if (typeof line !== 'string' || !line.trim()) {
    return { schema: 'blank', valid: false, error: 'blank line' };
  }

  try {
    const record = JSON.parse(line);

    if (record.schema_version === 1 && typeof record.operation_id === 'string') {
      return { schema: 'schema_v1', valid: true, operation: record.operation || null };
    }

    if (typeof record.operation === 'string' && typeof record.actor === 'string') {
      return { schema: 'canonical_v0', valid: true, operation: record.operation };
    }

    if (typeof record.action === 'string') {
      return { schema: 'legacy_action', valid: true, operation: record.action };
    }

    return { schema: 'unknown_json', valid: false, error: 'unrecognized JSONL schema' };
  } catch (error) {
    return { schema: 'invalid_json', valid: false, error: error.message };
  }
}

export function summarizeOpsLogLines(lines) {
  if (!Array.isArray(lines)) {
    throw new Error('lines must be array');
  }

  const by_schema = {};
  const by_operation = {};
  const invalid = [];

  for (const [index, line] of lines.entries()) {
    const classified = classifyOpsLogLine(line);
    by_schema[classified.schema] = (by_schema[classified.schema] || 0) + 1;

    if (classified.operation) {
      by_operation[classified.operation] = (by_operation[classified.operation] || 0) + 1;
    }

    if (!classified.valid) {
      invalid.push({ line: index + 1, schema: classified.schema, error: classified.error });
    }
  }

  return {
    total_lines: lines.length,
    by_schema,
    by_operation,
    invalid_lines: invalid,
  };
}

function rightsPartToOctal(part) {
  if (typeof part !== 'string') return 0;
  let value = 0;
  if (part.includes('r')) value += 4;
  if (part.includes('w')) value += 2;
  if (part.includes('x')) value += 1;
  return value;
}

function normalizeMode(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `0${(value & 0o777).toString(8)}`;
  }

  if (isObject(value)) {
    if (value.mode !== undefined) return normalizeMode(value.mode);
    if ('user' in value || 'group' in value || 'other' in value) {
      return `0${rightsPartToOctal(value.user)}${rightsPartToOctal(value.group)}${rightsPartToOctal(value.other)}`;
    }
  }

  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim();
    if (/^[0-7]{3,4}$/.test(trimmed)) return trimmed.length === 3 ? `0${trimmed}` : trimmed;
    return trimmed;
  }

  return null;
}

export function normalizeRuntimeInventoryEntry(entry) {
  const normalized = normalizeInventoryEntry(entry);
  const mode = normalizeMode(entry.mode ?? entry.permissions ?? entry.rights?.mode ?? entry.rights);

  return {
    ...normalized,
    mode,
  };
}

export function summarizeRuntimeInventory(entries) {
  if (!Array.isArray(entries)) {
    throw new Error('entries must be array');
  }

  const normalized_entries = [];
  const invalid_entries = [];
  const by_area = {};
  const permission_warnings = [];
  let total_size = 0;

  for (const entry of entries) {
    try {
      const normalized = normalizeRuntimeInventoryEntry(entry);
      normalized_entries.push(normalized);
      by_area[normalized.area] = (by_area[normalized.area] || 0) + 1;
      if (Number.isFinite(normalized.size)) total_size += normalized.size;


    } catch (error) {
      invalid_entries.push({
        path: entry?.relative_path || entry?.path || null,
        error: error.message,
      });
    }
  }

  return {
    total_artifacts: normalized_entries.length,
    total_size,
    by_area,
    permission_warnings,
    invalid_entries,
  };
}

export function summarizeMetadataRecords(records) {
  if (!Array.isArray(records)) {
    throw new Error('records must be array');
  }

  const by_operation = {};
  const by_schema_version = {};
  const invalid_records = [];

  for (const [index, record] of records.entries()) {
    if (!isObject(record)) {
      invalid_records.push({ index, error: 'metadata record must be object' });
      continue;
    }

    const schemaKey = String(record.schema_version ?? 'missing');
    by_schema_version[schemaKey] = (by_schema_version[schemaKey] || 0) + 1;

    if (typeof record.operation === 'string' && record.operation) {
      by_operation[record.operation] = (by_operation[record.operation] || 0) + 1;
    } else {
      invalid_records.push({ index, operation_id: record.operation_id || null, error: 'missing operation' });
    }
  }

  return {
    total_records: records.length,
    by_operation,
    by_schema_version,
    invalid_records,
  };
}

export function buildRemoteSiteRuntimeStatus({
  inventoryEntries,
  metadataRecords,
  logLines,
  generatedAt = new Date().toISOString(),
} = {}) {
  const inventory = summarizeRuntimeInventory(inventoryEntries || []);
  const metadata = summarizeMetadataRecords(metadataRecords || []);
  const logs = summarizeOpsLogLines(logLines || []);
  const policy = evaluateOpsPolicy(inventoryEntries || []);

  const warnings = [...policy.warnings];

  if (metadata.invalid_records.length) {
    warnings.push({ code: 'invalid_metadata_records', count: metadata.invalid_records.length });
  }

  if (logs.invalid_lines.length) {
    warnings.push({ code: 'invalid_log_lines', count: logs.invalid_lines.length });
  }

  return {
    status: warnings.length ? policy.status : 'healthy',
    generated_at: generatedAt,
    inventory: {
      total_artifacts: inventory.total_artifacts,
      total_size: inventory.total_size,
      by_area: inventory.by_area,
      permission_warnings: inventory.permission_warnings,
      invalid_entries: inventory.invalid_entries,
    },
    metadata,
    logs,
    warnings,
  };
}
