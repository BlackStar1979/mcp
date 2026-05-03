import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const registryFile = fs.readFileSync("core/registry_tools_safe.js", "utf8");

test("registry v7 exposes execute dry-run tool", () => {
  assert.match(registryFile, /tool_registry_execute/);
  assert.match(registryFile, /executeDecision\(/);
});

test("registry v7 execute uses explicit outputSchema", () => {
  assert.match(registryFile, /const REGISTRY_EXECUTE_TOOL_OUTPUT = z\.object/);
  assert.match(registryFile, /tool_registry_execute[\s\S]*outputSchema:\s*REGISTRY_EXECUTE_TOOL_OUTPUT/);
});

test("registry v7 execute remains simulation-only", () => {
  assert.match(registryFile, /dispatch_enabled:\s*false/);
  assert.match(registryFile, /execution_enabled:\s*false/);
  assert.match(registryFile, /simulated_execution:\s*true/);
  assert.doesNotMatch(registryFile, /tool_registry_execute[\s\S]*dispatch\(/);
  assert.doesNotMatch(registryFile, /tool_registry_execute[\s\S]*execFile/);
  assert.doesNotMatch(registryFile, /tool_registry_execute[\s\S]*writeFile/);
});

test("registry v7 execute requires plan_ready true in success path", () => {
  assert.match(registryFile, /plan_ready:\s*true/);
});
