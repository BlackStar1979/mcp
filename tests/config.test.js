import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

import {
  BASE_DIR,
  RUNTIME_DIR,
  TRASH_DIR,
  BACKUP_DIR,
  INDEX_DIR,
  LOG_FILE,
  PERF_LOG_FILE,
  BLOCKED_TOP_LEVEL_DIRS,
  BLOCKED_PATH_PREFIXES,
  SKIPPED_SCAN_DIRS,
  PRIMARY_WORK_ROOT_ALIAS,
  WORK_ROOTS_ENV_VAR,
  buildWorkRoots,
  parseExtraWorkRoots,
  listWorkspaceRoots,
  workspaceAccessHint,
} from "../core/config.js";

test("workspace and runtime paths are split between C:\\Work and C:\\Work\\mcp", () => {
  assert.equal(BASE_DIR, path.resolve("C:\\Work"));
  assert.equal(RUNTIME_DIR, path.resolve("C:\\Work\\mcp"));
  assert.equal(TRASH_DIR, path.join(RUNTIME_DIR, ".mcp_trash"));
  assert.equal(BACKUP_DIR, path.join(RUNTIME_DIR, ".mcp_backups"));
  assert.equal(INDEX_DIR, path.join(RUNTIME_DIR, ".mcp_index"));
  assert.equal(LOG_FILE, path.join(RUNTIME_DIR, ".mcp_audit.log"));
  assert.equal(PERF_LOG_FILE, path.join(RUNTIME_DIR, ".mcp_perf.log"));
});

test("default workspace root model exposes primary alias and hint", () => {
  const roots = listWorkspaceRoots();
  assert.equal(PRIMARY_WORK_ROOT_ALIAS, "work");
  assert.equal(roots.length >= 1, true);
  assert.deepEqual(roots[0], {
    alias: "work",
    path: path.resolve("C:\\Work"),
    primary: true,
  });
  assert.match(workspaceAccessHint(), /Primary workspace root is C:\\Work/);
  assert.match(workspaceAccessHint(), /MCP_EXTRA_ROOTS/);
});

test("runtime protection remains enforced under mcp/ while workspace root expands to C:\\Work", () => {
  assert.equal(BLOCKED_TOP_LEVEL_DIRS.has("node_modules"), true);
  assert.equal(BLOCKED_TOP_LEVEL_DIRS.has("mcp"), false);
  assert.equal(BLOCKED_PATH_PREFIXES.has("mcp/core"), true);
  assert.equal(SKIPPED_SCAN_DIRS.has("node_modules"), true);
  assert.equal(SKIPPED_SCAN_DIRS.has(".mcp_warzone"), true);
});

test("extra workspace roots can be parsed and built without another redesign", () => {
  const raw = 'portfolio=C:\\Portfolio;thesis=C:\\Users\\mczyz\\Documents\\Praca licencjacka';
  assert.deepEqual(parseExtraWorkRoots(raw), [
    ["portfolio", path.resolve("C:\\Portfolio")],
    ["thesis", path.resolve("C:\\Users\\mczyz\\Documents\\Praca licencjacka")],
  ]);

  const roots = buildWorkRoots({ extraRootsEnv: raw });
  assert.equal(roots.get("work"), path.resolve("C:\\Work"));
  assert.equal(roots.get("portfolio"), path.resolve("C:\\Portfolio"));
  assert.equal(roots.get("thesis"), path.resolve("C:\\Users\\mczyz\\Documents\\Praca licencjacka"));
});

test("overlapping workspace roots are rejected", () => {
  assert.throws(
    () => buildWorkRoots({ extraRootsEnv: 'mcp=C:\\Work\\mcp' }),
    /Overlapping workspace roots are not allowed/
  );
});

test("invalid extra root entries are rejected explicitly", () => {
  assert.throws(() => parseExtraWorkRoots('portfolio'), new RegExp(WORK_ROOTS_ENV_VAR));
  assert.throws(() => parseExtraWorkRoots('bad alias=C:\\Portfolio'), /Invalid workspace root alias/);
});

test("server.js and indexer reuse shared workspace-root configuration", () => {
  const serverSource = fs.readFileSync("server.js", "utf8");
  const indexerSource = fs.readFileSync("core/indexer.js", "utf8");

  assert.match(serverSource, /listWorkspaceRoots/);
  assert.match(serverSource, /workspaceAccessHint/);
  assert.doesNotMatch(serverSource, /const BASE_DIR = path\.resolve\("C:\\\\Work\\\\mcp"\)/);

  assert.match(indexerSource, /listWorkspaceRoots/);
  assert.match(indexerSource, /@\$\{root\.alias\}/);
});
