import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";

import { registerSafeTool } from "./responses.js";
import { safePath, toRel, assertWritablePath } from "./paths.js";
import { createBackupIfExists } from "./fs_ops.js";
import { registryStatus } from "./registry/registry.js";
import { dispatchRegisteredTool } from "./registry/dispatch.js";
import { evaluatePolicyRisk, enforcePolicyDecision, applyPolicyConstraints, applyRiskAdjustment } from "./policy/engine.js";
import { appendPolicyDecision } from "./policy/memory.js";
import { detectAnomaly, applyAnomalyOverride } from "./policy/anomaly.js";
import { feedbackAdjustment } from "./policy/feedback.js";
import { appendTraceStep } from "./observability/trace.js";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const STATE_CHANGING = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const MAX_CODE_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SYMBOLS = 1000;
const MAX_DEPENDENCIES = 500;

function linesOf(text) { return String(text || "").split(/\r\n|\n|\r/); }
function addSymbol(symbols, item) { if (symbols.length < MAX_SYMBOLS) symbols.push(item); }

function extractJsSymbols(text) {
  const symbols = [];
  const lines = linesOf(text);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i], n = i + 1;
    let m;
    m = line.match(/^\s*export\s+function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (m) { addSymbol(symbols, { kind: "function", name: m[1], line: n, exported: true }); continue; }
    m = line.match(/^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (m) { addSymbol(symbols, { kind: "function", name: m[1], line: n, exported: false }); continue; }
    m = line.match(/^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
    if (m) { addSymbol(symbols, { kind: "variable", name: m[1], line: n, exported: true }); continue; }
    m = line.match(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(?[^=]*\)?\s*=>/);
    if (m) { addSymbol(symbols, { kind: "function", name: m[1], line: n, exported: false }); continue; }
    m = line.match(/^\s*export\s+class\s+([A-Za-z_$][\w$]*)\b/);
    if (m) { addSymbol(symbols, { kind: "class", name: m[1], line: n, exported: true }); continue; }
    m = line.match(/^\s*class\s+([A-Za-z_$][\w$]*)\b/);
    if (m) { addSymbol(symbols, { kind: "class", name: m[1], line: n, exported: false }); continue; }
    m = line.match(/^\s*import\s+(.+?)\s+from\s+["'](.+?)["']/);
    if (m) { addSymbol(symbols, { kind: "import", name: m[1].trim(), source: m[2], line: n }); continue; }
  }
  return symbols;
}

function extractPySymbols(text) {
  const symbols = [];
  const lines = linesOf(text);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i], n = i + 1;
    let m;
    m = line.match(/^\s*async\s+def\s+([A-Za-z_][\w]*)\s*\(/);
    if (m) { addSymbol(symbols, { kind: "function", name: m[1], line: n, async: true }); continue; }
    m = line.match(/^\s*def\s+([A-Za-z_][\w]*)\s*\(/);
    if (m) { addSymbol(symbols, { kind: "function", name: m[1], line: n }); continue; }
    m = line.match(/^\s*class\s+([A-Za-z_][\w]*)\b/);
    if (m) { addSymbol(symbols, { kind: "class", name: m[1], line: n }); continue; }
    m = line.match(/^\s*from\s+([A-Za-z_][\w.]*|\.+[A-Za-z_][\w.]*)\s+import\s+(.+)/);
    if (m) { addSymbol(symbols, { kind: "import", source: m[1], name: m[2].trim(), line: n }); continue; }
    m = line.match(/^\s*import\s+(.+)/);
    if (m) { addSymbol(symbols, { kind: "import", name: m[1].trim(), line: n }); continue; }
  }
  return symbols;
}

function extractSymbols(relPath, text) {
  const ext = path.extname(relPath).toLowerCase();
  if ([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"].includes(ext)) return { language: "javascript", symbols: extractJsSymbols(text) };
  if (ext === ".py") return { language: "python", symbols: extractPySymbols(text) };
  return { language: "unsupported", symbols: [] };
}

function localImportCandidates(fileRel, language, source) {
  const dir = path.posix.dirname(fileRel);
  const out = [];
  const clean = String(source || "").replaceAll("\\", "/");
  if (language === "javascript") {
    if (!clean.startsWith(".")) return out;
    const base = path.posix.normalize(path.posix.join(dir, clean));
    for (const ext of ["", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]) out.push(base + ext);
    for (const ext of [".js", ".ts", ".tsx", ".jsx"]) out.push(path.posix.join(base, "index" + ext));
    return out;
  }
  if (language === "python") {
    if (!clean.startsWith(".")) return out;
    const dots = clean.match(/^\.+/)?.[0]?.length || 0;
    const rest = clean.slice(dots).replaceAll(".", "/");
    let baseDir = dir;
    for (let i = 1; i < dots; i += 1) baseDir = path.posix.dirname(baseDir);
    const base = path.posix.normalize(path.posix.join(baseDir, rest));
    out.push(base + ".py");
    out.push(path.posix.join(base, "__init__.py"));
  }
  return out;
}

function resolveCandidate(candidates, existing) {
  for (const c of candidates) if (existing.has(c)) return c;
  return null;
}

async function walkFiles(rootFull, rootRel, recursive, maxFiles) {
  const files = [];
  let visited = 0, truncated = false;
  async function walk(dir) {
    if (truncated) return;
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (truncated) return;
      const full = path.join(dir, e.name), rel = toRel(full);
      if (e.isDirectory()) { if (recursive) await walk(full); continue; }
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (![".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py"].includes(ext)) continue;
      visited += 1;
      if (visited > maxFiles) { truncated = true; return; }
      if (rootRel && !rel.startsWith(rootRel)) continue;
      files.push(rel);
    }
  }
  await walk(rootFull);
  return { files, visited, truncated };
}

async function buildDependencyGraph(requestedPath, recursive, maxFiles) {
  const root = safePath(requestedPath);
  const stat = await fs.stat(root);
  const rootRel = toRel(root);
  const fileList = stat.isFile()
    ? { files: [rootRel], visited: 1, truncated: false }
    : await walkFiles(root, rootRel === "." ? "" : rootRel, recursive, maxFiles);
  const existing = new Set(fileList.files);
  const nodes = [], edges = [], unresolved = [];
  for (const rel of fileList.files) {
    if (nodes.length >= maxFiles) break;
    const full = safePath(rel);
    const st = await fs.stat(full);
    if (st.size > MAX_CODE_FILE_BYTES) continue;
    const text = await fs.readFile(full, "utf8");
    const { language, symbols } = extractSymbols(rel, text);
    const imports = symbols.filter((s) => s.kind === "import").slice(0, MAX_DEPENDENCIES);
    nodes.push({ path: rel, language, imports: imports.length, symbols: symbols.length });
    for (const imp of imports) {
      const source = imp.source || imp.name;
      const candidates = localImportCandidates(rel, language, source);
      const resolved = resolveCandidate(candidates, existing);
      if (resolved) edges.push({ from: rel, to: resolved, source, line: imp.line });
      else if (candidates.length > 0) unresolved.push({ from: rel, source, line: imp.line, candidates: candidates.slice(0, 5) });
    }
  }
  return {
    path: rootRel, recursive, max_files: maxFiles,
    visited_files: fileList.visited, scanned_files: fileList.files.length, truncated: fileList.truncated,
    nodes_count: nodes.length, edges_count: edges.length, unresolved_count: unresolved.length,
    nodes, edges: edges.slice(0, MAX_DEPENDENCIES), unresolved: unresolved.slice(0, MAX_DEPENDENCIES),
  };
}

function degreeMaps(graph) {
  const inDegree = new Map(), outDegree = new Map();
  for (const n of graph.nodes) { inDegree.set(n.path, 0); outDegree.set(n.path, 0); }
  for (const e of graph.edges) {
    outDegree.set(e.from, (outDegree.get(e.from) || 0) + 1);
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
  }
  return { inDegree, outDegree };
}

function auditGraph(graph, topN) {
  const { inDegree, outDegree } = degreeMaps(graph);
  const sortDesc = (map) => [...map.entries()].map(([path, degree]) => ({ path, degree })).sort((a, b) => b.degree - a.degree || a.path.localeCompare(b.path)).slice(0, topN);
  const entrypoints = graph.nodes.filter((n) => (inDegree.get(n.path) || 0) === 0 && (outDegree.get(n.path) || 0) > 0).map((n) => ({ path: n.path, out_degree: outDegree.get(n.path) || 0, symbols: n.symbols })).sort((a, b) => b.out_degree - a.out_degree || a.path.localeCompare(b.path)).slice(0, topN);
  const leaves = graph.nodes.filter((n) => (outDegree.get(n.path) || 0) === 0 && (inDegree.get(n.path) || 0) > 0).map((n) => ({ path: n.path, in_degree: inDegree.get(n.path) || 0, symbols: n.symbols })).sort((a, b) => b.in_degree - a.in_degree || a.path.localeCompare(b.path)).slice(0, topN);
  const isolated = graph.nodes.filter((n) => (inDegree.get(n.path) || 0) === 0 && (outDegree.get(n.path) || 0) === 0).map((n) => ({ path: n.path, symbols: n.symbols })).slice(0, topN);
  return { summary: { nodes: graph.nodes_count, edges: graph.edges_count, unresolved: graph.unresolved_count, truncated: graph.truncated }, high_fan_in: sortDesc(inDegree), high_fan_out: sortDesc(outDegree), entrypoints, leaves, isolated, unresolved: graph.unresolved.slice(0, topN) };
}

function impactGraph(graph, target, direction, maxDepth) {
  const forward = new Map(), reverse = new Map();
  const nodeSet = new Set(graph.nodes.map((n) => n.path));
  for (const n of graph.nodes) { forward.set(n.path, []); reverse.set(n.path, []); }
  for (const e of graph.edges) {
    if (!forward.has(e.from)) forward.set(e.from, []);
    if (!reverse.has(e.to)) reverse.set(e.to, []);
    forward.get(e.from).push({ path: e.to, via: e.source, line: e.line });
    reverse.get(e.to).push({ path: e.from, via: e.source, line: e.line });
  }
  const start = target.replaceAll("\\", "/");
  if (!nodeSet.has(start)) return { target: start, found: false, affected_count: 0, dependencies_count: 0, affected: [], dependencies: [] };
  function traverse(map) {
    const seen = new Set([start]);
    const out = [];
    const queue = [{ path: start, depth: 0, via: null, line: null }];
    while (queue.length) {
      const cur = queue.shift();
      if (cur.depth >= maxDepth) continue;
      for (const next of map.get(cur.path) || []) {
        if (seen.has(next.path)) continue;
        seen.add(next.path);
        const item = { path: next.path, depth: cur.depth + 1, via: next.via, line: next.line };
        out.push(item);
        queue.push(item);
      }
    }
    return out;
  }
  const affected = direction === "dependencies" ? [] : traverse(reverse);
  const dependencies = direction === "dependents" ? [] : traverse(forward);
  return { target: start, found: true, affected_count: affected.length, dependencies_count: dependencies.length, affected, dependencies };
}

function scenarioRisk(graph, impact, changeType) {
  const { inDegree, outDegree } = degreeMaps(graph);
  const fanIn = inDegree.get(impact.target) || 0;
  const fanOut = outDegree.get(impact.target) || 0;
  let score = impact.affected_count * 3 + impact.dependencies_count + fanIn * 2 + fanOut;
  if (["remove", "rename", "api_change"].includes(changeType)) score += 6;
  if (changeType === "internal_refactor") score += 1;
  const level = score >= 20 ? "high" : score >= 8 ? "medium" : "low";
  return { level, score, fan_in: fanIn, fan_out: fanOut };
}

function scenarioPlan(graph, target, changeType, direction, maxDepth) {
  const impact = impactGraph(graph, target, direction, maxDepth);
  if (!impact.found) return { ...impact, risk: { level: "unknown", score: 0 }, context_files: [], recommended_checks: ["target not found in dependency graph"] };
  const risk = scenarioRisk(graph, impact, changeType);
  const contextSet = new Set([impact.target]);
  for (const item of [...impact.affected, ...impact.dependencies]) contextSet.add(item.path);
  const context_files = [...contextSet].slice(0, 50);
  const recommended_checks = [];
  if (impact.affected_count > 0) recommended_checks.push("review affected dependents before editing public API");
  if (impact.dependencies_count > 0) recommended_checks.push("review downstream dependencies for invariant assumptions");
  if (["remove", "rename", "api_change"].includes(changeType)) recommended_checks.push("run targeted tests for all affected modules");
  if (risk.level === "high") recommended_checks.push("split change into minimal patch and validation pass");
  if (risk.level === "low") recommended_checks.push("single-file change likely safe if local tests pass");
  return { ...impact, risk, context_files, recommended_checks };
}

const INTENT_TO_CHANGE_TYPE = {
  refactor: "internal_refactor",
  change_behavior: "behavior_change",
  change_api: "api_change",
  rename: "rename",
  remove: "remove",
};

function mapIntentToChangeType(intent) {
  return INTENT_TO_CHANGE_TYPE[intent] || "internal_refactor";
}

function uniquePaths(items) {
  return [...new Set(items.filter(Boolean))];
}

function orchestrationPlan(graph, target, intent, objective, direction, maxDepth) {
  const changeType = mapIntentToChangeType(intent);
  const scenario = scenarioPlan(graph, target, changeType, direction, maxDepth);
  const gates = {
    require_user_approval: true,
    require_tests: scenario.risk.level === "medium" || scenario.risk.level === "high",
    allow_auto_write: false,
    allow_execution: false,
  };

  if (!scenario.found) {
    return {
      intent,
      objective: objective || "",
      change_type: changeType,
      scenario,
      plan: [
        { step: 1, type: "stop", files: [], reason: "Target is not present in the dependency graph." },
        { step: 2, type: "validate_target", files: [scenario.target], reason: "Check path spelling, scope and supported file type." },
      ],
      gates,
      decision: { status: "blocked", proceed: false, next_required_action: "validate target path before planning" },
    };
  }

  const targetFile = scenario.target;
  const affectedFiles = scenario.affected.map((item) => item.path);
  const dependencyFiles = scenario.dependencies.map((item) => item.path);
  const plan = [];
  let step = 1;
  const add = (type, files, reason) => plan.push({ step: step++, type, files: uniquePaths(files), reason });

  add("inspect_target", [targetFile], "Understand the exact change surface before editing.");
  if (dependencyFiles.length) add("inspect_dependencies", dependencyFiles, "Review downstream assumptions used by the target module.");
  if (affectedFiles.length) add("inspect_affected_dependents", affectedFiles, "Review modules that import or depend on the target.");

  if (scenario.risk.level === "high") {
    add("split_patch", scenario.context_files, "High-risk change: split into the smallest coherent patch and a separate validation pass.");
    add("define_regression_checks", affectedFiles.length ? affectedFiles : scenario.context_files, "Define targeted checks for every affected module before implementation.");
  } else if (scenario.risk.level === "medium") {
    add("define_targeted_checks", scenario.context_files, "Medium-risk change: validate target, dependencies and affected dependents.");
  } else {
    add("local_validation", [targetFile], "Low-risk change: local validation should be sufficient before broader review.");
  }

  add("manual_edit_required", [targetFile], "STEP 7.6 is plan-only; no automatic writes or execution are allowed.");

  return {
    intent,
    objective: objective || "",
    change_type: changeType,
    scenario,
    plan,
    gates,
    decision: { status: "plan_only", proceed: false, next_required_action: "manual review of orchestration plan" },
  };
}

function patchPlan(graph, target, intent, objective, direction, maxDepth) {
  const orchestration = orchestrationPlan(graph, target, intent, objective, direction, maxDepth);

  if (!orchestration.scenario?.found) {
    return {
      ...orchestration,
      read_plan: [],
      anchor_strategy: { primary: null, fallback: null },
      patch_constraints: ["target must exist before patch planning"],
      validation_plan: [],
      decision: { status: "blocked", proceed: false },
    };
  }

  const scenario = orchestration.scenario;
  const targetFile = scenario.target;
  const deps = scenario.dependencies.map((d) => d.path);
  const affected = scenario.affected.map((a) => a.path);

  const read_plan = [
    { type: "target", files: [targetFile], reason: "Read the target before designing any patch." },
    { type: "dependencies", files: deps.slice(0, 5), reason: "Read direct dependencies for invariant assumptions." },
    { type: "affected", files: affected.slice(0, 5), reason: "Read direct dependents to assess call-site impact." },
  ];

  return {
    orchestration,
    patch_scope: { target: targetFile, dependencies: deps, affected },
    read_plan,
    anchor_strategy: {
      primary: "Use a unique function/class signature or exact top-level declaration in target.",
      fallback: "Use a unique import line or nearby top-level statement only after reading the target.",
      required_property: "future edit anchor must match exactly once",
    },
    patch_constraints: [
      "anchor must match exactly once",
      "no multi-file write in single patch",
      "no modification without prior read",
      "must pass edit_file_patch dry_run",
      "do not execute code in STEP 7.7",
    ],
    validation_plan: [
      "verify affected modules still import correctly",
      "verify no broken dependencies",
      "run targeted tests if medium/high risk",
    ],
    decision: { status: "patch_plan_only", proceed: false },
  };
}

function countPatchOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while (true) {
    const found = text.indexOf(needle, index);
    if (found === -1) return count;
    count += 1;
    index = found + needle.length;
  }
}

function applyPatchMode(source, anchor, content, mode) {
  if (mode === "before") return source.replace(anchor, content + anchor);
  if (mode === "after") return source.replace(anchor, anchor + content);
  if (mode === "replace") return source.replace(anchor, content);
  throw new Error("Unsupported patch mode: " + mode);
}

const POLICY_SOURCES = new Set(["user_input", "repo_content", "tool_output", "llm_generated", "system_internal"]);
const POLICY_SINKS = new Set(["read", "write", "modify_code", "delete", "move", "execute", "network", "secrets"]);
const DANGEROUS_SINKS = new Set(["write", "modify_code", "delete", "move", "execute", "network", "secrets"]);
const EXECUTION_GATE_VERSION = "execution_gate_v1";
const FORBIDDEN_APPLIED_STATUSES = new Set(["applied_with_validation_error"]);

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
  if (reasons.length) return { allowed: false, decision: "deny", source: sourceClass, sink: sinkClass, operation: operation || "unknown", reasons };

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


const AUDIT_LOG_REL = ".mcp_audit/actions.jsonl";

function newOperationId() {
  try { return crypto.randomUUID(); } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function hashText(text) {
  return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

async function appendActionLedger(record) {
  const full = safePath(AUDIT_LOG_REL);
  await fs.mkdir(path.dirname(full), { recursive: true });
  const entry = { timestamp: new Date().toISOString(), ...record };
  await fs.appendFile(full, JSON.stringify(entry) + "\n", "utf8");
}
function runValidator(command, args, type) {
  return new Promise((resolve) => {
    execFile(command, args, { shell: false }, (err, stdout, stderr) => {
      if (err) return resolve({ valid: false, type, errors: stderr || err.message });
      return resolve({ valid: true, type, errors: null });
    });
  });
}

async function validateAfterApply(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) {
    return runValidator("node", ["--check", filePath], "js_syntax");
  }
  if (lower.endsWith(".py")) {
    return runValidator("python", ["-m", "py_compile", filePath], "python_compile");
  }
  return { valid: true, type: "skipped", errors: null };
}

async function validateCandidateContent(filePath, content, operationId) {
  const lower = filePath.toLowerCase();
  const needsValidation = lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs") || lower.endsWith(".py");
  if (!needsValidation) return { valid: true, type: "skipped", errors: null, phase: "pre_commit" };

  const sandboxRel = `.mcp_sandbox/execution_gate/${operationId}`;
  const sandboxDir = safePath(sandboxRel);
  const candidatePath = path.join(sandboxDir, path.basename(filePath));

  await fs.mkdir(sandboxDir, { recursive: true });
  try {
    await fs.writeFile(candidatePath, content, "utf8");
    const validation = await validateAfterApply(candidatePath);
    return { ...validation, phase: "pre_commit" };
  } finally {
    await fs.rm(sandboxDir, { recursive: true, force: true });
  }
}

async function applyPatchWithGuards({ scopePath, target, intent, objective, direction, maxDepth, maxFiles, anchor, content, mode, dryRun, confirm, requireMarkers, allowProtected, commitRef }) {
  const policy = evaluatePolicyGate({ source: "user_input", sink: "modify_code", operation: "code_apply_patch", dryRun, confirm });
  const operationId = newOperationId();
  const baseAudit = {
    operation_id: operationId,
    tool: "code_apply_patch",
    scope: scopePath,
    target,
    anchor_hash: hashText(anchor),
    content_hash: hashText(content),
    mode,
    dry_run: dryRun,
    confirm,
    policy,
  };
  if (!policy.allowed) {
    await appendActionLedger({ ...baseAudit, status: policy.decision || "policy_block", applied: false });
    return { status: policy.decision || "blocked", applied: false, policy };
  }
  const graph = await buildDependencyGraph(scopePath, true, maxFiles);
  const plan = patchPlan(graph, target, intent, objective, direction, maxDepth);
  if (plan.decision?.status === "blocked") {
    await appendActionLedger({ ...baseAudit, status: "plan_block", applied: false });
    return { status: "blocked", applied: false, reason: "patch plan blocked", plan };
  }

  const targetRel = plan.patch_scope.target;
  assertWritablePath(targetRel, { allowProtected });
  const filePath = safePath(targetRel);
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error("Patch target is not a file.");

  const original = await fs.readFile(filePath, "utf8");
  const anchorMatches = countPatchOccurrences(original, anchor);
  if (anchorMatches !== 1) {
    await appendActionLedger({ ...baseAudit, status: "anchor_block", applied: false, target: targetRel, anchor_matches: anchorMatches });
    return { status: "blocked", applied: false, reason: "anchor must match exactly once", anchor_matches: anchorMatches, plan };
  }

  const patched = applyPatchMode(original, anchor, content, mode);
  const missingMarkers = (requireMarkers || []).filter((marker) => !patched.includes(marker));
  if (missingMarkers.length) {
    await appendActionLedger({ ...baseAudit, status: "marker_block", applied: false, target: targetRel, missing_markers: missingMarkers });
    return { status: "blocked", applied: false, reason: "required markers missing after patch", missing_markers: missingMarkers, plan };
  }

  const bytesBefore = Buffer.byteLength(original, "utf8");
  const bytesAfter = Buffer.byteLength(patched, "utf8");
  let riskPolicy = evaluatePolicyRisk({
    operation: "apply_patch",
    target: targetRel,
    scope: scopePath,
    intent,
    delta_bytes: bytesAfter - bytesBefore,
    max_files: maxFiles,
    max_depth: maxDepth,
    dry_run: dryRun,
    commit_ref: commitRef,
  });
  const anomaly = await detectAnomaly({
    operation: "apply_patch",
    target: targetRel,
    scope: scopePath,
    intent,
    delta_bytes: bytesAfter - bytesBefore,
    risk_score: riskPolicy.risk_score,
    policy: riskPolicy,
  });
  riskPolicy = applyAnomalyOverride(riskPolicy, anomaly);
  const feedback = await feedbackAdjustment({ operation: "apply_patch", target: targetRel, scope: scopePath, intent });
  riskPolicy = applyRiskAdjustment(riskPolicy, feedback);
  await appendPolicyDecision({
    trace_id: null,
    operation_id: operationId,
    operation: "apply_patch",
    scope: scopePath,
    target: targetRel,
    intent,
    dry_run: dryRun,
    confirm,
    commit_ref: commitRef || null,
    delta_bytes: bytesAfter - bytesBefore,
    policy: riskPolicy,
    anomaly,
    feedback,
  });

  if (riskPolicy.decision === "deny" || (riskPolicy.decision === "require_confirmation" && confirm !== true)) {
    await appendActionLedger({ ...baseAudit, status: "policy_risk_block", applied: false, target: targetRel, risk_policy: riskPolicy });
    return { status: "policy_risk_block", applied: false, risk_policy: riskPolicy, target: targetRel };
  }

  const constrained = applyPolicyConstraints({ maxFiles, maxDepth }, riskPolicy);
  maxFiles = constrained.maxFiles ?? maxFiles;
  maxDepth = constrained.maxDepth ?? maxDepth;

  const dryRunResult = {
    status: "ready_to_apply",
    applied: false,
    operation_id: operationId,
    target: targetRel,
    mode,
    anchor_matches: anchorMatches,
    bytes_before: bytesBefore,
    bytes_after: bytesAfter,
    delta_bytes: bytesAfter - bytesBefore,
    plan,
    risk_policy: riskPolicy,
  };

  if (dryRun) {
    await appendActionLedger({ ...baseAudit, status: "dry_run_ready", applied: false, target: targetRel, bytes_before: bytesBefore, bytes_after: bytesAfter });
    return dryRunResult;
  }
  if (!confirm) {
    await appendActionLedger({ ...baseAudit, status: "confirmation_required", applied: false, target: targetRel, bytes_before: bytesBefore, bytes_after: bytesAfter });
    return { ...dryRunResult, status: "confirmation_required", reason: "dry_run=false requires confirm=true" };
  }

  if (!commitRef) {
    await appendActionLedger({ ...baseAudit, status: "commit_ref_missing", applied: false, target: targetRel });
    return { ...dryRunResult, status: "commit_ref_missing", applied: false };
  }

  const ledger = await readActionLedger();
  const ref = findLedgerEntry(ledger, commitRef);
  if (!ref || ref.status !== "dry_run_ready") {
    await appendActionLedger({ ...baseAudit, status: "commit_ref_invalid", applied: false, target: targetRel });
    return { ...dryRunResult, status: "commit_ref_invalid", applied: false };
  }

  if (ref.target !== targetRel || ref.anchor_hash !== baseAudit.anchor_hash || ref.content_hash !== baseAudit.content_hash) {
    await appendActionLedger({ ...baseAudit, status: "commit_integrity_violation", applied: false, target: targetRel });
    return { ...dryRunResult, status: "commit_integrity_violation", applied: false };
  }

  const candidateValidation = await validateCandidateContent(filePath, patched, operationId);

  if (!candidateValidation.valid) {
    await appendActionLedger({ ...baseAudit, status: "validation_blocked", applied: false, target: targetRel, validation: candidateValidation });
    return { ...dryRunResult, status: "validation_blocked", applied: false, validation: candidateValidation };
  }

  const backup = await createBackupIfExists(filePath);
  await fs.writeFile(filePath, patched, "utf8");

  const validation = await validateAfterApply(filePath);

  if (!validation.valid) {
    const restored = await fs.readFile(backup, "utf8");
    await fs.writeFile(filePath, restored, "utf8");

    await appendActionLedger({ ...baseAudit, status: "auto_rolled_back_validation_error", applied: false, target: targetRel, backup, validation });

    return { ...dryRunResult, status: "auto_rolled_back_validation_error", applied: false, backup, validation };
  }

  await appendActionLedger({ ...baseAudit, status: "committed_after_validation", applied: true, target: targetRel, bytes_before: bytesBefore, bytes_after: bytesAfter, backup, validation, execution_gate: EXECUTION_GATE_VERSION });
  return { ...dryRunResult, status: "committed_after_validation", applied: true, backup, validation };
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
  return rollbackPatch({ operationId, confirm });
}

async function rollbackPatch({ operationId, confirm }) {
  const policy = evaluatePolicyGate({ source: "user_input", sink: "modify_code", operation: "code_rollback_patch", dryRun: false, confirm });
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
    return { status: "blocked", applied: false, reason: "only applied state-changing operations can be rolled back", source_status: source.status };
  }

  const alreadyRolledBack = records.some((item) => item?.tool === "code_rollback_patch" && item?.source_operation === operationId && item?.status === "rolled_back");
  if (alreadyRolledBack) {
    await appendActionLedger({ ...baseAudit, status: "already_rolled_back", applied: false, target: source.target, backup: source.backup });
    return { status: "blocked", applied: false, reason: "source operation already rolled back", target: source.target, backup: source.backup };
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
  await appendActionLedger({ ...baseAudit, status: "rolled_back", applied: true, target: source.target, backup: source.backup, bytes_before: bytesBefore, bytes_after: bytesAfter });
  return { status: "rolled_back", applied: true, operation_id: rollbackId, source_operation: operationId, target: source.target, restored_from: source.backup, bytes_before: bytesBefore, bytes_after: bytesAfter };
}

export function registerCodeTools(server) {
  registerSafeTool(server, "code_symbols", {
    title: "Extract code symbols",
    description: "Extract bounded structural symbols from JS/TS/Python files without executing user code.",
    inputSchema: z.object({ path: z.string() }),
    annotations: READ_ONLY,
  }, async ({ path: requestedPath }) => {
    const full = safePath(requestedPath);
    const stat = await fs.stat(full);
    if (!stat.isFile()) throw new Error("Not a file.");
    if (stat.size > MAX_CODE_FILE_BYTES) throw new Error(`File too large for code_symbols: ${stat.size} bytes.`);
    const rel = toRel(full);
    const text = await fs.readFile(full, "utf8");
    const { language, symbols } = extractSymbols(rel, text);
    return { path: rel, language, bytes: stat.size, total_lines: linesOf(text).length, symbol_count: symbols.length, truncated: symbols.length >= MAX_SYMBOLS, symbols };
  });

  registerSafeTool(server, "code_dependencies", {
    title: "Build code dependency graph",
    description: "Build bounded import dependency graph for JS/TS/Python files without executing user code.",
    inputSchema: z.object({ path: z.string(), recursive: z.boolean().default(true), max_files: z.number().int().min(1).max(5000).default(500) }),
    annotations: READ_ONLY,
  }, async ({ path: requestedPath, recursive, max_files }) => buildDependencyGraph(requestedPath, recursive, max_files));

  registerSafeTool(server, "code_audit", {
    title: "Audit code dependency graph",
    description: "Summarize dependency graph structure: fan-in/fan-out, entrypoints, leaves and isolated modules.",
    inputSchema: z.object({ path: z.string(), recursive: z.boolean().default(true), max_files: z.number().int().min(1).max(5000).default(500), top_n: z.number().int().min(1).max(100).default(20) }),
    annotations: READ_ONLY,
  }, async ({ path: requestedPath, recursive, max_files, top_n }) => {
    const graph = await buildDependencyGraph(requestedPath, recursive, max_files);
    return { path: graph.path, recursive: graph.recursive, max_files: graph.max_files, ...auditGraph(graph, top_n) };
  });

  registerSafeTool(server, "code_impact", {
    title: "Analyze code dependency impact",
    description: "Trace dependents and dependencies for one file inside a bounded JS/TS/Python import graph.",
    inputSchema: z.object({ path: z.string(), target: z.string(), recursive: z.boolean().default(true), max_files: z.number().int().min(1).max(5000).default(500), max_depth: z.number().int().min(1).max(20).default(5), direction: z.enum(["both", "dependents", "dependencies"]).default("both") }),
    annotations: READ_ONLY,
  }, async ({ path: requestedPath, target, recursive, max_files, max_depth, direction }) => {
    const graph = await buildDependencyGraph(requestedPath, recursive, max_files);
    return { scope: graph.path, direction, max_depth, graph: { nodes: graph.nodes_count, edges: graph.edges_count, truncated: graph.truncated }, ...impactGraph(graph, target, direction, max_depth) };
  });

  registerSafeTool(server, "code_rollback_patch", {
    title: "Rollback code patch",
    description: "Rollback a previously applied code patch using audit ledger.",
    inputSchema: z.object({
      operation_id: z.string(),
      confirm: z.boolean().default(false)
    }),
    annotations: STATE_CHANGING,
  }, async ({ operation_id, confirm }) => {
    return rollbackPatch({ operationId: operation_id, confirm });
  });

  registerSafeTool(server, "code_apply_patch", {
    title: "Apply code patch with guards",
    description: "Apply a code patch with strict safety checks and confirmation.",
    inputSchema: z.object({
      path: z.string(),
      target: z.string(),
      anchor: z.string(),
      content: z.string(),
      mode: z.enum(["before","after","replace"]).default("replace"),
      intent: z.enum(["refactor","change_behavior","change_api","rename","remove"]).default("refactor"),
      objective: z.string().optional(),
      max_files: z.number().int().min(1).max(5000).default(500),
      max_depth: z.number().int().min(1).max(20).default(5),
      direction: z.enum(["both","dependents","dependencies"]).default("both"),
      dry_run: z.boolean().default(true),
      confirm: z.boolean().default(false),
      require_markers: z.array(z.string()).default([]),
      allow_protected: z.boolean().default(false)
    }),
    annotations: STATE_CHANGING,
  }, async ({ path: requestedPath, target, anchor, content, mode, intent, objective, max_files, max_depth, direction, dry_run, confirm, require_markers, allow_protected }) => {
    return applyPatchWithGuards({ scopePath: requestedPath, target, intent, objective, direction, maxDepth: max_depth, maxFiles: max_files, anchor, content, mode, dryRun: dry_run, confirm, requireMarkers: require_markers, allowProtected: allow_protected });
  });

  registerSafeTool(server, "code_patch_plan", {
    title: "Plan code patch",
    description: "Prepare a safe patch plan without modifying files.",
    inputSchema: z.object({ path: z.string(), target: z.string(), intent: z.enum(["refactor", "change_behavior", "change_api", "rename", "remove"]).default("refactor"), objective: z.string().optional(), recursive: z.boolean().default(true), max_files: z.number().int().min(1).max(5000).default(500), max_depth: z.number().int().min(1).max(20).default(5), direction: z.enum(["both", "dependents", "dependencies"]).default("both") }),
    annotations: READ_ONLY,
  }, async ({ path: requestedPath, target, intent, objective, recursive, max_files, max_depth, direction }) => {
    const graph = await buildDependencyGraph(requestedPath, recursive, max_files);
    return patchPlan(graph, target, intent, objective, direction, max_depth);
  });

  registerSafeTool(server, "code_orchestrate", {
    title: "Orchestrate code change plan",
    description: "Build a deterministic plan-only orchestration for a code change; no file writes and no execution.",
    inputSchema: z.object({ path: z.string(), target: z.string(), intent: z.enum(["refactor","change_behavior","change_api","rename","remove"]).default("refactor"), objective: z.string().optional(), recursive: z.boolean().default(true), max_files: z.number().int().min(1).max(5000).default(500), max_depth: z.number().int().min(1).max(20).default(5), direction: z.enum(["both","dependents","dependencies"]).default("both") }),
    annotations: READ_ONLY,
  }, async ({ path: requestedPath, target, intent, objective, recursive, max_files, max_depth, direction }) => {
    const graph = await buildDependencyGraph(requestedPath, recursive, max_files);
    return { scope: graph.path, direction, max_depth, graph: { nodes: graph.nodes_count, edges: graph.edges_count, truncated: graph.truncated }, ...orchestrationPlan(graph, target, intent, objective, direction, max_depth) };
  });

  registerSafeTool(server, "tool_registry_status", {
    title: "Tool registry status",
    description: "Return validated tool registry state.",
    inputSchema: z.object({}),
    annotations: READ_ONLY,
  }, async () => {
    return await registryStatus();
  });

  registerSafeTool(server, "tool_dispatch", {
    title: "Dispatch tool via registry",
    description: "Execute tool through registry + DSL enforcement.",
    inputSchema: z.object({
      tool: z.string(),
      input: z.record(z.any())
    }),
    annotations: STATE_CHANGING,
  }, async ({ tool, input }) => {
    const clamp = (value, max) => Math.min(value, max);
    const handlers = {
      code_analysis: {
        symbols: async (args) => {
          const full = safePath(args.path);
          const stat = await fs.stat(full);
          if (!stat.isFile()) throw new Error("symbols operation requires file scope");
          if (stat.size > MAX_CODE_FILE_BYTES) throw new Error(`File too large for symbols: ${stat.size} bytes.`);
          const rel = toRel(full);
          const text = await fs.readFile(full, "utf8");
          const { language, symbols } = extractSymbols(rel, text);
          return { path: rel, language, bytes: stat.size, total_lines: linesOf(text).length, symbol_count: symbols.length, truncated: symbols.length >= MAX_SYMBOLS, symbols };
        },
        dependencies: async (args, runtime) => buildDependencyGraph(args.path, args.recursive, clamp(args.max_files, runtime.limits.max_internal_steps * 100)),
        audit: async (args, runtime) => {
          const graph = await buildDependencyGraph(args.path, args.recursive, clamp(args.max_files, runtime.limits.max_internal_steps * 100));
          return { path: graph.path, recursive: graph.recursive, max_files: graph.max_files, ...auditGraph(graph, 20) };
        },
        impact: async (args, runtime) => {
          if (!args.target) throw new Error("impact operation requires target");
          const graph = await buildDependencyGraph(args.path, args.recursive, clamp(args.max_files, runtime.limits.max_internal_steps * 100));
          const maxDepth = clamp(args.max_depth, runtime.limits.max_internal_steps * 2);
          return { scope: graph.path, direction: args.direction, max_depth: maxDepth, graph: { nodes: graph.nodes_count, edges: graph.edges_count, truncated: graph.truncated }, ...impactGraph(graph, args.target, args.direction, maxDepth) };
        },
        scenario: async (args, runtime) => {
          if (!args.target) throw new Error("scenario operation requires target");
          const graph = await buildDependencyGraph(args.path, args.recursive, clamp(args.max_files, runtime.limits.max_internal_steps * 100));
          const maxDepth = clamp(args.max_depth, runtime.limits.max_internal_steps * 2);
          return { scope: graph.path, change_type: args.change_type || "internal_refactor", direction: args.direction, max_depth: maxDepth, graph: { nodes: graph.nodes_count, edges: graph.edges_count, truncated: graph.truncated }, ...scenarioPlan(graph, args.target, args.change_type || "internal_refactor", args.direction, maxDepth) };
        },
        patch_plan: async (args, runtime) => {
          if (!args.target) throw new Error("patch_plan operation requires target");
          const graph = await buildDependencyGraph(args.path, args.recursive, clamp(args.max_files, runtime.limits.max_internal_steps * 100));
          const maxDepth = clamp(args.max_depth, runtime.limits.max_internal_steps * 2);
          return patchPlan(graph, args.target, args.intent || "refactor", args.objective, args.direction, maxDepth);
        },
        orchestrate: async (args, runtime) => {
          if (!args.target) throw new Error("orchestrate operation requires target");
          const graph = await buildDependencyGraph(args.path, args.recursive, clamp(args.max_files, runtime.limits.max_internal_steps * 100));
          const maxDepth = clamp(args.max_depth, runtime.limits.max_internal_steps * 2);
          return { scope: graph.path, direction: args.direction, max_depth: maxDepth, graph: { nodes: graph.nodes_count, edges: graph.edges_count, truncated: graph.truncated }, ...orchestrationPlan(graph, args.target, args.intent || "refactor", args.objective, args.direction, maxDepth) };
        },
        apply_patch: async (args) => {
          if (!args.target) throw new Error("apply_patch requires target");
          if (!args.anchor || !args.content) throw new Error("apply_patch requires anchor and content");

          const isCommit = Boolean(args.commit_ref);

          const result = await applyPatchWithGuards({
            scopePath: args.path,
            target: args.target,
            intent: args.intent || "refactor",
            objective: args.objective,
            direction: args.direction || "both",
            maxDepth: args.max_depth || 5,
            maxFiles: args.max_files || 500,
            anchor: args.anchor,
            content: args.content,
            mode: args.mode || "replace",
            dryRun: !isCommit,
            confirm: isCommit,
            commitRef: args.commit_ref
          });

          return result;
        }
      }
    };

    return await dispatchRegisteredTool({ tool, input, handlers });
  });

  registerSafeTool(server, "code_scenario", {
    title: "Plan code change scenario",
    description: "Classify change risk and return minimal context files for a planned code change without editing files.",
    inputSchema: z.object({ path: z.string(), target: z.string(), change_type: z.enum(["internal_refactor", "api_change", "rename", "remove", "behavior_change"]).default("internal_refactor"), recursive: z.boolean().default(true), max_files: z.number().int().min(1).max(5000).default(500), max_depth: z.number().int().min(1).max(20).default(5), direction: z.enum(["both", "dependents", "dependencies"]).default("both") }),
    annotations: READ_ONLY,
  }, async ({ path: requestedPath, target, change_type, recursive, max_files, max_depth, direction }) => {
    const graph = await buildDependencyGraph(requestedPath, recursive, max_files);
    return { scope: graph.path, change_type, direction, max_depth, graph: { nodes: graph.nodes_count, edges: graph.edges_count, truncated: graph.truncated }, ...scenarioPlan(graph, target, change_type, direction, max_depth) };
  });
}
