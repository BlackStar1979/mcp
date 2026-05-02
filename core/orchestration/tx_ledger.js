import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const BASE = path.resolve("C:\\Work");
const TX_LEDGER_REL = ".mcp_audit/transactions.jsonl";
const TX_LEDGER_PATH = path.join(BASE, TX_LEDGER_REL);

export function newTransactionId(planId) {
  const suffix = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${planId}-${suffix}`;
}

export async function appendTransactionState(record) {
  await fs.mkdir(path.dirname(TX_LEDGER_PATH), { recursive: true });
  const entry = {
    timestamp: new Date().toISOString(),
    ...record,
  };
  await fs.appendFile(TX_LEDGER_PATH, JSON.stringify(entry) + "\n", "utf8");
  return entry;
}

export async function readTransactionLedger() {
  try {
    const raw = await fs.readFile(TX_LEDGER_PATH, "utf8");
    return raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (err) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

export async function latestTransactionsById() {
  const rows = await readTransactionLedger();
  const latest = new Map();
  for (const row of rows) {
    if (!row.transaction_id) continue;
    latest.set(row.transaction_id, row);
  }
  return latest;
}

export async function loadActiveTransactions() {
  const latest = await latestTransactionsById();
  const activeStatuses = new Set(["dry_running", "committing", "rolling_back"]);
  return [...latest.values()].filter((tx) => activeStatuses.has(tx.status));
}

export function makeInitialTransaction({ transactionId, plan, dag }) {
  return {
    transaction_id: transactionId,
    plan_id: plan.plan_id,
    mode: plan.mode,
    status: "dry_running",
    execution_order: dag.execution_order,
    steps: plan.steps.map((step) => ({
      step_id: step.step_id,
      tool: step.tool,
      operation: step.operation,
      operation_id: null,
      status: "pending",
    })),
  };
}

export function updateStep(tx, stepId, patch) {
  return {
    ...tx,
    steps: tx.steps.map((step) => step.step_id === stepId ? { ...step, ...patch } : step),
  };
}
