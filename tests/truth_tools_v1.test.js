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

test("project_truth_audit is read-only and local-world", () => {
  assert.match(truthTools, /readOnlyHint:\s*true/);
  assert.match(truthTools, /destructiveHint:\s*false/);
  assert.match(truthTools, /openWorldHint:\s*false/);
});

test("server_tools registers truth tools module", () => {
  assert.match(serverTools, /import\s+\{\s*registerTruthTools\s*\}\s+from\s+"\.\/core\/truth_tools\.js"/);
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
  assert.ok(payload.server_tools_runtime.active_groups.includes("web tools"));
  assert.ok(payload.legacy_and_staging.legacy_files.includes("core/code_tools.js"));
  assert.ok(payload.test_runtime_links.some((item) => item.test_file === "tests/truth_tools_v1.test.js"));
});
