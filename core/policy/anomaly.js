import { readPolicyDecisions } from "./memory.js";
import { getPolicyBaseline, lookupBaseline } from "./baseline.js";

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/");
}

function riskOf(row) {
  return Number(row.policy?.risk_score ?? row.risk_score ?? 0);
}

function targetOf(row) {
  return normalizePath(row.target || row.scope || ".");
}

function recentWindow(rows, ms) {
  const cutoff = Date.now() - ms;
  return rows.filter((row) => Number.isFinite(Date.parse(row.timestamp)) && Date.parse(row.timestamp) >= cutoff);
}

function severityFor(flags) {
  const names = new Set(flags.map((f) => f.flag));
  if (names.has("adaptive_risk_spike") && names.has("high_risk_sequence")) return "high";
  if (names.has("risk_spike") && names.has("high_risk_sequence")) return "high";
  if (names.has("burst_activity") || flags.length >= 2) return "medium";
  if (flags.length >= 1) return "low";
  return "none";
}

export async function detectAnomaly(current = {}, { historyLimit = 1000 } = {}) {
  const history = await readPolicyDecisions({ limit: historyLimit });
  const baseline = await getPolicyBaseline({ limit: historyLimit });
  const bucket = lookupBaseline(baseline, current);

  const currentRisk = Number(current.risk_score ?? current.policy?.risk_score ?? 0);
  const currentTarget = normalizePath(current.target || current.scope || ".");
  const flags = [];

  const last50 = history.slice(-50);
  const avgRisk = last50.length ? last50.reduce((sum, row) => sum + riskOf(row), 0) / last50.length : 0;

  if (last50.length >= 10 && currentRisk > avgRisk + 30) {
    flags.push({ flag: "risk_spike", detail: { current_risk: currentRisk, avg_last_50: avgRisk } });
  }

  if (bucket && bucket.count >= 10 && currentRisk > bucket.p95_risk + 15) {
    flags.push({ flag: "adaptive_risk_spike", detail: { current_risk: currentRisk, p95_risk: bucket.p95_risk } });
  }

  const seenTargets = new Set(history.slice(-200).map(targetOf));
  if (history.length >= 25 && !seenTargets.has(currentTarget)) {
    flags.push({ flag: "new_target_zone", detail: { target: currentTarget } });
  }

  if (bucket && bucket.count >= 10) {
    const prefixes = new Set(bucket.top_target_prefixes.map((item) => item.prefix));
    const prefix = currentTarget.split("/").filter(Boolean).slice(0, 3).join("/") || ".";
    if (!prefixes.has(prefix)) flags.push({ flag: "target_deviation", detail: { prefix } });
  }

  const recentMinute = recentWindow(history, 60_000);
  if (recentMinute.length > 10) flags.push({ flag: "burst_activity", detail: { count_last_60s: recentMinute.length } });

  const recentHigh = history.slice(-2).filter((row) => riskOf(row) >= 60).length;
  if (recentHigh >= 2 && currentRisk >= 60) flags.push({ flag: "high_risk_sequence", detail: { recent_high_plus_current: recentHigh + 1 } });

  const severity = severityFor(flags);

  return {
    anomaly: flags.length > 0,
    severity,
    flags,
    baseline: bucket,
  };
}

export function applyAnomalyOverride(policy, anomaly) {
  if (!anomaly?.anomaly) return policy;
  if (anomaly.severity === "high") return { ...policy, decision: "deny", anomaly_override: anomaly };
  if (anomaly.severity === "medium" && policy.decision === "allow") return { ...policy, decision: "require_confirmation", anomaly_override: anomaly };
  if (anomaly.severity === "medium" && policy.decision === "allow_with_constraints") return { ...policy, decision: "require_confirmation", anomaly_override: anomaly };
  return { ...policy, anomaly_override: anomaly };
}
