import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const registryFile = fs.readFileSync("core/registry_tools_safe.js", "utf8");

test("registry v3 exposes validate_tool", () => {
  assert.match(registryFile, /tool_registry_validate_tool/);
});

test("registry v3 validate_tool uses explicit flat schema", () => {
  assert.match(registryFile, /tool: TOOL_NAME_SCHEMA/);
  assert.match(registryFile, /TOOL_NAME_SCHEMA = z\.string\(\)\.min\(1\)\.max\(80\)\.regex/);
  assert.doesNotMatch(registryFile, /z\.any\(/);
  assert.doesNotMatch(registryFile, /z\.record\(/);
});

test("registry v3 remains read-only and does not dispatch", () => {
  assert.doesNotMatch(registryFile, /dispatchRegisteredTool/);
  assert.doesNotMatch(registryFile, /from "\.\/registry\/dispatch/);
  assert.doesNotMatch(registryFile, /apply_patch/);
  assert.doesNotMatch(registryFile, /write_file/);
  assert.doesNotMatch(registryFile, /edit_file_patch/);
});

test("registry v3 validation has explicit decision fields", () => {
  assert.match(registryFile, /allowed: true/);
  assert.match(registryFile, /allowed: false/);
  assert.match(registryFile, /reason: "tool_not_found"/);
  assert.match(registryFile, /reason: "tool_disabled"/);
});
