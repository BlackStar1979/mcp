import { validateDag } from "./dag_validator.js";
import { evaluatePolicyRisk, enforcePolicyDecision } from "../policy/engine.js";
import { appendPolicyDecision } from "../policy/memory.js";
import { detectAnomaly, applyAnomalyOverride } from "../policy/anomaly.js";
import {
  appendTransactionState,
  makeInitialTransaction,
  newTransactionId,
  updateStep,
} from "./tx_ledger.js";

function makePatchInput(step, commitRef = null) {
  return {
    operation: "apply_patch",
    scope: step.input.scope,
    target: step.input.target,
    anchor: step.input.anchor,
    content: step.input.content,
    mode: step.input.mode || "replace",
    intent: step.input.intent || "refactor",
    objective: step.input.objective,
    limits: step.input.limits || {},
    ...(commitRef ? { commit_ref: commitRef } : {}),
  };
}

function statusOf(result) {
  return result?.result?.status || result?.status || null;
}

function extractOperationId(result) {
  return result?.result?.operation_id || result?.operation_id || null;
}

function assertDryRunReady(stepId, result) {
  const status = statusOf(result);
  if (status !== "ready_to_apply" && status !== "dry_run_ready") throw new Error(`dry_run failed for ${stepId}: ${status || "unknown"}`);
}

function assertCommitted(stepId, result) {
  const status = statusOf(result);
  if (status !== "committed_after_validation") throw new Error(`commit failed for ${stepId}: ${status || "unknown"}`);
}

function evaluatePlanPolicy(plan) {
  const stepPolicies = plan.steps.map((step) => evaluatePolicyRisk({
    operation: "orchestrate_patch",
    scope: step.input.scope,
    target: step.input.target,
    intent: step.input.intent || "refactor",
    step_count: plan.steps.length,
    max_files: step.input.limits?.max_files || 500,
    max_depth: step.input.limits?.max_depth || 5,
    has_dry_run: true,
  }));

  const riskScore = Math.max(...stepPolicies.map((p) => p.risk_score), 0);
  const reasons = [...new Set(stepPolicies.flatMap((p) => p.reasons))];
  const decision = riskScore > 80 ? "deny" : riskScore >= 60 ? "require_confirmation" : riskScore >= 30 ? "allow_with_constraints" : "allow";

  return {
    decision,
    risk_score: riskScore,
    reasons,
    constraints: {},
    step_policies: stepPolicies,
  };
}

async function rollbackCommits(commits, rollbackPatch, tx) {
  const rollbackResults = [];
  let currentTx = { ...tx, status: "rolling_back" };
  await appendTransactionState(currentTx);

  for (const commit of [...commits].reverse()) {
    const operationId = commit.operation_id || extractOperationId(commit.result);
    if (!operationId) {
      rollbackResults.push({ step_id: commit.step_id, status: "rollback_skipped_missing_operation_id" });
      continue;
    }

    try {
      const rolledBack = await rollbackPatch({ operationId, confirm: true });
      const status = rolledBack?.status || "unknown";
      rollbackResults.push({ step_id: commit.step_id, operation_id: operationId, result: rolledBack, status });
      if (status === "rolled_back") {
        currentTx = updateStep(currentTx, commit.step_id, { status: "rolled_back", rollback_operation_id: rolledBack.operation_id || null });
        await appendTransactionState(currentTx);
      }
    } catch (err) {
      rollbackResults.push({ step_id: commit.step_id, operation_id: operationId, status: "rollback_error", error: err?.message || String(err) });
    }
  }

  return { rollbackResults, tx: currentTx };
}

export async function executeOrchestrationPlan(plan, { dispatchRegisteredTool, rollbackPatch }) {
  if (typeof dispatchRegisteredTool !== "function") throw new Error("dispatchRegisteredTool function required");
  if (typeof rollbackPatch !== "function") throw new Error("rollbackPatch function required");

  const dag = validateDag(plan);

  let planPolicy = evaluatePlanPolicy(plan);
  const planAnomaly = await detectAnomaly({
    operation: "orchestration_plan",
    target: plan.plan_id,
    scope: plan.plan_id,
    step_count: plan.steps.length,
    risk_score: planPolicy.risk_score,
    policy: planPolicy,
  });
  planPolicy = applyAnomalyOverride(planPolicy, planAnomaly);

  await appendPolicyDecision({
    trace_id: null,
    operation: "orchestration_plan",
    plan_id: plan.plan_id,
    step_count: plan.steps.length,
    policy: planPolicy,
    anomaly: planAnomaly,
  });

  if (planPolicy.decision === "deny") {
    return {
      status: "orchestration_policy_block",
      plan_id: plan.plan_id,
      mode: plan.mode,
      risk_policy: planPolicy,
      applied: false,
    };
  }

  const stepsById = new Map(plan.steps.map((step) => [step.step_id, step]));
  const transactionId = newTransactionId(plan.plan_id);
  let tx = makeInitialTransaction({ transactionId, plan, dag });
  await appendTransactionState(tx);

  const dryRuns = new Map();
  const commits = [];

  try {
    for (const stepId of dag.execution_order) {
      const step = stepsById.get(stepId);
      const dryRun = await dispatchRegisteredTool({ tool: step.tool, input: makePatchInput(step) });
      assertDryRunReady(stepId, dryRun);
      const operationId = extractOperationId(dryRun);
      if (!operationId) throw new Error(`dry_run for ${stepId} did not return operation_id`);
      dryRuns.set(stepId, { operation_id: operationId, result: dryRun });
      tx = updateStep(tx, stepId, { status: "dry_run_ready", operation_id: operationId });
      await appendTransactionState(tx);
    }
  } catch (err) {
    tx = { ...tx, status: "dry_run_failed", error: err?.message || String(err) };
    await appendTransactionState(tx);
    return {
      status: "orchestration_dry_run_failed",
      transaction_id: transactionId,
      plan_id: plan.plan_id,
      mode: plan.mode,
      error: err?.message || String(err),
      execution_order: dag.execution_order,
      dry_runs: [...dryRuns.entries()].map(([step_id, item]) => ({ step_id, operation_id: item.operation_id })),
      commits: [],
      rollbacks: [],
      recovery_required: false,
    };
  }

  tx = { ...tx, status: "committing" };
  await appendTransactionState(tx);

  try {
    for (const stepId of dag.execution_order) {
      const step = stepsById.get(stepId);
      for (const dep of step.depends_on) {
        const depCommit = commits.find((item) => item.step_id === dep && item.status === "committed_after_validation");
        if (!depCommit) throw new Error(`dependency not committed: ${dep} -> ${stepId}`);
      }

      const dry = dryRuns.get(stepId);
      const commit = await dispatchRegisteredTool({ tool: step.tool, input: makePatchInput(step, dry.operation_id) });
      assertCommitted(stepId, commit);
      const committed = { step_id: stepId, status: "committed_after_validation", operation_id: extractOperationId(commit), result: commit };
      commits.push(committed);
      tx = updateStep(tx, stepId, { status: "committed", commit_operation_id: committed.operation_id });
      await appendTransactionState(tx);
    }
  } catch (err) {
    const { rollbackResults, tx: rollbackTx } = await rollbackCommits(commits, rollbackPatch, tx);
    const unresolved = rollbackResults.filter((item) => item.status !== "rolled_back");
    tx = { ...rollbackTx, status: unresolved.length ? "recovery_incomplete" : "rolled_back", error: err?.message || String(err) };
    await appendTransactionState(tx);
    return {
      status: unresolved.length ? "orchestration_failed_recovery_incomplete" : "orchestration_failed_rolled_back",
      transaction_id: transactionId,
      plan_id: plan.plan_id,
      mode: plan.mode,
      error: err?.message || String(err),
      execution_order: dag.execution_order,
      dry_runs: [...dryRuns.entries()].map(([step_id, item]) => ({ step_id, operation_id: item.operation_id })),
      commits,
      rollbacks: rollbackResults,
      recovery_required: unresolved.length > 0,
    };
  }

  tx = { ...tx, status: "committed" };
  await appendTransactionState(tx);

  return {
    status: "orchestration_committed",
    transaction_id: transactionId,
    plan_id: plan.plan_id,
    mode: plan.mode,
    execution_order: dag.execution_order,
    dry_runs: [...dryRuns.entries()].map(([step_id, item]) => ({ step_id, operation_id: item.operation_id })),
    commits,
    rollbacks: [],
    recovery_required: false,
  };
}
