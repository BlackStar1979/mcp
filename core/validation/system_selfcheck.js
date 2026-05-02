import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { loadRegistry, resolveToolRuntime } from "../registry/registry.js";
import { validateRegistry } from "../registry/validate_registry.js";
import { loadJson } from "../registry/dsl_validator.js";
import { buildPolicyBaseline } from "../policy/baseline.js";
import { policyStats } from "../policy/memory.js";
import { feedbackStats } from "../policy/feedback.js";
import { loadActiveTransactions } from "../orchestration/tx_ledger.js";

const BASE = path.resolve("C:\\Work");
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ROOT_REL = path.relative(BASE, ROOT).replaceAll("\\", "/");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function rootTarget(rel) {
  return path.join(ROOT_REL, rel).replaceAll("\\", "/");
}

async function existsFull(fullPath) {
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

async function checkRootFile(rel) {
  const fullPath = path.join(ROOT, rel);
  assert(await existsFull(fullPath), `missing file: ${rootTarget(rel)}`);
  return rootTarget(rel);
}

async function checkWorkFile(rel) {
  const fullPath = path.join(BASE, rel);
  assert(await existsFull(fullPath), `missing file: ${rel}`);
  return rel;
}

async function checkRootJson(rel) {
  await checkRootFile(rel);
  JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8"));
  return rootTarget(rel);
}

export async function runSystemSelfcheck() {
  const checks = [];

  const requiredFiles = [
    "registry/tool_registry.json",
    "registry/tool_registry.schema.json",
    "registry/registry.js",
    "registry/dispatch.js",
    "registry/dsl_validator.js",
    "orchestration/plan_schema.json",
    "orchestration/dag_validator.js",
    "orchestration/executor.js",
    "orchestration/tx_ledger.js",
    "orchestration/recovery.js",
    "policy/engine.js",
    "policy/memory.js",
    "policy/anomaly.js",
    "policy/baseline.js",
    "policy/feedback.js",
    "observability/trace.js"
  ];

  for (const rel of requiredFiles) {
    const target = await checkRootFile(rel);
    checks.push({ check: "file_exists", target, status: "ok" });
  }

  for (const rel of [
    "registry/tool_registry.json",
    "registry/tool_registry.schema.json",
    "registry/schemas/code_analysis_dsl.json",
    "registry/schemas/code_analysis_output.json",
    "orchestration/plan_schema.json"
  ]) {
    const target = await checkRootJson(rel);
    checks.push({ check: "json_parse", target, status: "ok" });
  }

  const registry = await loadRegistry({ force: true });
  validateRegistry(registry);
  checks.push({ check: "registry_validate", status: "ok", tool_count: registry.tools.length });

  for (const tool of registry.tools) {
    const resolved = await resolveToolRuntime(tool.tool);
    await checkWorkFile(resolved.dsl_schema_path);
    await checkWorkFile(resolved.output_schema_path);
    await loadJson(path.join(BASE, resolved.dsl_schema_path));
    await loadJson(path.join(BASE, resolved.output_schema_path));
    checks.push({ check: "tool_runtime_resolve", tool: tool.tool, status: "ok" });
  }

  const baseline = await buildPolicyBaseline({ limit: 1000 });
  checks.push({ check: "policy_baseline_build", status: "ok", sample_size: baseline.sample_size });

  const pStats = await policyStats({ limit: 1000 });
  checks.push({ check: "policy_stats", status: "ok", total: pStats.total });

  const fStats = await feedbackStats({ limit: 1000 });
  checks.push({ check: "feedback_stats", status: "ok", total: fStats.total });

  const activeTx = await loadActiveTransactions();
  checks.push({ check: "active_transactions_scan", status: "ok", active_count: activeTx.length });

  return {
    status: "ok",
    checked_at: new Date().toISOString(),
    checks,
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath = new URL(import.meta.url).pathname.replace(/^\/(.:\/)/, "$1");
if (invokedPath && path.resolve(modulePath) === invokedPath) {
  runSystemSelfcheck().then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((err) => {
    console.error(JSON.stringify({ status: "error", error: err?.message || String(err) }, null, 2));
    process.exit(1);
  });
}
