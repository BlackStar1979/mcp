import fs from "fs/promises";
import path from "path";
import { PERF_LOG_FILE, PERF_SLOW_MS, RUNTIME_DIR } from "./config.js";

const PERF_FLAG_FILE = path.join(RUNTIME_DIR, ".mcp_perf_on");

function nowNs() {
  return process.hrtime.bigint();
}

function nsToMs(ns) {
  return Number(ns) / 1e6;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function isTimingEnabled() {
  const env = String(process.env.MCP_DEBUG_TIMING || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(env)) return true;
  return fileExists(PERF_FLAG_FILE);
}

function redactSecret(value) {
  const text = String(value || "");
  if (!text) return text;
  return text
    .replace(/([?&]token=)[^&#\s]+/gi, "$1[REDACTED]")
    .replace(/(Authorization:\s*Bearer\s+)[A-Za-z0-9._~+\-/]+=*/gi, "$1[REDACTED]");
}

function sanitizeMeta(meta = {}) {
  const out = { ...meta };
  if (out.url !== undefined) out.url = redactSecret(out.url);
  if (out.href !== undefined) out.href = redactSecret(out.href);
  if (out.authorization !== undefined) out.authorization = "[REDACTED]";
  if (out.Authorization !== undefined) out.Authorization = "[REDACTED]";
  return out;
}

function summarizeArgs(args) {
  try {
    if (!args) return null;
    const out = {};
    for (const k of Object.keys(args)) {
      const v = args[k];
      if (/token|secret|authorization|password/i.test(k)) {
        out[k] = "[REDACTED]";
      } else if (typeof v === "string") {
        out[k] = redactSecret(v.length > 200 ? v.slice(0, 200) + "…" : v);
      } else if (Array.isArray(v)) {
        out[k] = { type: "array", length: v.length };
      } else if (v && typeof v === "object") {
        out[k] = { type: "object", keys: Object.keys(v).slice(0, 20) };
      } else {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return null;
  }
}

export async function logPerf(entry) {
  if (!(await isTimingEnabled())) return;
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      pid: process.pid,
      ...entry,
    }) + "\n";
    await fs.appendFile(PERF_LOG_FILE, line, "utf8");
  } catch {}
}

export async function timeTool(name, args, fn) {
  if (!(await isTimingEnabled())) return fn();

  const t0 = nowNs();
  let ok = true;
  let error = null;
  try {
    return await fn();
  } catch (e) {
    ok = false;
    error = e?.message || String(e);
    throw e;
  } finally {
    const ms = nsToMs(nowNs() - t0);
    await logPerf({
      type: "tool",
      name,
      ms,
      slow: ms >= PERF_SLOW_MS,
      ok,
      error,
      args: summarizeArgs(args),
    });
  }
}

export async function timeRequest(meta, fn) {
  if (!(await isTimingEnabled())) return fn();

  const t0 = nowNs();
  let ok = true;
  let error = null;
  try {
    return await fn();
  } catch (e) {
    ok = false;
    error = e?.message || String(e);
    throw e;
  } finally {
    const ms = nsToMs(nowNs() - t0);
    await logPerf({
      type: "request",
      ...sanitizeMeta(meta),
      ms,
      slow: ms >= PERF_SLOW_MS,
      ok,
      error,
    });
  }
}

export async function perfStatus() {
  return {
    enabled: await isTimingEnabled(),
    env: String(process.env.MCP_DEBUG_TIMING || ""),
    flag_file: PERF_FLAG_FILE,
    log_file: PERF_LOG_FILE,
    slow_ms: PERF_SLOW_MS,
    pid: process.pid,
  };
}
