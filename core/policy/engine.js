const CORE_PATH_PATTERNS = [
  /(^|\/)core(\/|$)/,
  /(^|\/)engine(\/|$)/,
  /server_tools\.js$/,
  /code_tools\.js$/,
  /paths\.js$/,
  /config\.js$/,
];

const HIGH_RISK_INTENTS = new Set(["change_api", "change_behavior", "remove", "rename"]);

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/");
}

function isCorePath(value) {
  const p = normalizePath(value);
  return CORE_PATH_PATTERNS.some((rx) => rx.test(p));
}

function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function decisionForScore(score) {
  if (score > 80) return "deny";
  if (score >= 60) return "require_confirmation";
  if (score >= 30) return "allow_with_constraints";
  return "allow";
}

function constraintsForScore(score) {
  if (score >= 60) return { max_files: 100, max_depth: 3, require_single_target: true };
  if (score >= 30) return { max_files: 250, max_depth: 5 };
  return {};
}

export function evaluatePolicyRisk(input = {}) {
  const reasons = [];
  let score = 0;

  const operation = input.operation || "unknown";
  const target = normalizePath(input.target);
  const scope = normalizePath(input.scope);
  const intent = input.intent || "refactor";
  const deltaBytes = Number(input.delta_bytes || 0);
  const stepCount = Number(input.step_count || 1);
  const maxFiles = Number(input.max_files || 0);
  const maxDepth = Number(input.max_depth || 0);
  const hasDryRun = input.has_dry_run === true || input.dry_run === true || Boolean(input.commit_ref);

  if (["apply_patch", "code_apply_patch", "orchestrate_patch"].includes(operation)) {
    score += 20;
    reasons.push("state-changing operation");
  }

  if (isCorePath(target) || isCorePath(scope)) {
    score += 25;
    reasons.push("core/engine path");
  }

  if (HIGH_RISK_INTENTS.has(intent)) {
    score += 15;
    reasons.push(`high-risk intent: ${intent}`);
  }

  if (!hasDryRun && operation.includes("patch")) {
    score += 30;
    reasons.push("missing dry-run binding");
  }

  if (Math.abs(deltaBytes) > 10000) {
    score += 15;
    reasons.push("large patch delta");
  } else if (Math.abs(deltaBytes) > 3000) {
    score += 8;
    reasons.push("medium patch delta");
  }

  if (stepCount > 1) {
    score += Math.min(25, stepCount * 5);
    reasons.push(`multi-step plan: ${stepCount}`);
  }

  if (maxFiles > 500) {
    score += 15;
    reasons.push("large file scan budget");
  }

  if (maxDepth > 10) {
    score += 10;
    reasons.push("large dependency depth");
  }

  const riskScore = clampScore(score);
  const decision = decisionForScore(riskScore);

  return {
    decision,
    risk_score: riskScore,
    reasons,
    constraints: constraintsForScore(riskScore),
  };
}

export function applyRiskAdjustment(policy, adjustment = {}) {
  if (!policy || typeof policy !== "object") throw new Error("policy result required");
  const delta = Number(adjustment.risk_delta || 0);
  if (!Number.isFinite(delta) || delta === 0) return policy;
  const riskScore = Math.max(0, Math.min(100, Math.round((policy.risk_score || 0) + delta)));
  const decision = riskScore > 80 ? "deny" : riskScore >= 60 ? "require_confirmation" : riskScore >= 30 ? "allow_with_constraints" : "allow";
  return {
    ...policy,
    risk_score: riskScore,
    decision,
    feedback_adjustment: adjustment,
  };
}

export function enforcePolicyDecision(policy, context = {}) {
  if (!policy || typeof policy !== "object") throw new Error("policy result required");
  if (policy.decision === "deny") {
    const err = new Error("policy_denied");
    err.policy = policy;
    throw err;
  }

  if (policy.decision === "require_confirmation" && context.confirm !== true) {
    const err = new Error("policy_confirmation_required");
    err.policy = policy;
    throw err;
  }

  return policy;
}

export function applyPolicyConstraints(args = {}, policy = {}) {
  const constraints = policy.constraints || {};
  const next = { ...args };

  if (constraints.max_files !== undefined && Number.isFinite(Number(next.maxFiles))) {
    next.maxFiles = Math.min(Number(next.maxFiles), constraints.max_files);
  }
  if (constraints.max_depth !== undefined && Number.isFinite(Number(next.maxDepth))) {
    next.maxDepth = Math.min(Number(next.maxDepth), constraints.max_depth);
  }

  return next;
}
