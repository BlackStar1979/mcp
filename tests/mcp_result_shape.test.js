import assert from "node:assert/strict";
import test from "node:test";

import { ok, textOk, fail } from "../core/responses.js";

function isValidContentArray(content) {
  return Array.isArray(content) && content.every(x => x && x.type === "text" && typeof x.text === "string");
}

test("ok() produces valid MCP result shape", () => {
  const data = { a: 1, b: "x" };
  const res = ok(data);

  assert.ok(isValidContentArray(res.content), "ok(): invalid content array");
  assert.deepEqual(res.structuredContent, data, "ok(): structuredContent mismatch");
  assert.ok(!("isError" in res), "ok(): must not set isError");
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
});
