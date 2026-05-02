import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const registryFile = fs.readFileSync("core/registry_tools_safe.js", "utf8");
const serverTools = fs.readFileSync("server_tools.js", "utf8");

test("registry status tool exists and is minimal", () => {
  assert.match(registryFile, /tool_registry_status/);
  assert.match(registryFile, /inputSchema: z.object\(\{\}\)\.strict\(\)/);
});

test("registry status tool does not import or invoke runtime dispatcher", () => {
  assert.doesNotMatch(registryFile, /dispatchRegisteredTool/);
  assert.doesNotMatch(registryFile, /from "\.\/registry\/dispatch\.js"/);
  assert.doesNotMatch(registryFile, /from "\.\/registry\/dispatch"/);
});

test("server registers registry status-only safe module", () => {
  assert.match(serverTools, /registry_tools_safe\.js/);
  assert.match(serverTools, /registerRegistryTools\(server\)/);
});
