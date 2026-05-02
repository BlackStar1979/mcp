import { readPolicyDecisions } from "./memory.js";

const CACHE_TTL_MS = 60_000;
let cache = null;
let cacheTs = 0;

function nowMs() {
  return Date.now();
}

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/");
}

function targetPrefix(target) {
  const parts = normalizePath(target).split("/").filter(Boolean);
  if (parts.length <= 2) return parts.join("/") || ".";
  return parts.slice(0, 3).join("/");
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function bucketKey(row) {
  const operation = row.operation || "unknown";
  const prefix = targetPrefix(row.target || row.scope || ".");
  return `${operation}::${prefix}`;
}

function buildBucket(rows) {
  const risks = rows.map((r) => Number(r.policy?.risk_score ?? r.risk_score ?? 0)).filter(Number.isFinite);
  const deltas = rows.map((r) => Math.abs(Number(r.delta_bytes || 0))).filter(Number.isFinite);
  const targets = new Set(rows.map((r) => normalizePath(r.target || r.scope || ".")));
  const prefixes = new Map();
  for (const row of rows) {
    const prefix = targetPrefix(row.target || row.scope || ".");
    prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
  }

  const timestamps = rows.map((r) => Date.parse(r.timestamp)).filter(Number.isFinite).sort((a, b) => a - b);
  let frequencyPerMinute = 0;
  if (timestamps.length >= 2) {
    const spanMin = Math.max(1, (timestamps[timestamps.length - 1] - timestamps[0]) / 60_000);
    frequencyPerMinute = timestamps.length / spanMin;
  }

  return {
    count: rows.length,
    avg_risk: avg(risks),
    p95_risk: percentile(risks, 95),
    avg_delta_bytes: avg(deltas),
    unique_targets_ratio: rows.length ? targets.size / rows.length : 0,
    frequency_per_minute: frequencyPerMinute,
    top_target_prefixes: [...prefixes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([prefix, count]) => ({ prefix, count })),
  };
}

export async function buildPolicyBaseline({ limit = 1000 } = {}) {
  const rows = await readPolicyDecisions({ limit });
  const buckets = new Map();

  for (const row of rows) {
    const key = bucketKey(row);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }

  const result = {};
  for (const [key, items] of buckets.entries()) result[key] = buildBucket(items);

  return {
    generated_at: new Date().toISOString(),
    sample_size: rows.length,
    buckets: result,
  };
}

export async function getPolicyBaseline({ force = false, limit = 1000 } = {}) {
  const ts = nowMs();
  if (!force && cache && (ts - cacheTs) < CACHE_TTL_MS) return cache;
  cache = await buildPolicyBaseline({ limit });
  cacheTs = ts;
  return cache;
}

export function lookupBaseline(baseline, current = {}) {
  const key = `${current.operation || "unknown"}::${targetPrefix(current.target || current.scope || ".")}`;
  return baseline?.buckets?.[key] || null;
}
