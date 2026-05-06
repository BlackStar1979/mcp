import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { BASE_DIR, RUNTIME_DIR } from "./config.js";
import { registerSafeTool } from "./responses.js";
import { audit } from "./audit.js";

const READ_ONLY_LOCAL = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const PROJECT_TRUTH_AUDIT_OUTPUT = z.object({
  status: z.string(),
  audit_version: z.string(),
  repo_root: z.string(),
  runtime_truth: z.object({
    server_profiles: z.array(z.string()),
    active_groups: z.array(z.string()),
  }).strict(),
  docs_truth: z.object({
    current_state_matches_runtime: z.boolean(),
    runtime_contracts_matches_runtime: z.boolean(),
    docs_catalog_tracks_canonical_runtime_docs: z.boolean(),
  }).strict(),
  test_truth: z.object({
    contract_surface_covers_web_tools: z.boolean(),
    registry_execute_reads_runtime_source: z.boolean(),
    registry_outputschema_covers_execute: z.boolean(),
  }).strict(),
  deploy_truth: z.object({
    deploy_prepare_execute_present: z.boolean(),
    rollback_script_present: z.boolean(),
  }).strict(),
  drifts: z.array(z.object({
    area: z.string(),
    issue: z.string(),
    severity: z.enum(["info", "warn"]),
  }).strict()),
}).strict();

const CODE_RUNTIME_MAP_OUTPUT = z.object({
  status: z.string(),
  map_version: z.string(),
  repo_root: z.string(),
  entrypoints: z.array(z.object({
    file: z.string(),
    role: z.string(),
    port: z.number().optional(),
  }).strict()),
  server_tools_runtime: z.object({
    active_modules: z.array(z.object({
      file: z.string(),
      register: z.string(),
      category: z.string(),
    }).strict()),
    active_groups: z.array(z.string()),
  }).strict(),
  protected_boundaries: z.object({
    protected_files: z.array(z.string()),
    blocked_top_level_dirs: z.array(z.string()),
    skipped_scan_dirs: z.array(z.string()),
  }).strict(),
  legacy_and_staging: z.object({
    legacy_files: z.array(z.string()),
    staging_dirs: z.array(z.string()),
  }).strict(),
  test_runtime_links: z.array(z.object({
    test_file: z.string(),
    covers: z.array(z.string()),
    kind: z.string(),
  }).strict()),
}).strict();

const DEPLOY_DECISION_GUARD_OUTPUT = z.object({
  status: z.string(),
  guard_version: z.string(),
  classification: z.enum(["repo_only", "test_only", "runtime", "runtime_with_client_refresh"]),
  changed_paths: z.array(z.string()),
  requires_manifest: z.boolean(),
  requires_prepare_execute: z.boolean(),
  requires_restart_mcp: z.boolean(),
  requires_client_refresh: z.boolean(),
  workflow: z.array(z.string()),
  reasons: z.array(z.string()),
}).strict();

const CHANGE_WORKFLOW_SIMULATOR_OUTPUT = z.object({
  status: z.string(),
  simulator_version: z.string(),
  classification: z.enum(["repo_only", "test_only", "runtime", "runtime_with_client_refresh"]),
  changed_paths: z.array(z.string()),
  summary: z.string(),
  operator_actions: z.array(z.string()),
  validation_steps: z.array(z.string()),
  deployment_steps: z.array(z.string()),
  post_steps: z.array(z.string()),
  requires_manifest: z.boolean(),
  requires_prepare_execute: z.boolean(),
  requires_restart_mcp: z.boolean(),
  requires_client_refresh: z.boolean(),
  reasons: z.array(z.string()),
}).strict();

const TOOL_USAGE_SNAPSHOT_OUTPUT = z.object({
  status: z.string(),
  snapshot_version: z.string(),
  source_log: z.string(),
  total_tool_invocations: z.number(),
  unique_tool_count: z.number(),
  time_window: z.object({
    first_ts: z.string().nullable(),
    last_ts: z.string().nullable(),
  }).strict(),
  top_tools: z.array(z.object({
    name: z.string(),
    count: z.number(),
  }).strict()),
  family_counts: z.object({
    truth_tools: z.number(),
    registry_tools: z.number(),
    web_tools: z.number(),
    other_tools: z.number(),
  }).strict(),
  web_tool_counts: z.array(z.object({
    name: z.string(),
    count: z.number(),
  }).strict()),
  notes: z.array(z.string()),
}).strict();

const RUNTIME_GROUPS = [
  "index tools",
  "filesystem tools",
  "science tools",
  "connector-safe code tools",
  "connector-safe registry tools",
  "web tools",
  "truth tools",
];

async function readLocal(relativePath) {
  const segments = String(relativePath || "")
    .split(/[\\/]+/)
    .filter(Boolean);
  return fs.readFile(path.join(RUNTIME_DIR, ...segments), "utf8");
}

function hasBulletBlock(text, heading, bullets) {
  const headingIndex = text.indexOf(heading);
  if (headingIndex < 0) return false;
  const window = text.slice(headingIndex, headingIndex + 1200);
  return bullets.every((bullet) => window.includes(`- ${bullet}`));
}

function drift(area, issue, severity = "warn") {
  return { area, issue, severity };
}

async function runProjectTruthAudit() {
  const [
    currentState,
    runtimeContracts,
    docsCatalog,
    contractSurfaceTest,
    registryExecuteTest,
    outputSchemaGuardTest,
    deployScript,
    rollbackScript,
  ] = await Promise.all([
    readLocal("docs/CURRENT_STATE.md"),
    readLocal("docs/RUNTIME_CONTRACTS_CURRENT.md"),
    readLocal("docs/DOCS_CATALOG.md"),
    readLocal("tests/mcp_contract_surface.test.js"),
    readLocal("tests/registry_execute_v1_1.test.js"),
    readLocal("tests/registry_outputschema_runtime_guard.test.js"),
    readLocal("deploy.ps1"),
    readLocal("rollback.ps1"),
  ]);

  const currentStateMatchesRuntime = hasBulletBlock(
    currentState,
    "Rejestrowane aktywne grupy tooli:",
    RUNTIME_GROUPS
  );

  const runtimeContractsMatchesRuntime = [
    "### Code safe",
    "### Registry safe",
    "### Web tools",
    "- `http_get`",
    "- `check_pypi_package`",
    "- `tool_registry_execute`",
  ].every((needle) => runtimeContracts.includes(needle));

  const docsCatalogTracksCanonicalRuntimeDocs = [
    "| `CURRENT_STATE.md` |",
    "| `RUNTIME_CONTRACTS_CURRENT.md` |",
    "| `REGISTRY.md` |",
  ].every((needle) => docsCatalog.includes(needle));

  const contractSurfaceCoversWebTools =
    contractSurfaceTest.includes('registerWebTools(server);') &&
    contractSurfaceTest.includes('names.includes("http_get")') &&
    contractSurfaceTest.includes('names.includes("check_pypi_package")');

  const registryExecuteReadsRuntimeSource =
    registryExecuteTest.includes('fs.readFileSync("core/registry_tools_safe.js", "utf8")') &&
    registryExecuteTest.includes('new URL(import.meta.url)') &&
    !registryExecuteTest.includes(".mcp_warzone/registry_tools_execute_v1_1.js");

  const registryOutputschemaCoversExecute =
    outputSchemaGuardTest.includes("tool_registry_execute") &&
    outputSchemaGuardTest.includes("REGISTRY_EXECUTE_TOOL_OUTPUT");

  const deployPrepareExecutePresent =
    deployScript.includes('[ValidateSet("Status", "Prepare", "Execute")]') &&
    deployScript.includes("function Invoke-Prepare") &&
    deployScript.includes('if ($Mode -eq "Execute")');

  const rollbackScriptPresent = rollbackScript.includes("WhatIfOnly");

  const drifts = [];

  if (!currentStateMatchesRuntime) {
    drifts.push(drift("docs_truth", "CURRENT_STATE.md does not fully match the active runtime group set"));
  }

  if (!runtimeContractsMatchesRuntime) {
    drifts.push(drift("docs_truth", "RUNTIME_CONTRACTS_CURRENT.md does not fully match the active runtime surface"));
  }

  if (!docsCatalogTracksCanonicalRuntimeDocs) {
    drifts.push(drift("docs_truth", "DOCS_CATALOG.md is missing one or more canonical runtime docs"));
  }

  if (!contractSurfaceCoversWebTools) {
    drifts.push(drift("test_truth", "contract surface test does not fully cover active web tools"));
  }

  if (!registryExecuteReadsRuntimeSource) {
    drifts.push(drift("test_truth", "registry execute v1.1 test does not read active runtime source cleanly"));
  }

  if (!registryOutputschemaCoversExecute) {
    drifts.push(drift("test_truth", "registry outputSchema guard does not cover tool_registry_execute"));
  }

  if (!deployPrepareExecutePresent) {
    drifts.push(drift("deploy_truth", "deploy.ps1 does not clearly expose Prepare and Execute paths"));
  }

  if (!rollbackScriptPresent) {
    drifts.push(drift("deploy_truth", "rollback.ps1 does not expose expected dry-run/WhatIf path"));
  }

  const result = {
    status: drifts.length ? "drift_detected" : "ok",
    audit_version: "v1",
    repo_root: RUNTIME_DIR,
    runtime_truth: {
      server_profiles: ["server.js", "server_tools.js"],
      active_groups: RUNTIME_GROUPS,
    },
    docs_truth: {
      current_state_matches_runtime: currentStateMatchesRuntime,
      runtime_contracts_matches_runtime: runtimeContractsMatchesRuntime,
      docs_catalog_tracks_canonical_runtime_docs: docsCatalogTracksCanonicalRuntimeDocs,
    },
    test_truth: {
      contract_surface_covers_web_tools: contractSurfaceCoversWebTools,
      registry_execute_reads_runtime_source: registryExecuteReadsRuntimeSource,
      registry_outputschema_covers_execute: registryOutputschemaCoversExecute,
    },
    deploy_truth: {
      deploy_prepare_execute_present: deployPrepareExecutePresent,
      rollback_script_present: rollbackScriptPresent,
    },
    drifts,
  };

  await audit("project_truth_audit", {
    source: "truth_tools_v1",
    event: "project_truth_audit",
    status: result.status,
    drift_count: drifts.length,
  });

  return result;
}

async function runCodeRuntimeMap() {
  const [serverTools, configFile] = await Promise.all([
    readLocal("server_tools.js"),
    readLocal("core/config.js"),
  ]);

  const activeModules = [
    { file: "core/tools_index.js", register: "registerIndexTools", category: "index tools" },
    { file: "core/tools_fs.js", register: "registerFsTools", category: "filesystem tools" },
    { file: "core/science_tools.js", register: "registerScienceTools", category: "science tools" },
    { file: "core/code_tools_safe.js", register: "registerCodeTools", category: "connector-safe code tools" },
    { file: "core/registry_tools_safe.js", register: "registerRegistryTools", category: "connector-safe registry tools" },
    { file: "core/web_tools.js", register: "registerWebTools", category: "web tools" },
    { file: "core/truth_tools.js", register: "registerTruthTools", category: "truth tools" },
  ].filter(({ register }) => serverTools.includes(`${register}(server)`));

  const testRuntimeLinks = [
    {
      test_file: "tests/mcp_contract_surface.test.js",
      covers: ["server_tools tool registration surface", "web tools", "truth tools"],
      kind: "contract surface",
    },
    {
      test_file: "tests/registry_execute_v1_1.test.js",
      covers: ["core/registry_tools_safe.js", "tool_registry_execute"],
      kind: "runtime-source guard",
    },
    {
      test_file: "tests/registry_outputschema_runtime_guard.test.js",
      covers: ["core/registry_tools_safe.js", "registry outputSchema rollout"],
      kind: "runtime-schema guard",
    },
    {
      test_file: "tests/truth_tools_v1.test.js",
      covers: ["core/truth_tools.js", "server_tools.js", "project_truth_audit"],
      kind: "tool contract + handler baseline",
    },
  ];

  const protectedFilesMatch = configFile.match(/PROTECTED_PATHS = new Set\(\[([\s\S]*?)\]\)/);
  const blockedTopLevelDirsMatch = configFile.match(/BLOCKED_TOP_LEVEL_DIRS = new Set\(\[([\s\S]*?)\]\)/);
  const skippedScanDirsMatch = configFile.match(/SKIPPED_SCAN_DIRS = new Set\(\[([\s\S]*?)\]\)/);

  const extractList = (match) =>
    (match?.[1] || "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith('"'))
      .map((line) => line.replace(/["',]/g, ""))
      .filter(Boolean);

  const result = {
    status: "ok",
    map_version: "v1",
    repo_root: RUNTIME_DIR,
    entrypoints: [
      { file: "server.js", role: "read-only MCP", port: 3000 },
      { file: "server_tools.js", role: "tools MCP", port: 3001 },
      { file: "deploy.ps1", role: "deploy control-plane" },
      { file: "rollback.ps1", role: "rollback control-plane" },
      { file: "perf.ps1", role: "perf control-plane" },
    ],
    server_tools_runtime: {
      active_modules: activeModules,
      active_groups: activeModules.map((item) => item.category),
    },
    protected_boundaries: {
      protected_files: extractList(protectedFilesMatch),
      blocked_top_level_dirs: extractList(blockedTopLevelDirsMatch),
      skipped_scan_dirs: extractList(skippedScanDirsMatch),
    },
    legacy_and_staging: {
      legacy_files: ["core/code_tools.js"],
      staging_dirs: [".mcp_warzone", ".mcp_deploy", ".mcp_deploy_backup"],
    },
    test_runtime_links: testRuntimeLinks,
  };

  await audit("code_runtime_map", {
    source: "truth_tools_v1",
    event: "code_runtime_map",
    status: result.status,
    active_module_count: result.server_tools_runtime.active_modules.length,
  });

  return result;
}

function normalizePathValue(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
}

function inferDeployDecision({ changed_paths = [], descriptor_change = false, schema_change = false, tool_surface_change = false } = {}) {
  const normalizedPaths = changed_paths.map(normalizePathValue).filter(Boolean);

  const touchesDocs = normalizedPaths.some((p) => p.startsWith("docs/"));
  const touchesTests = normalizedPaths.some((p) => p.startsWith("tests/"));
  const touchesRuntime =
    normalizedPaths.some((p) => p === "server.js" || p === "server_tools.js" || p.startsWith("core/"));
  const touchesControlPlane =
    normalizedPaths.some((p) => p === "deploy.ps1" || p === "rollback.ps1" || p === "perf.ps1");

  const effectiveRuntime = touchesRuntime || touchesControlPlane;
  const effectiveClientRefresh = tool_surface_change || descriptor_change || schema_change;

  let classification = "repo_only";
  if (effectiveRuntime && effectiveClientRefresh) classification = "runtime_with_client_refresh";
  else if (effectiveRuntime) classification = "runtime";
  else if (touchesTests && !touchesDocs) classification = "test_only";
  else if (touchesTests && touchesDocs) classification = "repo_only";

  const requiresManifest = effectiveRuntime;
  const requiresPrepareExecute = effectiveRuntime;
  const requiresRestartMcp = effectiveRuntime;
  const requiresClientRefresh = effectiveRuntime && effectiveClientRefresh;

  const reasons = [];
  if (touchesRuntime) reasons.push("active runtime files changed");
  if (touchesControlPlane) reasons.push("control-plane script changed");
  if (touchesTests) reasons.push("test files changed");
  if (touchesDocs) reasons.push("documentation files changed");
  if (descriptor_change) reasons.push("descriptor metadata changed");
  if (schema_change) reasons.push("schema contract changed");
  if (tool_surface_change) reasons.push("tool surface changed");
  if (!reasons.length) reasons.push("no recognized path class; defaulting to repo_only");

  const workflow = effectiveRuntime
    ? [
        "prepare change in .mcp_warzone",
        "validate staged files",
        "create manifest in .mcp_deploy",
        "deploy.ps1 -Mode Prepare",
        "deploy.ps1 -Mode Execute",
        "restart MCP",
        ...(requiresClientRefresh ? ["refresh client connector"] : []),
        "runtime verification",
        "rollback if verification fails",
      ]
    : [
        "edit tracked repo files",
        "run repo validation",
        "update canonical docs if needed",
        "commit",
        "push",
      ];

  return {
    status: "ok",
    guard_version: "v1",
    classification,
    changed_paths: normalizedPaths,
    requires_manifest: requiresManifest,
    requires_prepare_execute: requiresPrepareExecute,
    requires_restart_mcp: requiresRestartMcp,
    requires_client_refresh: requiresClientRefresh,
    workflow,
    reasons,
  };
}

function simulateWorkflow(args = {}) {
  const decision = inferDeployDecision(args);

  const validationSteps = decision.requires_prepare_execute
    ? [
        "prepare change in .mcp_warzone",
        "verify staged files exist",
        "run local validation for staged files",
        "verify manifest path and staged targets match",
      ]
    : [
        "edit tracked repo files directly",
        "run local repo validation",
        "update canonical docs if system description changed",
      ];

  const deploymentSteps = decision.requires_prepare_execute
    ? [
        "create manifest in .mcp_deploy",
        "deploy.ps1 -Mode Prepare",
        "deploy.ps1 -Mode Execute",
      ]
    : ["no deploy pipeline required"];

  const postSteps = decision.requires_prepare_execute
    ? [
        "restart MCP",
        ...(decision.requires_client_refresh ? ["refresh client connector"] : []),
        "invoke changed runtime tools directly",
        "rollback if runtime verification fails",
        "commit",
        "push",
      ]
    : [
        "commit",
        "push",
      ];

  const operatorActions = decision.requires_prepare_execute
    ? [
        "run Prepare",
        "run Execute",
        "restart MCP",
        ...(decision.requires_client_refresh ? ["refresh client connector"] : []),
      ]
    : [];

  const summaryByClass = {
    repo_only: "Repo-only change: validate locally, update docs if needed, then commit and push without deploy, restart, or client refresh.",
    test_only: "Test-only change: validate tests locally, then commit and push without deploy, restart, or client refresh.",
    runtime: "Runtime change: stage in .mcp_warzone, deploy through manifest and Prepare/Execute, restart MCP, then verify runtime directly.",
    runtime_with_client_refresh: "Runtime change with connector-visible impact: deploy through manifest and Prepare/Execute, restart MCP, refresh client connector, then verify runtime directly.",
  };

  return {
    status: "ok",
    simulator_version: "v1",
    classification: decision.classification,
    changed_paths: decision.changed_paths,
    summary: summaryByClass[decision.classification],
    operator_actions: operatorActions,
    validation_steps: validationSteps,
    deployment_steps: deploymentSteps,
    post_steps: postSteps,
    requires_manifest: decision.requires_manifest,
    requires_prepare_execute: decision.requires_prepare_execute,
    requires_restart_mcp: decision.requires_restart_mcp,
    requires_client_refresh: decision.requires_client_refresh,
    reasons: decision.reasons,
  };
}

async function runToolUsageSnapshot() {
  let perfLog = "";
  let logAvailable = true;
  try {
    perfLog = await readLocal(".mcp_perf.log");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      logAvailable = false;
      perfLog = "";
    } else {
      throw error;
    }
  }

  const lines = perfLog.split(/\r?\n/).filter(Boolean);

  const toolEntries = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry) => entry && entry.type === "tool" && typeof entry.name === "string");

  const counts = new Map();
  const webTools = new Set(["http_get", "pypi_info", "check_pypi_package", "check_npm_package", "fetch_github_file"]);
  const truthTools = new Set(["project_truth_audit", "code_runtime_map", "deploy_decision_guard", "change_workflow_simulator", "tool_usage_snapshot"]);
  const registryTools = new Set([
    "tool_registry_status",
    "tool_registry_list",
    "tool_registry_get_tool",
    "tool_registry_validate_tool",
    "tool_registry_policy",
    "tool_registry_preflight",
    "tool_registry_plan",
    "tool_registry_execute",
  ]);

  let truthCount = 0;
  let registryCount = 0;
  let webCount = 0;
  let otherCount = 0;

  for (const entry of toolEntries) {
    counts.set(entry.name, (counts.get(entry.name) || 0) + 1);

    if (truthTools.has(entry.name)) truthCount += 1;
    else if (registryTools.has(entry.name)) registryCount += 1;
    else if (webTools.has(entry.name)) webCount += 1;
    else otherCount += 1;
  }

  const sortedCounts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));

  const webToolCounts = sortedCounts.filter((item) => webTools.has(item.name));
  const firstTs = toolEntries.length ? String(toolEntries[0].ts || null) : null;
  const lastTs = toolEntries.length ? String(toolEntries[toolEntries.length - 1].ts || null) : null;

  const notes = [];
  if (!logAvailable) {
    notes.push("perf log is not present in this environment; returning an empty observed-usage snapshot");
  }
  if (truthCount > 0) {
    notes.push("truth tools dominate recent observed MCP decision support usage");
  }
  if (webToolCounts.length > 0) {
    notes.push("web/research usage is currently bounded to single-file fetches, registry package metadata, and single allowlisted GET requests");
  }
  if (!sortedCounts.some((item) => item.name === "download_docs")) {
    notes.push("no evidence of demand for a broader docs-downloading tool appears in current MCP tool invocation logs");
  }

  const result = {
    status: "ok",
    snapshot_version: "v1",
    source_log: ".mcp_perf.log",
    total_tool_invocations: toolEntries.length,
    unique_tool_count: sortedCounts.length,
    time_window: {
      first_ts: firstTs,
      last_ts: lastTs,
    },
    top_tools: sortedCounts.slice(0, 10),
    family_counts: {
      truth_tools: truthCount,
      registry_tools: registryCount,
      web_tools: webCount,
      other_tools: otherCount,
    },
    web_tool_counts: webToolCounts,
    notes,
  };

  await audit("tool_usage_snapshot", {
    source: "truth_tools_v1",
    event: "tool_usage_snapshot",
    total_tool_invocations: result.total_tool_invocations,
    unique_tool_count: result.unique_tool_count,
    web_tool_count: result.family_counts.web_tools,
  });

  return result;
}

export function registerTruthTools(server) {
  registerSafeTool(
    server,
    "project_truth_audit",
    {
      title: "Project truth audit",
      description: "Compare active runtime truth, canonical docs, key test boundaries, and deploy control-plane signals for drift.",
      inputSchema: z.object({}).strict(),
      outputSchema: PROJECT_TRUTH_AUDIT_OUTPUT,
      annotations: READ_ONLY_LOCAL,
    },
    async () => runProjectTruthAudit()
  );

  registerSafeTool(
    server,
    "code_runtime_map",
    {
      title: "Code runtime map",
      description: "Map active runtime entrypoints, registered modules, protected boundaries, legacy/staging areas, and key test-to-runtime links.",
      inputSchema: z.object({}).strict(),
      outputSchema: CODE_RUNTIME_MAP_OUTPUT,
      annotations: READ_ONLY_LOCAL,
    },
    async () => runCodeRuntimeMap()
  );

  registerSafeTool(
    server,
    "deploy_decision_guard",
    {
      title: "Deploy decision guard",
      description: "Classify a planned change as repo-only, test-only, runtime, or runtime with client refresh, and return the minimal safe workflow.",
      inputSchema: z.object({
        changed_paths: z.array(z.string()).min(1),
        descriptor_change: z.boolean().optional().default(false),
        schema_change: z.boolean().optional().default(false),
        tool_surface_change: z.boolean().optional().default(false),
      }).strict(),
      outputSchema: DEPLOY_DECISION_GUARD_OUTPUT,
      annotations: READ_ONLY_LOCAL,
    },
    async (args) => {
      const result = inferDeployDecision(args || {});
      await audit("deploy_decision_guard", {
        source: "truth_tools_v1",
        event: "deploy_decision_guard",
        classification: result.classification,
        requires_restart_mcp: result.requires_restart_mcp,
        requires_client_refresh: result.requires_client_refresh,
      });
      return result;
    }
  );

  registerSafeTool(
    server,
    "change_workflow_simulator",
    {
      title: "Change workflow simulator",
      description: "Simulate the minimal safe validation, deploy, restart, and client-refresh sequence for a planned change without executing it.",
      inputSchema: z.object({
        changed_paths: z.array(z.string()).min(1),
        descriptor_change: z.boolean().optional().default(false),
        schema_change: z.boolean().optional().default(false),
        tool_surface_change: z.boolean().optional().default(false),
      }).strict(),
      outputSchema: CHANGE_WORKFLOW_SIMULATOR_OUTPUT,
      annotations: READ_ONLY_LOCAL,
    },
    async (args) => {
      const result = simulateWorkflow(args || {});
      await audit("change_workflow_simulator", {
        source: "truth_tools_v1",
        event: "change_workflow_simulator",
        classification: result.classification,
        operator_action_count: result.operator_actions.length,
        requires_restart_mcp: result.requires_restart_mcp,
        requires_client_refresh: result.requires_client_refresh,
      });
      return result;
    }
  );

  registerSafeTool(
    server,
    "tool_usage_snapshot",
    {
      title: "Tool usage snapshot",
      description: "Summarize observed MCP tool usage from the local perf log to support bounded tool-planning decisions.",
      inputSchema: z.object({}).strict(),
      outputSchema: TOOL_USAGE_SNAPSHOT_OUTPUT,
      annotations: READ_ONLY_LOCAL,
    },
    async () => runToolUsageSnapshot()
  );
}

