export const REMOTE_SITE_RETENTION_POLICY_VERSION = 1;

export const RETENTION_AREAS = Object.freeze(["logs", "edits", "trash", "meta"]);

export const RETENTION_CLASSIFICATIONS = Object.freeze([
  "referenced",
  "unreferenced",
  "expired",
  "protected",
  "unknown",
  "invalid",
  "purge_candidate",
]);

export const DEFAULT_REMOTE_SITE_RETENTION_POLICY = Object.freeze({
  schema_version: REMOTE_SITE_RETENTION_POLICY_VERSION,
  areas: Object.freeze({
    logs: Object.freeze({ retention_days: 30, protected: false }),
    edits: Object.freeze({ retention_days: 30, protected: false }),
    trash: Object.freeze({ retention_days: 14, protected: false }),
    meta: Object.freeze({ retention_days: 180, protected: true }),
  }),
  execute_requires_preview: true,
  bounded_to_ops_root: true,
  protect_referenced_artifacts: true,
});

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}

export function cloneDefaultRetentionPolicy() {
  return JSON.parse(JSON.stringify(DEFAULT_REMOTE_SITE_RETENTION_POLICY));
}

export function normalizeRetentionPolicy(input = {}) {
  const base = cloneDefaultRetentionPolicy();
  const policy = {
    ...base,
    ...input,
    areas: {
      ...base.areas,
      ...(input.areas || {}),
    },
  };

  for (const area of RETENTION_AREAS) {
    policy.areas[area] = {
      ...base.areas[area],
      ...(input.areas?.[area] || {}),
    };
  }

  return validateRetentionPolicy(policy);
}

export function validateRetentionPolicy(policy) {
  if (!policy || typeof policy !== "object") {
    throw new Error("retention policy must be an object");
  }

  if (policy.schema_version !== REMOTE_SITE_RETENTION_POLICY_VERSION) {
    throw new Error("unsupported retention policy schema_version");
  }

  if (!policy.areas || typeof policy.areas !== "object") {
    throw new Error("retention policy missing areas");
  }

  for (const area of RETENTION_AREAS) {
    const areaPolicy = policy.areas[area];
    if (!areaPolicy || typeof areaPolicy !== "object") {
      throw new Error(`retention policy missing area: ${area}`);
    }
    assertPositiveInteger(areaPolicy.retention_days, `${area}.retention_days`);
    if (typeof areaPolicy.protected !== "boolean") {
      throw new Error(`${area}.protected must be boolean`);
    }
  }

  if (policy.execute_requires_preview !== true) {
    throw new Error("execute_requires_preview must be true");
  }

  if (policy.bounded_to_ops_root !== true) {
    throw new Error("bounded_to_ops_root must be true");
  }

  if (policy.protect_referenced_artifacts !== true) {
    throw new Error("protect_referenced_artifacts must be true");
  }

  return policy;
}

export function retentionCutoffDate({ now = new Date(), retentionDays }) {
  assertPositiveInteger(retentionDays, "retentionDays");
  const nowDate = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(nowDate.getTime())) {
    throw new Error("now must be a valid date");
  }
  return new Date(nowDate.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

export function isOlderThanRetention({ timestamp, now = new Date(), retentionDays }) {
  const tsDate = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(tsDate.getTime())) {
    throw new Error("timestamp must be a valid date");
  }
  return tsDate < retentionCutoffDate({ now, retentionDays });
}
