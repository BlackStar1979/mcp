import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("core/registry_tools_safe.js", "utf8");

test("registry v5 exposes preflight", () => {
  assert.match(src, /tool_registry_preflight/);
});

test("registry v5 does not dispatch", () => {
  assert.doesNotMatch(src, /dispatchRegisteredTool/);
});

test("registry v5 uses operation field", () => {
  assert.match(src, /operation/);
});
