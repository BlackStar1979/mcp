import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const registryFile = fs.readFileSync("core/registry_tools_safe.js", "utf8");
const serverTools = fs.readFileSync("server_tools.js", "utf8");

test("registry v1c baseline includes status and list tools", () => {
  assert.match(registryFile, /tool_registry_status/);
  assert.match(registryFile, /tool_registry_list/);
});

test("registry v1c baseline keeps explicit empty input schemas for status and list", () => {
  const schemaMatches = registryFile.match(/inputSchema: z\.object\(\{\}\)\.strict\(\)/g) || [];
  assert.equal(schemaMatches.length, 2);
});

test("registry v1c baseline does not import or invoke runtime dispatcher", () => {
  assert.doesNotMatch(registryFile, /dispatchRegisteredTool/);
  assert.doesNotMatch(registryFile, /from "\.\/registry\/dispatch\.js"/);
  assert.doesNotMatch(registryFile, /from "\.\/registry\/dispatch"/);
});

test("registry v1c baseline does not expose apply_patch or mutation surface", () => {
  assert.doesNotMatch(registryFile, /apply_patch/);
  assert.doesNotMatch(registryFile, /edit_file_patch/);
  assert.doesNotMatch(registryFile, /write_file/);
});

test("server registers registry safe module", () => {
  assert.match(serverTools, /enabledModules\.map/);
  assert.match(serverTools, /moduleLoader\.register\(server\)/);
});
