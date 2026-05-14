import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const serverTools = fs.readFileSync("server_tools.js", "utf8");

test("server_tools registers web tools module", () => {
  assert.match(serverTools, /moduleLoaders/);
  assert.match(serverTools, /moduleLoader\.register\(server\)/);
  assert.match(serverTools, /enabled_ids/);
});

