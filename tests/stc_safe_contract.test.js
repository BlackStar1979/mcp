import assert from "node:assert/strict";
import test from "node:test";

import {
  CONNECTOR_SHAPE_VERSION,
  createConnectorSafeRuntime,
} from "../core/stc_safe_runtime.js";

const FIXTURE_DOCS = [
  {
    id: "docs/current-state",
    title: "Current State",
    text: "Cloudflare Access current state and connector-safe response shape.",
    metadata: { source: "mcp", kind: "repo-doc" },
  },
  {
    id: "docs/runtime-contracts",
    title: "Runtime Contracts",
    text: "Strict connector-safe contract with HTTPS-only public URLs. ".repeat(200),
    metadata: { source: "mcp", kind: "repo-doc" },
  },
];

function createFixtureRuntime() {
  return createConnectorSafeRuntime({
    docs: FIXTURE_DOCS,
    publicBaseUrl: "https://mcp-connector-safe.romionologic.dev",
  });
}

async function callTool(runtime, name, args) {
  const response = await runtime.handleRpcMessage({
    jsonrpc: "2.0",
    id: "test-id",
    method: "tools/call",
    params: {
      name,
      arguments: args,
    },
  });

  return response.result;
}

test("connector search shape is strict", async () => {
  const runtime = createFixtureRuntime();
  const result = await callTool(runtime, "search", { query: "connector shape" });

  assert.equal(Object.hasOwn(result, "structuredContent"), true);
  assert.equal(Array.isArray(result.content), true);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(result.content[0].text.trim().startsWith("{"), true);

  const parsed = JSON.parse(result.content[0].text);
  assert.deepEqual(result.structuredContent, parsed);
  assert.equal(Array.isArray(parsed.results), true);

  for (const item of parsed.results) {
    assert.deepEqual(Object.keys(item).sort(), ["id", "title", "url"]);
    assert.equal(Object.keys(item).length, 3);
    assert.equal(typeof item.id, "string");
    assert.equal(typeof item.title, "string");
    assert.equal(typeof item.url, "string");
    assert.match(item.url, /^https:\/\//);
    assert.equal(item.url.includes("127.0.0.1"), false);
    assert.equal(item.url.includes("localhost"), false);
    assert.equal(item.url.startsWith("file://"), false);
    assert.equal(item.url.startsWith("http://"), false);
  }
});

test("connector fetch shape is strict", async () => {
  const runtime = createFixtureRuntime();
  const result = await callTool(runtime, "fetch", { id: "docs/current-state" });

  assert.equal(Object.hasOwn(result, "structuredContent"), true);
  assert.equal(Array.isArray(result.content), true);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(result.content[0].text.trim().startsWith("{"), true);

  const parsed = JSON.parse(result.content[0].text);
  assert.deepEqual(result.structuredContent, parsed);

  for (const key of ["id", "title", "text", "url", "metadata"]) {
    assert.equal(Object.hasOwn(parsed, key), true);
  }

  assert.equal(typeof parsed.id, "string");
  assert.equal(typeof parsed.title, "string");
  assert.equal(typeof parsed.text, "string");
  assert.equal(typeof parsed.url, "string");
  assert.equal(typeof parsed.metadata, "object");
  for (const key of ["source", "kind", "connectorShapeVersion", "truncated", "original_chars", "cap_chars"]) {
    assert.equal(Object.hasOwn(parsed.metadata, key), true);
  }
  assert.match(parsed.url, /^https:\/\//);
  assert.equal(parsed.url.includes("127.0.0.1"), false);
  assert.equal(parsed.url.includes("localhost"), false);
  assert.equal(parsed.url.startsWith("file://"), false);
  assert.equal(parsed.url.startsWith("http://"), false);
});

test("connector fetch caps text and exposes cap metadata", async () => {
  const runtime = createFixtureRuntime();
  const result = await callTool(runtime, "fetch", { id: "docs/runtime-contracts" });
  const parsed = JSON.parse(result.content[0].text);

  assert.equal(parsed.metadata.connectorShapeVersion, CONNECTOR_SHAPE_VERSION);
  assert.equal(parsed.metadata.cap_chars, 2500);
  assert.equal(parsed.metadata.original_chars > parsed.metadata.cap_chars, true);
  assert.equal(parsed.metadata.truncated, true);
  assert.equal(parsed.text.length, parsed.metadata.cap_chars);
});

test("connector shape version is exposed", () => {
  const runtime = createFixtureRuntime();
  const health = runtime.healthPayload();
  assert.equal(health.connectorShapeVersion, CONNECTOR_SHAPE_VERSION);
});

test("connector-safe runtime does not register mutation tools", async () => {
  const runtime = createFixtureRuntime();
  const response = await runtime.handleRpcMessage({
    jsonrpc: "2.0",
    id: "test-id",
    method: "tools/list",
    params: {},
  });
  const names = response.result.tools.map((tool) => tool.name).sort();

  assert.deepEqual(names, ["fetch", "search"]);

  for (const forbidden of [
    "run_process",
    "write_file",
    "append_file",
    "copy_path",
    "move_path",
    "delete_path",
    "restore_path",
    "tool_registry_execute",
  ]) {
    assert.equal(names.includes(forbidden), false);
  }
});

test("connector-safe descriptors expose outputSchema", async () => {
  const runtime = createFixtureRuntime();
  const response = await runtime.handleRpcMessage({
    jsonrpc: "2.0",
    id: "test-id",
    method: "tools/list",
    params: {},
  });

  for (const tool of response.result.tools) {
    assert.equal(typeof tool.outputSchema, "object");
  }
});
