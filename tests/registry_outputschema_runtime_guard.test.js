import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const registryFile = fs.readFileSync("core/registry_tools_safe.js", "utf8");

test("registry outputSchema avoids runtime-unsupported broad schema constructs", () => {
  assert.doesNotMatch(registryFile, /z\.any\(/);
  assert.doesNotMatch(registryFile, /z\.record\(/);
  assert.doesNotMatch(registryFile, /outputSchema:\s*z\.union\(/);
  assert.doesNotMatch(registryFile, /const\s+\w*OUTPUT\w*\s*=\s*z\.union\(/);
});

test("registry outputSchema rollout includes runtime-verified registry tools", () => {
  assert.match(registryFile, /tool_registry_status[\s\S]*outputSchema:\s*REGISTRY_STATUS_TOOL_OUTPUT/);
  assert.match(registryFile, /tool_registry_list[\s\S]*outputSchema:\s*REGISTRY_LIST_TOOL_OUTPUT/);
  assert.match(registryFile, /tool_registry_get_tool[\s\S]*outputSchema:\s*REGISTRY_GET_TOOL_OUTPUT/);
  assert.match(registryFile, /tool_registry_validate_tool[\s\S]*outputSchema:\s*REGISTRY_VALIDATE_TOOL_OUTPUT/);
  assert.match(registryFile, /tool_registry_policy[\s\S]*outputSchema:\s*REGISTRY_POLICY_TOOL_OUTPUT/);
  assert.match(registryFile, /tool_registry_plan[\s\S]*outputSchema:\s*REGISTRY_PLAN_TOOL_OUTPUT/);
});
