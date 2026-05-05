import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";

// static guard: no forbidden patterns, schemas present
const src = fs.readFileSync("core/web_tools.js", "utf-8");

test("web_tools_v1a has no forbidden schema constructs", () => {
  assert.ok(!/z\.any\(/.test(src));
  assert.ok(!/z\.unknown\(/.test(src));
});

test("web_tools_v1a exposes outputSchema for tools", () => {
  assert.match(src, /http_get[\s\S]*outputSchema:\s*HTTP_GET_OUTPUT/);
  assert.match(src, /pypi_info[\s\S]*outputSchema:\s*PYPI_PACKAGE_OUTPUT/);
  assert.match(src, /check_pypi_package[\s\S]*outputSchema:\s*PYPI_PACKAGE_OUTPUT/);
});

test("web_tools_v1c parses PyPI JSON from full bounded text", () => {
  assert.match(src, /const parsed = JSON\.parse\(result\.fullText\)/);
  assert.doesNotMatch(src, /const parsed = JSON\.parse\(result\.text\)/);
  assert.match(src, /status: "payload_too_large"/);
});
