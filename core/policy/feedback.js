import fs from "fs/promises";
import path from "path";

const BASE = path.resolve("C:\\Work");
const FEEDBACK_LEDGER_PATH = path.join(BASE, ".mcp_audit", "policy_feedback.jsonl");

const VALID_FEEDBACK = new Set(["approve", "reject", "false_positive", "false_negative", "tighten", "loosen"]);

function assertSafeString(value, label, max = 512) {
  if (typeof value !== "string" || value.length < 1 || value.length > max) throw new Error(`${label}: invalid string`);
}

export async function appendPolicyFeedback(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("feedback record must be object");
  assertSafeString(record.feedback, "feedback", 64);
  if (!VALID_FEEDBACK.has(record.feedback)) throw new Error("unsupported feedback: " + record.feedback);
  if (record.trace_id !== undefined && record.trace_id !== null) assertSafeString(record.trace_id, "trace_id", 180);
  if (record.operation_id !== undefined && record.operation_id !== null) assertSafeString(record.operation_id, "operation_id", 180);
  if (record.plan_id !== undefined && record.plan_id !== null) assertSafeString(record.plan_id, "plan_id", 180);

  await fs.mkdir(path.dirname(FEEDBACK_LEDGER_PATH), { recursive: true });
  const entry = {
    timestamp: new Date().toISOString(),
    source: "human_or_control_plane",
    ...record,
  };
  await fs.appendFile(FEEDBACK_LEDGER_PATH, JSON.stringify(entry) + "\n", "utf8");
  return entry;
}

export async function readPolicyFeedback({ limit = 500 } = {}) {
  try {
    const raw = await fs.readFile(FEEDBACK_LEDGER_PATH, "utf8");
    const rows = raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    return rows.slice(Math.max(0, rows.length - limit));
  } catch (err) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

export async function feedbackStats({ limit = 1000 } = {}) {
  const rows = await readPolicyFeedback({ limit });
  const byFeedback = {};
  const byOperation = {};
  for (const row of rows) {
    byFeedback[row.feedback] = (byFeedback[row.feedback] || 0) + 1;
    const op = row.operation || "unknown";
    byOperation[op] = (byOperation[op] || 0) + 1;
  }
  return {
    total: rows.length,
    by_feedback: byFeedback,
    by_operation: byOperation,
    recent: rows.slice(-20),
  };
}

export async function feedbackAdjustment(context = {}) {
  const rows = await readPolicyFeedback({ limit: 1000 });
  const op = context.operation || "unknown";
  const relevant = rows.filter((row) => !row.operation || row.operation === op);
  let riskDelta = 0;
  const reasons = [];

  const recent = relevant.slice(-50);
  const falsePositive = recent.filter((row) => row.feedback === "false_positive" || row.feedback === "loosen").length;
  const falseNegative = recent.filter((row) => row.feedback === "false_negative" || row.feedback === "tighten").length;

  if (falsePositive >= 3 && falsePositive > falseNegative) {
    riskDelta -= Math.min(10, falsePositive * 2);
    reasons.push("recent false positives / loosen feedback");
  }

  if (falseNegative >= 2 && falseNegative >= falsePositive) {
    riskDelta += Math.min(20, falseNegative * 5);
    reasons.push("recent false negatives / tighten feedback");
  }

  return {
    risk_delta: riskDelta,
    reasons,
    sample_size: recent.length,
  };
}
