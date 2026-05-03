import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

import { safePath, assertWritablePath } from "./paths.js";

const AUDIT_LOG_REL = ".mcp_audit/actions.jsonl";

const POLICY_SOURCES = new Set(["user_input", "repo_content", "tool_output", "llm_generated", "system_internal"]);
const POLICY_SINKS = new Set(["read", "write", "modify_code", "delete", "move", "execute", "network", "secrets"]);
const DANGEROUS_SINKS = new Set(["write", "modify_code", "delete", "move", "execute", "network", "secrets"]);

function classifySource(source) {
  return POLICY_SOURCES.has(source) ? source : "unknown";
}

function classifySink(sink) {
  return POLICY_SINKS.has(sink) ? sink : "unknown";
}

function evaluatePolicyGate({ source, sink, operation, dryRun, confirm }) {
  const sourceClass = classifySource(source);
  const sinkClass = classifySink(sink);
  const reasons = [];

  if (sourceClass === "unknown") reasons.push("unknown source");
  if (sinkClass === "unknown") reasons.push("unknown sink");
  if (!operation) reasons.push("missing operation");
  if (reasons.length) {
    return { allowed: false, decision: "deny", source: sourceClass, sink: sinkClass, operation: operation || "unknown", reasons };
  }

  const requiresConfirmation = DANGEROUS_SINKS.has(sinkClass);
  const requiresAudit = DANGEROUS_SINKS.has(sinkClass);
  const requiresValidation = sinkClass === "modify_code" || sinkClass === "execute";
  const requiresDryRun = sinkClass === "modify_code";

  if (requiresDryRun && dryRun === false && confirm !== true) {
    return {
      allowed: false,
      decision: "confirmation_required",
      source: sourceClass,
      sink: sinkClass,
      operation,
      requires_confirmation: true,
      requires_audit: requiresAudit,
      requires_validation: requiresValidation,
      requires_dry_run: true,
      reasons: ["modify_code requires dry_run result and confirm=true for execution"],
    };
  }

  return {
    allowed: true,
    decision: dryRun === false ? "allow_execute" : "allow_dry_run",
    source: sourceClass,
    sink: sinkClass,
    operation,
    requires_confirmation: requiresConfirmation,
    requires_audit: requiresAudit,
    requires_validation: requiresValidation,
    requires_dry_run: requiresDryRun,
    reasons: [],
  };
}

function newOperationId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

async function appendActionLedger(record) {
  const full = safePath(AUDIT_LOG_REL);
  await fs.mkdir(path.dirname(full), { recursive: true });
  const entry = { timestamp: new Date().toISOString(), ...record };
  await fs.appendFile(full, JSON.stringify(entry) + "\n", "utf8");
}

async function readActionLedger() {
  const full = safePath(AUDIT_LOG_REL);
  try {
    const text = await fs.readFile(full, "utf8");
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (err) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

function findLedgerEntry(records, operationId) {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    if (records[i]?.operation_id === operationId) return records[i];
  }
  return null;
}

export async function rollbackPatchForRecovery({ operationId, confirm = true }) {
  const policy = evaluatePolicyGate({
    source: "user_input",
    sink: "modify_code",
    operation: "code_rollback_patch",
    dryRun: false,
    confirm,
  });
  const rollbackId = newOperationId();
  const records = await readActionLedger();
  const source = findLedgerEntry(records, operationId);
  const baseAudit = {
    operation_id: rollbackId,
    tool: "code_rollback_patch",
    source_operation: operationId,
    dry_run: false,
    confirm,
    policy,
  };

  if (!policy.allowed) {
    await appendActionLedger({ ...baseAudit, status: policy.decision || "policy_block", applied: false });
    return { status: policy.decision || "blocked", applied: false, policy };
  }

  if (!source) {
    await appendActionLedger({ ...baseAudit, status: "source_not_found", applied: false });
    return { status: "blocked", applied: false, reason: "source operation not found" };
  }

  const validSourceStatuses = new Set(["committed_after_validation"]);
  if (!validSourceStatuses.has(source.status) || source.applied !== true) {
    await appendActionLedger({ ...baseAudit, status: "source_not_rollbackable", applied: false, source_status: source.status });
    return {
      status: "blocked",
      applied: false,
      reason: "only applied state-changing operations can be rolled back",
      source_status: source.status,
    };
  }

  const alreadyRolledBack = records.some(
    (item) => item?.tool === "code_rollback_patch" && item?.source_operation === operationId && item?.status === "rolled_back"
  );
  if (alreadyRolledBack) {
    await appendActionLedger({ ...baseAudit, status: "already_rolled_back", applied: false, target: source.target, backup: source.backup });
    return {
      status: "blocked",
      applied: false,
      reason: "source operation already rolled back",
      target: source.target,
      backup: source.backup,
    };
  }

  if (!source.backup) {
    await appendActionLedger({ ...baseAudit, status: "missing_backup", applied: false, target: source.target });
    return { status: "blocked", applied: false, reason: "source operation has no backup", target: source.target };
  }

  assertWritablePath(source.target, { allowProtected: false });
  const targetPath = safePath(source.target);
  const backupPath = safePath(source.backup);
  const backupStat = await fs.stat(backupPath);
  if (!backupStat.isFile()) throw new Error("Backup is not a file.");

  const before = await fs.readFile(targetPath, "utf8");
  const restored = await fs.readFile(backupPath, "utf8");
  await fs.writeFile(targetPath, restored, "utf8");
  const bytesBefore = Buffer.byteLength(before, "utf8");
  const bytesAfter = Buffer.byteLength(restored, "utf8");

  await appendActionLedger({
    ...baseAudit,
    status: "rolled_back",
    applied: true,
    target: source.target,
    backup: source.backup,
    bytes_before: bytesBefore,
    bytes_after: bytesAfter,
  });

  return {
    status: "rolled_back",
    applied: true,
    operation_id: rollbackId,
    source_operation: operationId,
    target: source.target,
    restored_from: source.backup,
    bytes_before: bytesBefore,
    bytes_after: bytesAfter,
  };
}
