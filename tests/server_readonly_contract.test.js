import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { registerReadonlyTools } from "../server.js";

const serverSource = fs.readFileSync("server.js", "utf8");

function captureReadonlyTools() {
  const tools = new Map();
  const server = {
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
  };

  registerReadonlyTools(server);
  return tools;
}

test("server.js exports createServer for the production read-only runtime path", () => {
  assert.match(serverSource, /export function createServer\(\)/);
  assert.match(serverSource, /export function registerReadonlyTools\(/);
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

test("server.js read-only search uses presentation summary instead of JSON mirror", async () => {
  const tools = captureReadonlyTools();
  const result = await tools.get("search").handler({ query: "" });

  assert.equal(result.content[0].text, "OK. structuredContent exposes 1 field.");
  assert.deepEqual(result.structuredContent, { results: [] });
  assert.equal(result.content[0].text.trim().startsWith("{"), false);
});

test("server.js read-only fetch keeps file text in content and structuredContent.text", async () => {
  const tools = captureReadonlyTools();
  const result = await tools.get("fetch").handler({ id: "mcp/package.json" });

  assert.equal(typeof result.content[0].text, "string");
  assert.equal(result.content[0].text.includes("\"name\": \"mcp\""), true);
  assert.equal(result.structuredContent.text.includes("\"name\": \"mcp\""), true);
  assert.equal(result.content[0].text.trim().startsWith("{"), true);
  assert.equal(result.structuredContent.id, "mcp/package.json");
});
