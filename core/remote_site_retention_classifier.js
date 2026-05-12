import path from 'node:path';

import {
  normalizeRetentionPolicy,
  isOlderThanRetention,
} from './remote_site_retention_policy.js';

import {
  normalizeRelativeOpsPath,
} from './remote_site_retention_reference_scanner.js';

export function inferRetentionArea(relativePath) {
  const normalized = normalizeRelativeOpsPath(relativePath);
  const [area] = normalized.split('/');

  if (!['logs', 'edits', 'trash', 'meta'].includes(area)) {
    return 'unknown';
  }

  return area;
}

export function normalizeArtifactRecord(record) {
  if (!record || typeof record !== 'object') {
    throw new Error('artifact record must be object');
  }

  const relative_path = normalizeRelativeOpsPath(record.relative_path || record.path);
  const area = record.area || inferRetentionArea(relative_path);

  const modified_at = record.modified_at || record.mtime || record.modifyTime;
  if (!modified_at) {
    throw new Error('artifact record missing modified_at');
  }

  const modifiedDate = modified_at instanceof Date ? modified_at : new Date(modified_at);
  if (Number.isNaN(modifiedDate.getTime())) {
    throw new Error('artifact record modified_at must be valid date');
  }

  return {
    relative_path,
    area,
    modified_at: modifiedDate.toISOString(),
    size: Number.isFinite(record.size) ? record.size : null,
  };
}

export function classifyRetentionArtifact({
  artifact,
  referencedSet = new Set(),
  policy = undefined,
  now = new Date(),
}) {
  const normalizedPolicy = normalizeRetentionPolicy(policy || {});
  const record = normalizeArtifactRecord(artifact);

  if (record.area === 'unknown') {
    return {
      ...record,
      classification: 'unknown',
      purge_candidate: false,
      reason: 'area_unknown',
    };
  }

  const areaPolicy = normalizedPolicy.areas[record.area];

  if (areaPolicy.protected) {
    return {
      ...record,
      classification: 'protected',
      purge_candidate: false,
      reason: 'area_protected',
    };
  }

  if (referencedSet.has(record.relative_path)) {
    return {
      ...record,
      classification: 'referenced',
      purge_candidate: false,
      reason: 'referenced_by_metadata',
    };
  }

  const expired = isOlderThanRetention({
    timestamp: record.modified_at,
    now,
    retentionDays: areaPolicy.retention_days,
  });

  if (!expired) {
    return {
      ...record,
      classification: 'unreferenced',
      purge_candidate: false,
      reason: 'within_retention_window',
    };
  }

  return {
    ...record,
    classification: 'purge_candidate',
    purge_candidate: true,
    reason: 'expired_and_unreferenced',
  };
}

export function classifyRetentionArtifacts({
  artifacts,
  referencedArtifacts = [],
  policy = undefined,
  now = new Date(),
}) {
  if (!Array.isArray(artifacts)) {
    throw new Error('artifacts must be array');
  }

  const referencedSet = referencedArtifacts instanceof Set
    ? referencedArtifacts
    : new Set(referencedArtifacts.map((item) => normalizeRelativeOpsPath(item)));

  const classifications = [];
  const invalid_artifacts = [];

  for (const artifact of artifacts) {
    try {
      classifications.push(classifyRetentionArtifact({
        artifact,
        referencedSet,
        policy,
        now,
      }));
    } catch (error) {
      invalid_artifacts.push({
        path: artifact?.relative_path || artifact?.path || null,
        error: error.message,
      });
    }
  }

  return {
    classifications,
    purge_candidates: classifications.filter((row) => row.purge_candidate),
    invalid_artifacts,
  };
}

export function buildRetentionPreview({
  artifacts,
  referencedArtifacts = [],
  policy = undefined,
  now = new Date(),
}) {
  const result = classifyRetentionArtifacts({
    artifacts,
    referencedArtifacts,
    policy,
    now,
  });

  const summary = result.classifications.reduce((acc, row) => {
    acc[row.classification] = (acc[row.classification] || 0) + 1;
    return acc;
  }, {});

  return {
    mode: 'preview',
    generated_at: (now instanceof Date ? now : new Date(now)).toISOString(),
    summary,
    purge_count: result.purge_candidates.length,
    purge_candidates: result.purge_candidates,
    classifications: result.classifications,
    invalid_artifacts: result.invalid_artifacts,
  };
}
