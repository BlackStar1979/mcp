import {
  buildReferencedArtifactSet,
} from './remote_site_retention_reference_scanner.js';

import {
  partitionInventoryEntries,
  summarizeInventory,
} from './remote_site_retention_inventory.js';

import {
  buildRetentionPreview,
} from './remote_site_retention_classifier.js';

import {
  normalizeRetentionPolicy,
} from './remote_site_retention_policy.js';

export function parseMetadataManifestText({ path, text }) {
  try {
    const parsed = JSON.parse(text);
    return {
      path,
      status: 'ok',
      record: parsed,
    };
  } catch (error) {
    return {
      path,
      status: 'invalid_json',
      error: error.message,
    };
  }
}

export function buildRetentionPreviewReport({
  inventoryEntries,
  metadataRecords = [],
  policy = undefined,
  now = new Date(),
}) {
  const normalizedPolicy = normalizeRetentionPolicy(policy || {});
  const inventory = partitionInventoryEntries(inventoryEntries);
  const inventorySummary = summarizeInventory(inventoryEntries);
  const referenceResult = buildReferencedArtifactSet(metadataRecords);

  const preview = buildRetentionPreview({
    artifacts: inventory.artifacts,
    referencedArtifacts: referenceResult.referenced_artifacts,
    policy: normalizedPolicy,
    now,
  });

  return {
    mode: 'preview',
    generated_at: (now instanceof Date ? now : new Date(now)).toISOString(),
    policy: normalizedPolicy,
    inventory_summary: inventorySummary,
    referenced_artifacts_count: referenceResult.referenced_artifacts.length,
    invalid_metadata_records: referenceResult.invalid_records,
    invalid_inventory_entries: inventory.invalid_entries,
    purge_count: preview.purge_count,
    summary: preview.summary,
    purge_candidates: preview.purge_candidates,
    classifications: preview.classifications,
  };
}

export function assertPreviewReportSafe(report) {
  if (!report || typeof report !== 'object') {
    throw new Error('preview report must be object');
  }

  if (report.mode !== 'preview') {
    throw new Error('preview report mode must be preview');
  }

  if (!Array.isArray(report.purge_candidates)) {
    throw new Error('preview report missing purge_candidates');
  }

  for (const candidate of report.purge_candidates) {
    if (candidate.area === 'meta') {
      throw new Error('preview report attempts to purge protected meta artifact');
    }
    if (candidate.classification !== 'purge_candidate') {
      throw new Error('preview report contains non-purge candidate in purge list');
    }
    if (!candidate.purge_candidate) {
      throw new Error('preview report candidate missing purge_candidate flag');
    }
  }

  return report;
}
