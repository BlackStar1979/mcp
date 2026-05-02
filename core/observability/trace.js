import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const BASE = path.resolve("C:\\Work");
const TRACE_DIR = path.join(BASE, ".mcp_audit", "traces");

function now() {
  return new Date().toISOString();
}

export function newTraceId(prefix = "trace") {
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${id}`;
}

function safeTraceId(traceId) {
  const id = String(traceId || "");
  if (!/^[A-Za-z0-9_.-]{8,160}$/.test(id)) throw new Error("invalid trace_id");
  return id;
}

function tracePath(traceId) {
  return path.join(TRACE_DIR, `${safeTraceId(traceId)}.jsonl`);
}

export async function appendTraceStep(traceId, phase, data = {}) {
  if (!traceId) throw new Error("trace_id required");
  if (!phase || typeof phase !== "string") throw new Error("trace phase required");

  await fs.mkdir(TRACE_DIR, { recursive: true });
  const entry = {
    ts: now(),
    trace_id: safeTraceId(traceId),
    phase,
    data,
  };
  await fs.appendFile(tracePath(traceId), JSON.stringify(entry) + "\n", "utf8");
  return entry;
}

export async function createTrace({ traceId = null, type = "tool_call", source = "system", data = {} } = {}) {
  const id = traceId || newTraceId(type);
  await appendTraceStep(id, "trace_start", { type, source, ...data });
  return id;
}

export async function linkOperation(traceId, refs = {}) {
  return appendTraceStep(traceId, "trace_link", refs);
}

export async function finalizeTrace(traceId, status, data = {}) {
  if (!status) throw new Error("trace final status required");
  return appendTraceStep(traceId, "trace_final", { status, ...data });
}

export async function readTrace(traceId) {
  const raw = await fs.readFile(tracePath(traceId), "utf8");
  return raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
