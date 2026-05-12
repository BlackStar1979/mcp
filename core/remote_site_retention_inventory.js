import path from 'node:path';

import {
  isMetadataManifestCandidate,
  normalizeRelativeOpsPath,
} from './remote_site_retention_reference_scanner.js';

export const OPS_INVENTORY_AREAS = Object.freeze(['logs', 'edits', 'trash', 'meta']);

export function isSupportedOpsArea(area) {
  return OPS_INVENTORY_AREAS.includes(area);
}

export function inferOpsAreaFromPath(relativePath) {
  const normalized = normalizeRelativeOpsPath(relativePath);
  const [area] = normalized.split('/');
  return isSupportedOpsArea(area) ? area : 'unknown';
}

export function normalizeInventoryEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('inventory entry must be object');
  }

  const relative_path = normalizeRelativeOpsPath(entry.relative_path || entry.path);
  const area = entry.area || inferOpsAreaFromPath(relative_path);
  const modified_at = entry.modified_at || entry.mtime || entry.modifyTime;

  if (!modified_at) {
    throw new Error('inventory entry missing modified_at');
  }

  const modifiedDate = modified_at instanceof Date ? modified_at : new Date(modified_at);
  if (Number.isNaN(modifiedDate.getTime())) {
    throw new Error('inventory entry modified_at must be valid date');
  }

  return {
    relative_path,
    area,
    basename: path.posix.basename(relative_path),
    modified_at: modifiedDate.toISOString(),
    size: Number.isFinite(entry.size) ? entry.size : null,
    type: entry.type || 'file',
  };
}

export function partitionInventoryEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new Error('entries must be array');
  }

  const artifacts = [];
  const metadata_candidates = [];
  const invalid_entries = [];

  for (const entry of entries) {
    try {
      const normalized = normalizeInventoryEntry(entry);

      if (normalized.area === 'meta' && isMetadataManifestCandidate(normalized.basename)) {
        metadata_candidates.push(normalized);
      }

      artifacts.push(normalized);
    } catch (error) {
      invalid_entries.push({
        path: entry?.relative_path || entry?.path || null,
        error: error.message,
      });
    }
  }

  return {
    artifacts,
    metadata_candidates,
    invalid_entries,
  };
}

export function summarizeInventory(entries) {
  const partitioned = partitionInventoryEntries(entries);
  const by_area = {};
  let total_size = 0;

  for (const artifact of partitioned.artifacts) {
    by_area[artifact.area] = (by_area[artifact.area] || 0) + 1;
    if (Number.isFinite(artifact.size)) total_size += artifact.size;
  }

  return {
    total_artifacts: partitioned.artifacts.length,
    metadata_candidates: partitioned.metadata_candidates.length,
    invalid_entries: partitioned.invalid_entries.length,
    total_size,
    by_area,
  };
}
