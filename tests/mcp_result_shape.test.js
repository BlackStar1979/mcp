import assert from "node:assert/strict";
import test from "node:test";

import { ok, textOk, fail, registerSafeTool } from "../core/responses.js";

function isValidContentArray(content) {
  return Array.isArray(content) && content.every(x => x && x.type === "text" && typeof x.text === "string");
}

test("ok() produces valid MCP result shape", () => {
  const data = { a: 1, b: "x" };
  const res = ok(data);

  assert.ok(isValidContentArray(res.content), "ok(): invalid content array");
  assert.deepEqual(res.structuredContent, data, "ok(): structuredContent mismatch");
  assert.ok(!("isError" in res), "ok(): must not set isError");
  assert.equal(res.content[0].text.includes("\"a\""), false, "ok(): content must not mirror full JSON by default");
  assert.match(res.content[0].text, /^OK\./, "ok(): content should stay presentation-oriented");
});

test("textOk() enforces structuredContent.text", () => {
  const res = textOk("hello", { extra: 1 });

  assert.ok(isValidContentArray(res.content));
  assert.equal(res.structuredContent.text, "hello");
  assert.equal(res.structuredContent.extra, 1);
});

test("fail() produces error contract", () => {
  const res = fail("boom", { code: 123 });

  assert.ok(isValidContentArray(res.content));
  assert.equal(res.isError, true, "fail(): must set isError=true");
  assert.equal(res.structuredContent.status, "error");
  assert.equal(res.structuredContent.message, "boom");
  assert.deepEqual(res.structuredContent.details, { code: 123 });
  assert.equal(res.content[0].text, "boom");
  assert.equal(res.content[0].text.trim().startsWith("{"), false, "fail(): content must not mirror full JSON by default");
});

test("registerSafeTool wraps plain object results into structuredContent-first shape", async () => {
  const captured = {};
  const server = {
    registerTool(name, config, handler) {
      captured.name = name;
      captured.config = config;
      captured.handler = handler;
    },
  };

  registerSafeTool(server, "demo_tool", {
    title: "Demo tool",
    description: "Demo tool for result-shape normalization.",
    inputSchema: {},
    outputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => ({ status: "ok", value: 7 }));

  const result = await captured.handler({});

  assert.equal(captured.name, "demo_tool");
  assert.ok(isValidContentArray(result.content));
  assert.deepEqual(result.structuredContent, { status: "ok", value: 7 });
  assert.equal(result.content[0].text, "Status: ok.");
});
