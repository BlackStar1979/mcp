import fs from "node:fs/promises";
import { z } from "zod";

import { BASE_DIR } from "./config.js";
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
  return fs.readFile(`${BASE_DIR}\\${relativePath.replaceAll("/", "\\")}`, "utf8");
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
    repo_root: BASE_DIR,
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
}
