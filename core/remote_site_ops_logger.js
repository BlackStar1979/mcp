import posixPath from "path/posix";

import {
  REMOTE_SITE_SCHEMA_VERSION,
  generateCorrelationId,
  generateOperationId,
} from "./remote_site_ops_metadata.js";

const MAX_DETAIL_STRING = 4000;
const MAX_OBJECT_KEYS = 100;
const MAX_ARRAY_ITEMS = 100;

export const REMOTE_SITE_OPS_DIRS = ["trash", "edits", "logs", "meta"];

function nowIso() {
  return new Date().toISOString();
}

function safeString(value) {
  const text = String(value ?? "");
  if (text.length <= MAX_DETAIL_STRING) return text;
  return `${text.slice(0, MAX_DETAIL_STRING)}…[truncated:${text.length - MAX_DETAIL_STRING}]`;
}

function safeValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return safeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    const out = value.slice(0, MAX_ARRAY_ITEMS).map((item) => safeValue(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) out.push({ truncated_items: value.length - MAX_ARRAY_ITEMS });
    return out;
  }
  if (typeof value === "object") {
    if (depth >= 5) return { type: "object", truncated_depth: true };
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
  return safeString(value);
}

export function normalizeOpsEvent(event = {}) {
  const operation = event.operation || event.action;
  if (!operation) throw new Error("ops log event requires operation");

  return {
    schema_version: event.schema_version || REMOTE_SITE_SCHEMA_VERSION,
    ts: event.ts || nowIso(),
    operation_id: event.operation_id || generateOperationId(),
    correlation_id: event.correlation_id || generateCorrelationId(),
    operation: String(operation),
    actor: event.actor || "gpt-mcp",
    remote_path: event.remote_path ?? null,
    result: event.result || "success",
    artifact: event.artifact ?? event.trash_path ?? event.diff ?? null,
    details: safeValue(event.details || {}),
  };
}

export function remoteOpsLogPath(opsRoot) {
  return posixPath.join(opsRoot, "logs", "site-files.log");
}

export async function ensureRemoteDir(client, remoteDir) {
  await client.mkdir(remoteDir, true);
}

export async function ensureRemoteSiteOpsDirs(client, configOrOpsRoot) {
  const opsRoot = resolveOpsRoot(configOrOpsRoot);
  for (const dir of REMOTE_SITE_OPS_DIRS) {
    await ensureRemoteDir(client, posixPath.join(opsRoot, dir));
  }
  return {
    status: "ok",
    opsRoot,
    dirs: REMOTE_SITE_OPS_DIRS.map((dir) => posixPath.join(opsRoot, dir)),
  };
}

export function resolveOpsRoot(configOrOpsRoot) {
  if (typeof configOrOpsRoot === "string") return configOrOpsRoot;
  if (configOrOpsRoot && typeof configOrOpsRoot === "object") {
    if (typeof configOrOpsRoot.opsRoot === "string") return configOrOpsRoot.opsRoot;
  }
  throw new Error("unable to resolve remote ops root");
}

export async function appendRemoteSiteOpsLog(client, configOrOpsRoot, event) {
  const opsRoot = resolveOpsRoot(configOrOpsRoot);
  await ensureRemoteSiteOpsDirs(client, opsRoot);
  const entry = normalizeOpsEvent(event);
  const row = JSON.stringify(entry) + "\n";
  const logFile = remoteOpsLogPath(opsRoot);
  await client.append(Buffer.from(row, "utf8"), logFile);
  return {
    status: "logged",
    log_file: logFile,
    entry,
  };
}
