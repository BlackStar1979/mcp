import assert from "node:assert/strict";
import test from "node:test";

import { registerRegistryTools } from "../core/registry_tools_safe.js";
import { createConnectorSafeRuntime } from "../core/stc_safe_runtime.js";

const FIXTURE_DOCS = [
  {
    id: "docs/current-state",
    title: "Current State",
    text: "Cloudflare Access current state and connector-safe response shape.",
    metadata: { source: "mcp", kind: "repo-doc" },
  },
];

function captureRegisteredTool(registerFn, toolName) {
  const tools = new Map();
  const server = {
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
  };

  registerFn(server);
  const tool = tools.get(toolName);
  assert.ok(tool, `expected tool to be registered: ${toolName}`);
  return tool;
}

async function callConnectorTool(runtime, name, args) {
  const response = await runtime.handleRpcMessage({
    jsonrpc: "2.0",
    id: "contract-check",
    method: "tools/call",
    params: {
      name,
      arguments: args,
    },
  });

  return response.result;
}

test("full MCP registered tool uses presentation-first content over structuredContent", async () => {
  const { handler } = captureRegisteredTool(registerRegistryTools, "tool_registry_status");
  const result = await handler({});

  assert.equal(Array.isArray(result.content), true);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(result.content[0].text, "Status: ok.");
  assert.equal(result.content[0].text.trim().startsWith("{"), false);
  assert.equal(result.structuredContent.status, "ok");
  assert.equal(typeof result.structuredContent.registry, "object");
});

test("connector-safe tool keeps JSON mirror in content and structuredContent", async () => {
  const runtime = createConnectorSafeRuntime({
    docs: FIXTURE_DOCS,
    publicBaseUrl: "https://mcp-stc-safe.romionologic.dev",
  });

  const result = await callConnectorTool(runtime, "search", { query: "current state" });

  assert.equal(Array.isArray(result.content), true);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(result.content[0].text.trim().startsWith("{"), true);

  const parsed = JSON.parse(result.content[0].text);
  assert.deepEqual(result.structuredContent, parsed);
  assert.equal(Array.isArray(parsed.results), true);
});
