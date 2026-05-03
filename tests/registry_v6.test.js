import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("core/registry_tools_safe.js", "utf8");

test("registry v6 exposes plan tool", () => {
  assert.match(src, /tool_registry_plan/);
  assert.match(src, /function planDecision/);
});

test("registry v6 remains plan-only", () => {
  assert.match(src, /execution_enabled: false/);
  assert.match(src, /dispatch_enabled: false/);
  assert.doesNotMatch(src, /dispatchRegisteredTool/);
});

test("registry v6 has explicit plan_ready and blocked states", () => {
  assert.match(src, /status: "plan_ready"/);
  assert.match(src, /status: preflight\.status === "not_found" \? "not_found" : "blocked"/);
});

test("registry v6 plan uses explicit flat schema", () => {
  assert.match(src, /tool: TOOL_NAME_SCHEMA/);
  assert.match(src, /operation: OPERATION_SCHEMA/);
  assert.doesNotMatch(src, /z\.any\(/);
  assert.doesNotMatch(src, /z\.record\(/);
});
