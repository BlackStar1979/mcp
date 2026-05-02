import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const registryFile = fs.readFileSync("core/registry_tools_safe.js", "utf8");
const serverTools = fs.readFileSync("server_tools.js", "utf8");

test("registry tools expose status and list only", () => {
  assert.match(registryFile, /tool_registry_status/);
  assert.match(registryFile, /tool_registry_list/);
});

test("registry tools use explicit empty input schemas", () => {
  const schemaMatches = registryFile.match(/inputSchema: z\.object\(\{\}\)\.strict\(\)/g) || [];
  assert.equal(schemaMatches.length, 2);
});

test("registry tools do not import or invoke runtime dispatcher", () => {
  assert.doesNotMatch(registryFile, /dispatchRegisteredTool/);
  assert.doesNotMatch(registryFile, /from "\.\/registry\/dispatch\.js"/);
  assert.doesNotMatch(registryFile, /from "\.\/registry\/dispatch"/);
});

test("registry tools do not expose apply_patch or mutation surface", () => {
  assert.doesNotMatch(registryFile, /apply_patch/);
  assert.doesNotMatch(registryFile, /edit_file_patch/);
  assert.doesNotMatch(registryFile, /write_file/);
});

test("server registers registry safe module", () => {
  assert.match(serverTools, /registry_tools_safe\.js/);
  assert.match(serverTools, /registerRegistryTools\(server\)/);
});
