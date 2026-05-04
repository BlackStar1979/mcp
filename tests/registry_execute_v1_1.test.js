import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(".mcp_warzone/registry_tools_execute_v1_1.js", "utf8");

test("registry execute v1.1 declares execution envelope output fields", () => {
  assert.match(src, /execution_mode:\s*z\.string\(\)/);
  assert.match(src, /execution_id:\s*z\.string\(\)/);
  assert.match(src, /plan_hash:\s*z\.string\(\)/);
});

test("registry execute v1.1 accepts explicit execution_mode input", () => {
  assert.match(src, /const EXECUTION_MODE_SCHEMA = z\.enum\(\["simulation", "real"\]\)/);
  assert.match(src, /execution_mode:\s*EXECUTION_MODE_SCHEMA\.optional\(\)/);
  assert.match(src, /execution_mode = "simulation"/);
});

test("registry execute v1.1 blocks real execution mode", () => {
  assert.match(src, /if \(executionMode === "real"\)/);
  assert.match(src, /reason:\s*"execution_not_enabled"/);
  assert.match(src, /execution_enabled:\s*false/);
});

test("registry execute v1.1 creates deterministic plan hash and execution id", () => {
  assert.match(src, /function stableStringify\(value\)/);
  assert.match(src, /function simpleHash\(input\)/);
  assert.match(src, /function planHash\(plan\)/);
  assert.match(src, /function executionId\(registryId, toolName, operation, hash\)/);
  assert.match(src, /plan_hash:\s*hash/);
  assert.match(src, /execution_id:\s*id/);
});

test("registry execute v1.1 audits execution envelope fields", () => {
  assert.match(src, /execution_mode:\s*result\.execution_mode/);
  assert.match(src, /execution_id:\s*result\.execution_id/);
  assert.match(src, /plan_hash:\s*result\.plan_hash/);
  assert.match(src, /simulated_execution:\s*result\.simulated_execution/);
});

test("registry execute v1.1 remains non-dispatching and non-mutating", () => {
  assert.match(src, /dispatch_enabled:\s*false/);
  assert.match(src, /execution_enabled:\s*false/);
  assert.doesNotMatch(src, /tool_registry_execute[\s\S]*dispatch\(/);
  assert.doesNotMatch(src, /tool_registry_execute[\s\S]*execFile/);
  assert.doesNotMatch(src, /tool_registry_execute[\s\S]*writeFile/);
});
