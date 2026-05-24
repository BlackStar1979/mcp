import assert from "node:assert/strict";
import test from "node:test";

import { registerFsTools } from "../core/tools_fs.js";
import { registerRegistryTools } from "../core/registry_tools_safe.js";

function captureTools(registerFn) {
  const tools = new Map();
  const server = {
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
  };

  registerFn(server);
  return tools;
}

test("server_tools registry handler uses presentation-first content with structuredContent payload", async () => {
  const tools = captureTools(registerRegistryTools);
  const result = await tools.get("tool_registry_status").handler({});

  assert.equal(Array.isArray(result.content), true);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(result.content[0].text, "Status: ok.");
  assert.equal(result.content[0].text.trim().startsWith("{"), false);
  assert.equal(result.structuredContent.status, "ok");
  assert.equal(typeof result.structuredContent.registry, "object");
});

test("server_tools filesystem read handler keeps file text in content and structuredContent.text", async () => {
  const tools = captureTools(registerFsTools);
  const result = await tools.get("read_file").handler({ path: "mcp/package.json", max_chars: 4000 });

  assert.equal(Array.isArray(result.content), true);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.equal(result.content[0].text.includes("\"name\": \"mcp\""), true);
  assert.equal(result.structuredContent.text.includes("\"name\": \"mcp\""), true);
  assert.equal(result.structuredContent.path, "mcp/package.json");
  assert.equal(result.structuredContent.truncated, false);
});

test("server_tools filesystem read handler returns controlled MCP error results", async () => {
  const tools = captureTools(registerFsTools);
  const result = await tools.get("read_file").handler({ path: "mcp/package.json/not-a-file", max_chars: 4000 });

  assert.equal(result.isError, true);
  assert.equal(typeof result.content[0].text, "string");
  assert.ok(result.content[0].text.length > 0);
  assert.equal(result.structuredContent.status, "error");
  assert.equal(result.structuredContent.details.tool, "read_file");
});
