import assert from "node:assert/strict";
import test from "node:test";

import { registerConnectorTools } from "../core/connector_tools.js";

function captureConnectorTools() {
  const tools = new Map();
  const server = {
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
  };

  registerConnectorTools(server);
  return tools;
}

test("connector module exposes only search and fetch", () => {
  const tools = captureConnectorTools();
  assert.deepEqual([...tools.keys()].sort(), ["fetch", "search"]);
});

test("connector tools keep the full OpenAI-relevant read-only annotation quartet", () => {
  const tools = captureConnectorTools();
  for (const name of ["search", "fetch"]) {
    const a = tools.get(name).config.annotations;
    assert.equal(a.readOnlyHint, true);
    assert.equal(a.destructiveHint, false);
    assert.equal(a.idempotentHint, true);
    assert.equal(a.openWorldHint, false);
  }
});

test("connector tools declare outputSchema", () => {
  const tools = captureConnectorTools();
  assert.ok(tools.get("search").config.outputSchema);
  assert.ok(tools.get("fetch").config.outputSchema);
});

test("connector search uses presentation summary instead of JSON mirror", async () => {
  const tools = captureConnectorTools();
  const result = await tools.get("search").handler({ query: "" });

  assert.equal(result.content[0].text, "OK. structuredContent exposes 1 field.");
  assert.deepEqual(result.structuredContent, { results: [] });
  assert.equal(result.content[0].text.trim().startsWith("{"), false);
});

test("connector fetch keeps file text in content and structuredContent.text", async () => {
  const tools = captureConnectorTools();
  const result = await tools.get("fetch").handler({ id: "mcp/package.json" });

  assert.equal(typeof result.content[0].text, "string");
  assert.equal(result.content[0].text.includes("\"name\": \"mcp\""), true);
  assert.equal(result.structuredContent.text.includes("\"name\": \"mcp\""), true);
  assert.equal(result.structuredContent.id, "mcp/package.json");
  assert.equal(result.structuredContent.metadata.source, "local_filesystem");
});

test("connector tools return controlled MCP error results", async () => {
  const tools = captureConnectorTools();
  const result = await tools.get("fetch").handler({ id: "mcp/package.json/not-a-file" });

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.status, "error");
  assert.equal(result.structuredContent.details.tool, "fetch");
});
