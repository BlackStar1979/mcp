import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const registryFile = fs.readFileSync("core/registry_tools_safe.js", "utf8");

test("registry v4 exposes policy tool", () => {
  assert.match(registryFile, /tool_registry_policy/);
});

test("registry v4 does not dispatch", () => {
  assert.doesNotMatch(registryFile, /dispatchRegisteredTool/);
});

test("registry v4 returns policy fields", () => {
  assert.match(registryFile, /runtime:/);
  assert.match(registryFile, /sandbox:/);
  assert.match(registryFile, /policy:/);
  assert.match(registryFile, /observability:/);
  assert.match(registryFile, /rollback:/);
});
