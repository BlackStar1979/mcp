import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TESTS_DIR, "..");

async function readFromRepo(...relativeParts) {
  return fs.readFile(path.join(REPO_ROOT, ...relativeParts), "utf8");
}

test("server_tools keeps central perf wrappers for requests and tools", async () => {
  const source = await readFromRepo("server_tools.js");
  assert.match(source, /timeTool\(name, args, \(\) => handler\(args\)\)/);
  assert.match(source, /await timeRequest\(\{ method: req\.method, url: req\.url \}/);
});

test("index, science, and code tool groups contain audit logging", async () => {
  const indexSource = await readFromRepo("core", "tools_index.js");
  const scienceSource = await readFromRepo("core", "science_tools.js");
  const codeSource = [
    await readFromRepo("core", "code_tools_safe.js"),
    await readFromRepo("core", "code", "symbols_tools.js"),
    await readFromRepo("core", "code", "analysis_tools.js"),
  ].join("\n");

  for (const pattern of [
    /await audit\("index_status"/,
    /await audit\("build_index"/,
    /await audit\("search_index"/,
    /await audit\("search_index_context"/,
    /await audit\("collect_context"/,
    /await audit\("collect_romionsim_context"/,
  ]) {
    assert.match(indexSource, pattern);
  }

  for (const pattern of [
    /await audit\("inventory_tree"/,
    /await audit\("fits_info"/,
    /await audit\("hdf5_info"/,
    /await audit\("table_profile"/,
  ]) {
    assert.match(scienceSource, pattern);
  }

  for (const pattern of [
    /await audit\("code_symbols"/,
    /await audit\("code_dependencies"/,
    /await audit\("code_audit"/,
    /await audit\("code_impact"/,
  ]) {
    assert.match(codeSource, pattern);
  }
});

test("auth modules leave audit traces on denied requests", async () => {
  const accessSource = await readFromRepo("core", "auth.js");
  const bearerSource = await readFromRepo("core", "auth_bearer.js");

  assert.match(accessSource, /audit\("auth_access_denied"/);
  assert.match(bearerSource, /audit\("auth_bearer_error"/);
  assert.match(bearerSource, /audit\("auth_bearer_denied"/);
});
