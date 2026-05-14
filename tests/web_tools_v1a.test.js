import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";

const facadeSrc = fs.readFileSync("core/web_tools.js", "utf-8");
const runtimeSrc = fs.readFileSync("core/web/runtime.js", "utf-8");
const httpSrc = fs.readFileSync("core/web/http_tools.js", "utf-8");
const packageSrc = fs.readFileSync("core/web/package_tools.js", "utf-8");
const githubSrc = fs.readFileSync("core/web/github_tools.js", "utf-8");
const src = [facadeSrc, runtimeSrc, httpSrc, packageSrc, githubSrc].join("\n");

test("web_tools_v1a has no forbidden schema constructs", () => {
  assert.ok(!/z\.any\(/.test(src));
  assert.ok(!/z\.unknown\(/.test(src));
});

test("web_tools_v1a exposes outputSchema for tools", () => {
  assert.match(httpSrc, /http_get[\s\S]*outputSchema:\s*HTTP_GET_OUTPUT/);
  assert.match(packageSrc, /pypi_info[\s\S]*outputSchema:\s*PYPI_PACKAGE_OUTPUT/);
  assert.match(packageSrc, /check_pypi_package[\s\S]*outputSchema:\s*PYPI_PACKAGE_OUTPUT/);
  assert.match(packageSrc, /check_npm_package[\s\S]*outputSchema:\s*NPM_PACKAGE_OUTPUT/);
  assert.match(githubSrc, /fetch_github_file[\s\S]*outputSchema:\s*GITHUB_FILE_OUTPUT/);
});

test("web_tools_v1c parses PyPI JSON from full bounded text", () => {
  assert.match(src, /const parsed = JSON\.parse\(result\.fullText\)/);
  assert.doesNotMatch(src, /const parsed = JSON\.parse\(result\.text\)/);
  assert.match(src, /status: "payload_too_large"/);
});

test("web_tools_v1d uses bounded npm latest endpoint", () => {
  assert.match(packageSrc, /https:\/\/registry\.npmjs\.org\/\$\{encodeURIComponent\(packageName\)\}\/latest/);
});

test("web_tools_v1e uses raw github content endpoint with structured segments", () => {
  assert.match(githubSrc, /raw\.githubusercontent\.com/);
  assert.match(githubSrc, /https:\/\/raw\.githubusercontent\.com\/\$\{owner\}\/\$\{repo\}\/\$\{ref\}\/\$\{path\}/);
  assert.doesNotMatch(githubSrc, /github\.com\/.*\/blob\//);
});
