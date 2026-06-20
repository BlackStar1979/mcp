import assert from "node:assert/strict";
import test from "node:test";

import { registerRegistryTools } from "../core/registry_tools_safe.js";

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
