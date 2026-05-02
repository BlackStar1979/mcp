import fs from "fs/promises";
import path from "path";

const BASE = path.resolve("C:\\Work");
const POLICY_LEDGER_PATH = path.join(BASE, ".mcp_audit", "policy_decisions.jsonl");

export async function appendPolicyDecision(record) {
  await fs.mkdir(path.dirname(POLICY_LEDGER_PATH), { recursive: true });
  const entry = {
    timestamp: new Date().toISOString(),
    ...record,
  };
  await fs.appendFile(POLICY_LEDGER_PATH, JSON.stringify(entry) + "\n", "utf8");
  return entry;
}

export async function readPolicyDecisions({ limit = 500 } = {}) {
  try {
    const raw = await fs.readFile(POLICY_LEDGER_PATH, "utf8");
    const rows = raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    return rows.slice(Math.max(0, rows.length - limit));
  } catch (err) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

export async function policyStats({ limit = 1000 } = {}) {
  const rows = await readPolicyDecisions({ limit });
  const byDecision = {};
  const byOperation = {};
  const highRisk = [];

  for (const row of rows) {
    const decision = row.policy?.decision || row.decision || "unknown";
    const operation = row.operation || "unknown";
    byDecision[decision] = (byDecision[decision] || 0) + 1;
    byOperation[operation] = (byOperation[operation] || 0) + 1;
    const risk = Number(row.policy?.risk_score ?? row.risk_score ?? 0);
    if (risk >= 60) highRisk.push({ timestamp: row.timestamp, operation, target: row.target, risk_score: risk, decision });
  }

  return {
    total: rows.length,
    by_decision: byDecision,
    by_operation: byOperation,
    high_risk_count: highRisk.length,
    recent_high_risk: highRisk.slice(-20),
  };
}
