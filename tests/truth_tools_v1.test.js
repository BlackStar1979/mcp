import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerTruthTools } from "../core/truth_tools.js";

const truthTools = fs.readFileSync("core/truth_tools.js", "utf8");
const serverTools = fs.readFileSync("server_tools.js", "utf8");

test("truth tools expose project_truth_audit with explicit outputSchema", () => {
  assert.match(truthTools, /"project_truth_audit"/);
  assert.match(truthTools, /outputSchema:\s*PROJECT_TRUTH_AUDIT_OUTPUT/);
  assert.match(truthTools, /inputSchema:\s*z\.object\(\{\}\)\.strict\(\)/);
});

test("truth tools expose code_runtime_map with explicit outputSchema", () => {
  assert.match(truthTools, /"code_runtime_map"/);
  assert.match(truthTools, /outputSchema:\s*CODE_RUNTIME_MAP_OUTPUT/);
  assert.match(truthTools, /description:\s*"Map active runtime entrypoints, registered modules, protected boundaries, legacy\/staging areas, and key test-to-runtime links\."/);
});

test("truth tools expose deploy_decision_guard with explicit outputSchema", () => {
  assert.match(truthTools, /"deploy_decision_guard"/);
  assert.match(truthTools, /outputSchema:\s*DEPLOY_DECISION_GUARD_OUTPUT/);
  assert.match(truthTools, /classification:\s*z\.enum\(\["repo_only", "test_only", "runtime", "runtime_with_client_refresh"\]\)/);
});

test("truth tools expose change_workflow_simulator with explicit outputSchema", () => {
  assert.match(truthTools, /"change_workflow_simulator"/);
  assert.match(truthTools, /outputSchema:\s*CHANGE_WORKFLOW_SIMULATOR_OUTPUT/);
  assert.match(truthTools, /operator_actions:\s*z\.array\(z\.string\(\)\)/);
  assert.match(truthTools, /validation_steps:\s*z\.array\(z\.string\(\)\)/);
});

test("truth tools expose tool_usage_snapshot with explicit outputSchema", () => {
  assert.match(truthTools, /"tool_usage_snapshot"/);
  assert.match(truthTools, /outputSchema:\s*TOOL_USAGE_SNAPSHOT_OUTPUT/);
  assert.match(truthTools, /source_log:\s*z\.string\(\)/);
  assert.match(truthTools, /web_tool_counts:\s*z\.array\(/);
});


test("truth tools use platform-safe runtime path joins", () => {
  assert.match(truthTools, /import\s+path\s+from\s+"node:path"/);
  assert.match(truthTools, /path\.join\(RUNTIME_DIR, \.\.\.segments\)/);
  assert.doesNotMatch(truthTools, /RUNTIME_DIR}\\\\\$\{relativePath/);
});
test("project_truth_audit is read-only and local-world", () => {
  assert.match(truthTools, /readOnlyHint:\s*true/);
  assert.match(truthTools, /destructiveHint:\s*false/);
  assert.match(truthTools, /openWorldHint:\s*false/);
});

test("server_tools registers truth tools module", () => {
  assert.match(serverTools, /import\("\.\/core\/truth_tools\.js"\)/);
  assert.match(serverTools, /registerTruthTools\(server\)/);
});

test("project_truth_audit handler returns healthy baseline on current repo", async () => {
  let captured;
  const server = {
    registerTool(name, config, handler) {
      if (name === "project_truth_audit") captured = { name, config, handler };
    },
  };

  registerTruthTools(server);
  assert.equal(captured.name, "project_truth_audit");

  const result = await captured.handler({});
  const payload = result.structuredContent || result;

  assert.equal(payload.status, "ok");
  assert.equal(payload.docs_truth.current_state_matches_runtime, true);
  assert.equal(payload.docs_truth.runtime_contracts_matches_runtime, true);
  assert.equal(payload.test_truth.contract_surface_covers_web_tools, true);
  assert.equal(payload.test_truth.contract_surface_covers_process_tools, true);
  assert.equal(payload.test_truth.contract_surface_covers_remote_site_tools, true);
  assert.equal(payload.test_truth.registry_execute_reads_runtime_source, true);
  assert.equal(payload.test_truth.registry_outputschema_covers_execute, true);
  assert.equal(payload.deploy_truth.deploy_prepare_execute_present, true);
  assert.equal(payload.deploy_truth.rollback_script_present, true);
  assert.deepEqual(payload.drifts, []);
});

test("code_runtime_map handler returns active runtime mapping baseline", async () => {
  let captured;
  const server = {
    registerTool(name, config, handler) {
      if (name === "code_runtime_map") captured = { name, config, handler };
    },
  };

  registerTruthTools(server);
  assert.equal(captured.name, "code_runtime_map");

  const result = await captured.handler({});
  const payload = result.structuredContent || result;

  assert.equal(payload.status, "ok");
  assert.ok(payload.entrypoints.some((item) => item.file === "server_tools.js"));
  assert.ok(payload.server_tools_runtime.active_groups.includes("truth tools"));
  assert.ok(payload.server_tools_runtime.active_groups.includes("process tools"));
  assert.ok(payload.server_tools_runtime.active_groups.includes("remote site tools"));
  assert.ok(payload.server_tools_runtime.active_groups.includes("web tools"));
  assert.ok(payload.legacy_and_staging.legacy_files.includes("core/code_tools.js"));
  assert.ok(payload.test_runtime_links.some((item) => item.test_file === "tests/truth_tools_v1.test.js"));
  assert.ok(payload.test_runtime_links.some((item) => item.test_file === "tests/process_tools_safe.test.js"));
  assert.ok(payload.test_runtime_links.some((item) => item.test_file === "tests/remote_site_tools.test.js"));
});

test("deploy_decision_guard classifies repo-only docs and tests change", async () => {
  let captured;
  const server = {
    registerTool(name, config, handler) {
      if (name === "deploy_decision_guard") captured = { name, config, handler };
    },
  };

  registerTruthTools(server);
  assert.equal(captured.name, "deploy_decision_guard");

  const result = await captured.handler({
    changed_paths: ["docs/CURRENT_STATE.md", "tests/truth_tools_v1.test.js"],
    descriptor_change: false,
    schema_change: false,
    tool_surface_change: false,
  });
  const payload = result.structuredContent || result;

  assert.equal(payload.classification, "repo_only");
  assert.equal(payload.requires_manifest, false);
  assert.equal(payload.requires_restart_mcp, false);
  assert.equal(payload.requires_client_refresh, false);
});

test("deploy_decision_guard classifies runtime tool-surface change", async () => {
  let captured;
  const server = {
    registerTool(name, config, handler) {
      if (name === "deploy_decision_guard") captured = { name, config, handler };
    },
  };

  registerTruthTools(server);
  const result = await captured.handler({
    changed_paths: ["core/truth_tools.js", "server_tools.js"],
    descriptor_change: true,
    schema_change: true,
    tool_surface_change: true,
  });
  const payload = result.structuredContent || result;

  assert.equal(payload.classification, "runtime_with_client_refresh");
  assert.equal(payload.requires_manifest, true);
  assert.equal(payload.requires_prepare_execute, true);
  assert.equal(payload.requires_restart_mcp, true);
  assert.equal(payload.requires_client_refresh, true);
  assert.ok(payload.workflow.includes("deploy.ps1 -Mode Prepare"));
});

test("change_workflow_simulator returns short repo-only workflow", async () => {
  let captured;
  const server = {
    registerTool(name, config, handler) {
      if (name === "change_workflow_simulator") captured = { name, config, handler };
    },
  };

  registerTruthTools(server);
  assert.equal(captured.name, "change_workflow_simulator");

  const result = await captured.handler({
    changed_paths: ["docs/CURRENT_STATE.md", "tests/truth_tools_v1.test.js"],
    descriptor_change: false,
    schema_change: false,
    tool_surface_change: false,
  });
  const payload = result.structuredContent || result;

  assert.equal(payload.classification, "repo_only");
  assert.equal(payload.requires_manifest, false);
  assert.equal(payload.requires_restart_mcp, false);
  assert.equal(payload.requires_client_refresh, false);
  assert.ok(payload.deployment_steps.includes("no deploy pipeline required"));
  assert.ok(payload.post_steps.includes("commit"));
  assert.equal(payload.operator_actions.length, 0);
});

test("change_workflow_simulator returns runtime-with-refresh workflow", async () => {
  let captured;
  const server = {
    registerTool(name, config, handler) {
      if (name === "change_workflow_simulator") captured = { name, config, handler };
    },
  };

  registerTruthTools(server);

  const result = await captured.handler({
    changed_paths: ["core/truth_tools.js", "server_tools.js"],
    descriptor_change: true,
    schema_change: true,
    tool_surface_change: true,
  });
  const payload = result.structuredContent || result;

  assert.equal(payload.classification, "runtime_with_client_refresh");
  assert.equal(payload.requires_manifest, true);
  assert.equal(payload.requires_prepare_execute, true);
  assert.equal(payload.requires_restart_mcp, true);
  assert.equal(payload.requires_client_refresh, true);
  assert.ok(payload.operator_actions.includes("run Prepare"));
  assert.ok(payload.operator_actions.includes("restart MCP"));
  assert.ok(payload.operator_actions.includes("refresh client connector"));
  assert.ok(payload.deployment_steps.includes("deploy.ps1 -Mode Execute"));
});

test("tool_usage_snapshot summarizes observed tool usage from perf log", async () => {
  let captured;
  const server = {
    registerTool(name, config, handler) {
      if (name === "tool_usage_snapshot") captured = { name, config, handler };
    },
  };

  registerTruthTools(server);
  assert.equal(captured.name, "tool_usage_snapshot");

  const result = await captured.handler({});
  const payload = result.structuredContent || result;

  assert.equal(payload.status, "ok");
  assert.equal(payload.source_log, ".mcp_perf.log");
  assert.ok(payload.total_tool_invocations >= 0);
  assert.ok(payload.unique_tool_count >= 0);
  assert.ok(payload.top_tools.length >= 0);
  assert.ok(payload.family_counts.truth_tools >= 0);
  assert.ok(payload.family_counts.process_tools >= 0);
  assert.ok(payload.notes.some((item) => item.includes("truth tools dominate") || item.includes("web/research usage is currently bounded") || item.includes("no evidence of demand") || item.includes("perf log is not present")));
  if (payload.total_tool_invocations > 0) {
    assert.ok(payload.web_tool_counts.some((item) => item.name === "fetch_github_file" || item.name === "check_npm_package" || item.name === "http_get"));
  }
});




