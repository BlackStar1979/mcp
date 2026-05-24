import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const serverSource = fs.readFileSync("server.js", "utf8");

test("server.js exports createServer for the production read-only runtime path", () => {
  assert.match(serverSource, /export function createServer\(\)/);
});

test("server.js declares outputSchema for all read-only tools", () => {
  for (const [name, schemaName] of [
    ["search", "SEARCH_OUTPUT"],
    ["fetch", "FETCH_OUTPUT"],
    ["list_directory", "LIST_DIRECTORY_OUTPUT"],
    ["read_file", "READ_FILE_OUTPUT"],
    ["get_info", "FILE_INFO_OUTPUT"],
  ]) {
    assert.match(serverSource, new RegExp(`"${name}"[\\s\\S]*outputSchema:\\s*${schemaName}`), `${name}: missing outputSchema`);
  }
});

test("server.js read-only annotations keep the full OpenAI-relevant quartet", () => {
  assert.match(serverSource, /readOnlyHint:\s*true/);
  assert.match(serverSource, /destructiveHint:\s*false/);
  assert.match(serverSource, /idempotentHint:\s*true/);
  assert.match(serverSource, /openWorldHint:\s*false/);
});
