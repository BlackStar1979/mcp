import {
  appendTransactionState,
  loadActiveTransactions,
  updateStep,
} from "./tx_ledger.js";

function committedSteps(tx) {
  const order = Array.isArray(tx.execution_order) ? tx.execution_order : tx.steps.map((step) => step.step_id);
  const byId = new Map(tx.steps.map((step) => [step.step_id, step]));
  return [...order]
    .reverse()
    .map((stepId) => byId.get(stepId))
    .filter((step) => step && (step.status === "committed" || step.commit_operation_id));
}

async function rollbackTransaction(tx, rollbackPatch) {
  let current = { ...tx, status: "rolling_back" };
  await appendTransactionState(current);

  const rollbacks = [];

  for (const step of committedSteps(current)) {
    if (step.status === "rolled_back") continue;

    const operationId = step.commit_operation_id || step.operation_id;
    if (!operationId) {
      rollbacks.push({ step_id: step.step_id, status: "rollback_skipped_missing_operation_id" });
      continue;
    }

    try {
      const result = await rollbackPatch({ operationId, confirm: true });
      const status = result?.status || "unknown";
      rollbacks.push({ step_id: step.step_id, operation_id: operationId, status, result });
      if (status === "rolled_back") {
        current = updateStep(current, step.step_id, {
          status: "rolled_back",
          rollback_operation_id: result.operation_id || null,
        });
        await appendTransactionState(current);
      }
    } catch (err) {
      rollbacks.push({
        step_id: step.step_id,
        operation_id: operationId,
        status: "rollback_error",
        error: err?.message || String(err),
      });
    }
  }

  const unresolved = rollbacks.filter((item) => item.status !== "rolled_back");
  current = {
    ...current,
    status: unresolved.length ? "recovery_failed" : "recovered_rolled_back",
    recovery_required: unresolved.length > 0,
    recovery_rollbacks: rollbacks,
  };
  await appendTransactionState(current);

  return current;
}

export async function runRecovery({ rollbackPatch }) {
  if (typeof rollbackPatch !== "function") throw new Error("rollbackPatch function required");

  const active = await loadActiveTransactions();
  const results = [];

  for (const tx of active) {
    if (tx.status === "dry_running") {
      const aborted = { ...tx, status: "recovery_aborted_dry_run", recovery_required: false };
      await appendTransactionState(aborted);
      results.push(aborted);
      continue;
    }

    if (tx.status === "committing" || tx.status === "rolling_back") {
      const recovered = await rollbackTransaction(tx, rollbackPatch);
      results.push(recovered);
      continue;
    }

    results.push({ ...tx, status: "recovery_skipped_unknown_state", recovery_required: true });
  }

  return {
    status: results.some((item) => item.recovery_required) ? "recovery_incomplete" : "recovery_ok",
    checked_at: new Date().toISOString(),
    recovered_count: results.length,
    results,
  };
}
