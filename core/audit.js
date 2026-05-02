import fs from "fs/promises";
import os from "os";
import { LOG_FILE } from "./config.js";

const MAX_STRING = 8000;
const MAX_ARRAY = 200;
const MAX_OBJECT_KEYS = 200;

function safeString(value) {
  if (value.length <= MAX_STRING) return value;
  return `${value.slice(0, MAX_STRING)}…[truncated:${value.length - MAX_STRING}]`;
}

export function serializeError(error) {
  if (!error) return null;
  return {
    name: error.name || "Error",
    message: error.message || String(error),
    code: error.code,
    stack: error.stack ? safeString(error.stack) : undefined,
  };
}

function safeValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return safeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) return serializeError(value);
  if (Array.isArray(value)) {
    const out = value.slice(0, MAX_ARRAY).map((item) => safeValue(item, depth + 1));
    if (value.length > MAX_ARRAY) out.push({ truncated_items: value.length - MAX_ARRAY });
    return out;
  }
  if (typeof value === "object") {
    if (depth >= 6) return { type: "object", truncated_depth: true };
    const out = {};
    const keys = Object.keys(value);
    for (const [index, key] of keys.entries()) {
      if (index >= MAX_OBJECT_KEYS) {
        out.truncated_keys = keys.length - MAX_OBJECT_KEYS;
        break;
      }
      out[key] = safeValue(value[key], depth + 1);
    }
    return out;
  }
  return String(value);
}

export function makeAuditEntry(action, details = {}) {
  const level = details.level || details.severity || "info";
  const source = details.source || "mcp";
  const event = details.event || action;
  const safeDetails = safeValue({ ...details });
  delete safeDetails.level;
  delete safeDetails.severity;
  delete safeDetails.source;
  delete safeDetails.event;

  return {
    ts: new Date().toISOString(),
    level,
    source,
    event,
    action,
    pid: process.pid,
    host: os.hostname(),
    ...safeDetails,
  };
}

export async function appendAuditEntry(entry) {
  await fs.appendFile(LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
  return entry;
}

export async function audit(action, details = {}) {
  return appendAuditEntry(makeAuditEntry(action, details));
}

export async function debugLog(action, details = {}) {
  return audit(action, { ...details, level: "debug", source: details.source || "debug" });
}

export async function auditError(action, error, details = {}) {
  return audit(action, {
    ...details,
    level: "error",
    error: serializeError(error),
  });
}

export async function readAuditEntries({ limit = 200 } = {}) {
  try {
    const raw = await fs.readFile(LOG_FILE, "utf8");
    const rows = raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    return rows.slice(Math.max(0, rows.length - limit));
  } catch (err) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

export async function auditStatus({ limit = 500 } = {}) {
  const rows = await readAuditEntries({ limit });
  const byLevel = {};
  const bySource = {};
  const byEvent = {};

  for (const row of rows) {
    const level = row.level || "unknown";
    const source = row.source || "unknown";
    const event = row.event || row.action || "unknown";
    byLevel[level] = (byLevel[level] || 0) + 1;
    bySource[source] = (bySource[source] || 0) + 1;
    byEvent[event] = (byEvent[event] || 0) + 1;
  }

  return {
    status: "ok",
    log_file: LOG_FILE,
    sampled: rows.length,
    by_level: byLevel,
    by_source: bySource,
    by_event: byEvent,
    recent: rows.slice(-20),
  };
}
