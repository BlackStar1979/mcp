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
      captured = { name, config, handler };
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
