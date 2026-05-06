import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

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

test("runtime protection remains enforced under mcp/ while workspace root expands to C:\\Work", () => {
  assert.equal(BLOCKED_TOP_LEVEL_DIRS.has("node_modules"), true);
  assert.equal(BLOCKED_TOP_LEVEL_DIRS.has("mcp"), false);
  assert.equal(BLOCKED_PATH_PREFIXES.has("mcp/core"), true);
  assert.equal(SKIPPED_SCAN_DIRS.has("node_modules"), true);
  assert.equal(SKIPPED_SCAN_DIRS.has(".mcp_warzone"), true);
});
