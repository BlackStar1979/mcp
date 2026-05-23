import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

import {
  AUTH_MODE_PORTS,
  BASE_DIR,
  RUNTIME_DIR,
  TRASH_DIR,
  BACKUP_DIR,
  INDEX_DIR,
  LOG_FILE,
  PERF_LOG_FILE,
  BLOCKED_TOP_LEVEL_DIRS,
  BLOCKED_PATH_PREFIXES,
  READ_BLOCKED_PATH_PREFIXES,
  SKIPPED_SCAN_DIRS,
  PRIMARY_WORK_ROOT_ALIAS,
  WORK_ROOTS_ENV_VAR,
  BEARER_TOKEN_FILE,
  SERVER_AUTH_MODE,
  buildWorkRoots,
  loadBearerAccessSecret,
  parseExtraWorkRoots,
  listWorkspaceRoots,
  workspaceAccessHint,
} from "../core/config.js";

const EXPECTED_BASE_DIR = process.platform === "win32"
  ? path.resolve("C:\\Work")
  : path.resolve(process.cwd(), "..");

const EXPECTED_RUNTIME_DIR = process.platform === "win32"
  ? path.resolve("C:\\Work\\mcp")
  : path.resolve(process.cwd());

const PORTFOLIO_ROOT = path.resolve(path.sep, "portfolio-root");
const THESIS_ROOT = path.resolve(path.sep, "thesis-root");
const OVERLAP_PRIMARY = path.resolve(path.sep, "workspace-root");
const OVERLAP_CHILD = path.join(OVERLAP_PRIMARY, "mcp");

test("workspace and runtime paths are split between workspace root and runtime root", () => {
  assert.equal(BASE_DIR, EXPECTED_BASE_DIR);
  assert.equal(RUNTIME_DIR, EXPECTED_RUNTIME_DIR);
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
    path: BASE_DIR,
    primary: true,
  });
  assert.match(workspaceAccessHint(), new RegExp(`Primary workspace root is ${BASE_DIR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(workspaceAccessHint(), /MCP_EXTRA_ROOTS|Additional roots use explicit aliases:/);
});

test("default server auth mode is access on port 3001", () => {
  assert.equal(SERVER_AUTH_MODE, "access");
  assert.equal(AUTH_MODE_PORTS.access, 3001);
  assert.equal(AUTH_MODE_PORTS.bearer, 3002);
  assert.equal(AUTH_MODE_PORTS.oauth2, 3003);
  assert.equal(BEARER_TOKEN_FILE, null);
});

test("bearer secret helper prefers MCP_BEARER_TOKEN over legacy MCP_TOKEN by default", () => {
  const previousBearer = process.env.MCP_BEARER_TOKEN;
  const previousLegacy = process.env.MCP_TOKEN;

  try {
    process.env.MCP_BEARER_TOKEN = "preferred-bearer-token";
    process.env.MCP_TOKEN = "legacy-token-only";
    assert.equal(loadBearerAccessSecret({ tokenFile: null }), "preferred-bearer-token");

    delete process.env.MCP_BEARER_TOKEN;
    assert.equal(loadBearerAccessSecret({ tokenFile: null }), "legacy-token-only");
  } finally {
    if (previousBearer === undefined) {
      delete process.env.MCP_BEARER_TOKEN;
    } else {
      process.env.MCP_BEARER_TOKEN = previousBearer;
    }

    if (previousLegacy === undefined) {
      delete process.env.MCP_TOKEN;
    } else {
      process.env.MCP_TOKEN = previousLegacy;
    }
  }
});

test("runtime protection remains enforced under runtime mcp/ subtree while workspace root can expand", () => {
  assert.equal(BLOCKED_TOP_LEVEL_DIRS.has("node_modules"), true);
  assert.equal(BLOCKED_TOP_LEVEL_DIRS.has("mcp"), false);
  assert.equal(BLOCKED_PATH_PREFIXES.has("mcp/core"), true);
  assert.equal(BLOCKED_PATH_PREFIXES.has("mcp/.secrets"), true);
  assert.equal(READ_BLOCKED_PATH_PREFIXES.has("mcp/.secrets"), true);
  assert.equal(SKIPPED_SCAN_DIRS.has("node_modules"), true);
  assert.equal(SKIPPED_SCAN_DIRS.has(".mcp_warzone"), true);
  assert.equal(SKIPPED_SCAN_DIRS.has(".secrets"), true);
});

test("extra workspace roots can be parsed and built without another redesign", () => {
  const raw = `portfolio=${PORTFOLIO_ROOT};thesis=${THESIS_ROOT}`;
  assert.deepEqual(parseExtraWorkRoots(raw), [
    ["portfolio", PORTFOLIO_ROOT],
    ["thesis", THESIS_ROOT],
  ]);

  const roots = buildWorkRoots({ extraRootsEnv: raw });
  assert.equal(roots.get("work"), BASE_DIR);
  assert.equal(roots.get("portfolio"), PORTFOLIO_ROOT);
  assert.equal(roots.get("thesis"), THESIS_ROOT);
});

test("overlapping workspace roots are rejected", () => {
  assert.throws(
    () => buildWorkRoots({ primaryPath: OVERLAP_PRIMARY, extraRootsEnv: `mcp=${OVERLAP_CHILD}` }),
    /Overlapping workspace roots are not allowed/
  );
});

test("invalid extra root entries are rejected explicitly", () => {
  assert.throws(() => parseExtraWorkRoots("portfolio"), new RegExp(WORK_ROOTS_ENV_VAR));
  assert.throws(() => parseExtraWorkRoots(`bad alias=${PORTFOLIO_ROOT}`), /Invalid workspace root alias/);
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

