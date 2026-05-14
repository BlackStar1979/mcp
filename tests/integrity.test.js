import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("server_tools imports are redirected to core", () => {
  const content = fs.readFileSync("core/server_tools_bootstrap.js", "utf8");

  assert.match(content, /\.\/core\/tools_fs\.js/);
  assert.match(content, /\.\/core\/code_tools_safe\.js/);
  assert.match(content, /\.\/core\/registry_tools_safe\.js/);
});

test("no legacy root-level imports remain", () => {
  const content = fs.readFileSync("server_tools.js", "utf8");

  assert.equal(content.includes("./config.js"), false);
  assert.equal(content.includes("./tools_fs.js"), false);
});
