import { z } from "zod";

import { registerSafeTool } from "../responses.js";
import { audit } from "../audit.js";
import {
  CODE_RUNTIME_MAP_OUTPUT,
  PROJECT_TRUTH_AUDIT_OUTPUT,
  READ_ONLY_LOCAL,
  RUNTIME_DIR,
  RUNTIME_GROUPS,
  drift,
  hasBulletBlock,
  readLocal,
} from "./shared.js";

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
    "### Process tools",
    "- `http_get`",
    "- `check_pypi_package`",
    "- `run_process`",
    "- `tool_registry_execute`",
  ].every((needle) => runtimeContracts.includes(needle));

  const docsCatalogTracksCanonicalRuntimeDocs = [
    "| `CURRENT_STATE.md` |",
    "| `RUNTIME_CONTRACTS_CURRENT.md` |",
    "| `reference/REGISTRY.md` |",
  ].every((needle) => docsCatalog.includes(needle));

  const contractSurfaceCoversWebTools =
    contractSurfaceTest.includes('registerWebTools(server);') &&
    contractSurfaceTest.includes('names.includes("http_get")') &&
    contractSurfaceTest.includes('names.includes("check_pypi_package")');

  const contractSurfaceCoversProcessTools =
    contractSurfaceTest.includes('registerProcessTools(server);') &&
    contractSurfaceTest.includes('names.includes("run_process")') &&
    contractSurfaceTest.includes('names.includes("process_runner_status")');

  const contractSurfaceCoversRemoteSiteTools =
    contractSurfaceTest.includes('registerRemoteSiteTools(server);') &&
    contractSurfaceTest.includes('names.includes("list_remote_site_files")') &&
    contractSurfaceTest.includes('names.includes("remote_site_runtime_status")') &&
    contractSurfaceTest.includes('names.includes("preview_remote_site_retention")');

  const registryExecuteReadsRuntimeSource =
    registryExecuteTest.includes('fs.readFileSync("core/registry_tools_safe.js", "utf8")') &&
    registryExecuteTest.includes("new URL(import.meta.url)") &&
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

  if (!contractSurfaceCoversProcessTools) {
    drifts.push(drift("test_truth", "contract surface test does not fully cover active process tools"));
  }

  if (!contractSurfaceCoversRemoteSiteTools) {
    drifts.push(drift("test_truth", "contract surface test does not fully cover active remote site tools"));
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
      contract_surface_covers_process_tools: contractSurfaceCoversProcessTools,
      contract_surface_covers_remote_site_tools: contractSurfaceCoversRemoteSiteTools,
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
  const configFile = await readLocal("core/config.js");

  const activeModules = [
    { file: "core/tools_index.js", register: "registerIndexTools", category: "index tools" },
    { file: "core/tools_fs.js", register: "registerFsTools", category: "filesystem tools" },
    { file: "core/science_tools.js", register: "registerScienceTools", category: "science tools" },
    { file: "core/code_tools_safe.js", register: "registerCodeTools", category: "connector-safe code tools" },
    { file: "core/registry_tools_safe.js", register: "registerRegistryTools", category: "connector-safe registry tools" },
    { file: "core/web_tools.js", register: "registerWebTools", category: "web tools" },
    { file: "core/truth_tools.js", register: "registerTruthTools", category: "truth tools" },
    { file: "core/process_tools_safe.js", register: "registerProcessTools", category: "process tools" },
    { file: "core/remote_site_tools.js", register: "registerRemoteSiteTools", category: "remote site tools" },
  ];

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
    {
      test_file: "tests/process_tools_safe.test.js",
      covers: ["core/process_tools_safe.js", "server_tools.js", "run_process", "process_runner_status"],
      kind: "tool contract + handler baseline",
    },
    {
      test_file: "tests/remote_site_tools.test.js",
      covers: ["core/remote_site_tools.js", "server_tools.js", "list_remote_site_files", "remote_site_runtime_status", "preview_remote_site_retention"],
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

export function registerTruthAuditTools(server) {
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
}
