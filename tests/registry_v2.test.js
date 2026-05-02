import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const registryFile = fs.readFileSync("core/registry_tools_safe.js", "utf8");

test("registry v2 exposes get_tool", () => {
  assert.match(registryFile, /tool_registry_get_tool/);
});

test("registry v2 get_tool uses explicit flat schema", () => {
  assert.match(registryFile, /const TOOL_NAME_SCHEMA = z\.string\(\)\.min\(1\)\.max\(80\)\.regex/);
  assert.match(registryFile, /tool: TOOL_NAME_SCHEMA/);
  assert.doesNotMatch(registryFile, /z\.any\(/);
  assert.doesNotMatch(registryFile, /z\.record\(/);
});

test("registry v2 remains read-only and does not dispatch", () => {
  assert.doesNotMatch(registryFile, /dispatchRegisteredTool/);
  assert.doesNotMatch(registryFile, /from "\.\/registry\/dispatch/);
  assert.doesNotMatch(registryFile, /apply_patch/);
  assert.doesNotMatch(registryFile, /write_file/);
  assert.doesNotMatch(registryFile, /edit_file_patch/);
});

test("registry v2 get_tool has not_found path", () => {
  assert.match(registryFile, /status: "not_found"/);
});
