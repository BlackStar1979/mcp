import path from 'node:path';

export const REMOTE_SITE_METADATA_SCHEMA_VERSION = 1;

export function normalizeRelativeOpsPath(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('relative ops path must be non-empty string');
  }

  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '');

  if (
    normalized.includes('..') ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error('invalid relative ops path');
  }

  return normalized;
}

export function isMetadataManifestCandidate(filename) {
  return typeof filename === 'string' && filename.endsWith('.json');
}

export function validateMetadataManifest(record) {
  if (!record || typeof record !== 'object') {
    throw new Error('metadata manifest must be object');
  }

  if (record.schema_version !== REMOTE_SITE_METADATA_SCHEMA_VERSION) {
    throw new Error('unsupported metadata schema_version');
  }

  if (typeof record.operation !== 'string' || !record.operation) {
    throw new Error('metadata manifest missing operation');
  }

  if (typeof record.operation_id !== 'string' || !record.operation_id) {
    throw new Error('metadata manifest missing operation_id');
  }

  return record;
}

export function extractArtifactReferences(record) {
  validateMetadataManifest(record);

  const refs = new Set();

  const maybeAdd = (value) => {
    if (typeof value === 'string' && value.trim()) {
      refs.add(normalizeRelativeOpsPath(value));
    }
  };

  maybeAdd(record.artifact);
  maybeAdd(record.diff_artifact);
  maybeAdd(record.trash_artifact);
  maybeAdd(record.backup_artifact);

  if (Array.isArray(record.artifacts)) {
    for (const item of record.artifacts) {
      maybeAdd(item);
    }
  }

  return Array.from(refs).sort();
}

export function buildReferencedArtifactSet(records) {
  if (!Array.isArray(records)) {
    throw new Error('records must be array');
  }

  const referenced = new Set();
  const invalid_records = [];

  for (const record of records) {
    try {
      for (const ref of extractArtifactReferences(record)) {
        referenced.add(ref);
      }
    } catch (error) {
      invalid_records.push({
        operation_id: record?.operation_id || null,
        error: error.message,
      });
    }
  }

  return {
    referenced_artifacts: Array.from(referenced).sort(),
    invalid_records,
  };
}

export function classifyArtifactReference({
  artifactPath,
  referencedSet,
}) {
  const normalized = normalizeRelativeOpsPath(artifactPath);

  if (!(referencedSet instanceof Set)) {
    throw new Error('referencedSet must be Set');
  }

  return referencedSet.has(normalized)
    ? 'referenced'
    : 'unreferenced';
}
