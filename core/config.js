import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";

export const AUTH_MODE_PORTS = Object.freeze({
  access: 3001,
  bearer: 3002,
  oauth2: 3003,
});
export const PRIMARY_WORK_ROOT_ALIAS = "work";
export const WORK_ROOTS_ENV_VAR = "MCP_EXTRA_ROOTS";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_RUNTIME_FALLBACK = path.resolve(MODULE_DIR, "..");
const REPO_WORKSPACE_FALLBACK = path.resolve(REPO_RUNTIME_FALLBACK, "..");

function stripQuotes(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "");
}

function looksLikeWindowsAbsolute(value) {
  return /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\[^\\]+[\\/][^\\/]+/.test(value);
}

function comparePath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function hostResolveAbsolute(value) {
  const raw = stripQuotes(value);
  if (!raw) throw new Error("Workspace root path cannot be empty.");
  if (looksLikeWindowsAbsolute(raw)) {
    return path.win32.normalize(raw);
  }
  return path.resolve(raw);
}

function normalizeServerAuthMode(value) {
  const mode = String(value || "access").trim().toLowerCase();
  if (!AUTH_MODE_PORTS[mode]) {
    throw new Error(`Unsupported MCP server auth mode: ${value}`);
  }
  return mode;
}

function defaultHostWorkRoot() {
  if (process.env.MCP_WORK_ROOT) return hostResolveAbsolute(process.env.MCP_WORK_ROOT);
  if (process.platform === "win32") return hostResolveAbsolute("C:\\Work");
  return hostResolveAbsolute(REPO_WORKSPACE_FALLBACK);
}

function defaultHostRuntimeDir() {
  if (process.env.MCP_RUNTIME_DIR) return hostResolveAbsolute(process.env.MCP_RUNTIME_DIR);
  if (process.platform === "win32") return hostResolveAbsolute("C:\\Work\\mcp");
  return hostResolveAbsolute(REPO_RUNTIME_FALLBACK);
}

export const DEFAULT_WORK_ROOT = defaultHostWorkRoot();
export const RUNTIME_DIR = defaultHostRuntimeDir();

function normalizeAlias(value) {
  const alias = String(value || "").trim().toLowerCase();
  if (!alias) throw new Error("Workspace root alias cannot be empty.");
  if (!/^[a-z0-9_-]+$/.test(alias)) {
    throw new Error(`Invalid workspace root alias: ${value}`);
  }
  return alias;
}

function normalizeRootPath(value) {
  return hostResolveAbsolute(value);
}

function overlaps(a, b) {
  const left = comparePath(a);
  const right = comparePath(b);
  return left === right || left.startsWith(right + "/") || right.startsWith(left + "/");
}

export function parseExtraWorkRoots(raw = "") {
  const entries = [];
  const text = String(raw || "").trim();
  if (!text) return entries;

  for (const part of text.split(";")) {
    const item = part.trim();
    if (!item) continue;
    const eq = item.indexOf("=");
    if (eq <= 0) {
      throw new Error(`Invalid ${WORK_ROOTS_ENV_VAR} entry: ${item}`);
    }
    const alias = normalizeAlias(item.slice(0, eq));
    const root = normalizeRootPath(item.slice(eq + 1));
    entries.push([alias, root]);
  }

  return entries;
}

export function buildWorkRoots({
  primaryAlias = PRIMARY_WORK_ROOT_ALIAS,
  primaryPath = DEFAULT_WORK_ROOT,
  extraRootsEnv = process.env[WORK_ROOTS_ENV_VAR] || "",
} = {}) {
  const map = new Map();
  const seenPaths = [];

  const addRoot = (aliasValue, rootValue) => {
    const alias = normalizeAlias(aliasValue);
    const root = normalizeRootPath(rootValue);

    if (map.has(alias)) {
      throw new Error(`Duplicate workspace root alias: ${alias}`);
    }

    for (const [existingAlias, existingPath] of seenPaths) {
      if (overlaps(existingPath, root)) {
        throw new Error(`Overlapping workspace roots are not allowed: ${existingAlias}=${existingPath} overlaps with ${alias}=${root}`);
      }
    }

    map.set(alias, root);
    seenPaths.push([alias, root]);
  };

  addRoot(primaryAlias, primaryPath);

  for (const [alias, root] of parseExtraWorkRoots(extraRootsEnv)) {
    addRoot(alias, root);
  }

  return map;
}

export const WORK_ROOTS = buildWorkRoots();
export const BASE_DIR = WORK_ROOTS.get(PRIMARY_WORK_ROOT_ALIAS);
export const SERVER_AUTH_MODE = normalizeServerAuthMode(process.env.MCP_SERVER_AUTH_MODE || "access");
export const PORT = AUTH_MODE_PORTS[SERVER_AUTH_MODE];
export const JSON_BODY_LIMIT = process.env.MCP_JSON_BODY_LIMIT || "1mb";

export const BEARER_TOKEN_FILE = process.env.MCP_BEARER_TOKEN_FILE
  ? hostResolveAbsolute(process.env.MCP_BEARER_TOKEN_FILE)
  : null;

export function loadBearerAccessSecret({
  tokenFile = BEARER_TOKEN_FILE,
  inlineToken = process.env.MCP_BEARER_TOKEN || process.env.MCP_TOKEN || "",
} = {}) {
  if (tokenFile) {
    const text = fs.readFileSync(tokenFile, "utf8").trim();
    if (!text) {
      throw new Error(`Bearer token file is empty: ${tokenFile}`);
    }
    return text;
  }

  const token = String(inlineToken || "").trim();
  return token || null;
}

export const ACCESS_SECRET = SERVER_AUTH_MODE === "bearer"
  ? loadBearerAccessSecret()
  : null;

export function listWorkspaceRoots() {
  return [...WORK_ROOTS.entries()].map(([alias, root]) => ({
    alias,
    path: root,
    primary: alias === PRIMARY_WORK_ROOT_ALIAS,
  }));
}

export function workspaceAccessHint() {
  const roots = listWorkspaceRoots();
  const primary = roots.find((item) => item.primary);
  const secondary = roots.filter((item) => !item.primary).map((item) => `@${item.alias} => ${item.path}`);
  const secondaryHint = secondary.length
    ? ` Additional roots use explicit aliases: ${secondary.join(", ")}.`
    : " Additional roots can be added with MCP_EXTRA_ROOTS using @alias/... addressing.";
  return `Primary workspace root is ${primary.path}. Bare paths resolve there.${secondaryHint}`;
}

export const TRASH_DIR = path.join(RUNTIME_DIR, ".mcp_trash");
export const BACKUP_DIR = path.join(RUNTIME_DIR, ".mcp_backups");
export const INDEX_DIR = path.join(RUNTIME_DIR, ".mcp_index");
export const INDEX_FILE = path.join(INDEX_DIR, "index.json");
export const LOG_FILE = path.join(RUNTIME_DIR, ".mcp_audit.log");
export const PERF_LOG_FILE = path.join(RUNTIME_DIR, ".mcp_perf.log");

export const DEBUG_TIMING = ["1", "true", "yes", "on"].includes(
  String(process.env.MCP_DEBUG_TIMING || "").trim().toLowerCase()
);
export const PERF_SLOW_MS = Number(process.env.MCP_PERF_SLOW_MS || 250);

export const MAX_WRITE_BYTES = 5 * 1024 * 1024;

export const MAX_INDEX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_INDEX_TEXT_CHARS = 20000;
export const MAX_CONTEXT_FILE_CHARS = 30000;

export const MAX_READ_FILE_CHARS = 30000;
export const MAX_READ_LINES_CHARS = 50000;
export const MAX_READ_CHUNK_CHARS = 50000;

export const ALLOWED_INDEX_EXTENSIONS = new Set([
  ".txt", ".md", ".csv", ".json", ".xml", ".html", ".htm",
  ".js", ".ts", ".py", ".ps1", ".bat", ".cmd",
  ".ini", ".yml", ".yaml",
]);

export const SKIPPED_SCAN_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".venv",
  "venv",
  "env",
  ".mcp_trash",
  ".mcp_backups",
  ".mcp_index",
  ".mcp_sandbox",
  ".mcp_tool_memory",
  ".mcp_warzone",
  ".mcp_audit",
  ".mcp_deploy",
  ".mcp_deploy_backup",
  ".secrets",
  "_backups",
  "logs",
  ".temp",
]);

export const SKIPPED_SCAN_EXTENSIONS = new Set([
  ".log",
  ".tmp",
  ".cache",
]);

export const PROTECTED_PATHS = new Set([
  "mcp/server_tools.js",
  "mcp/package.json",
  "mcp/package-lock.json",
]);

export const BLOCKED_TOP_LEVEL_DIRS = new Set([
  "node_modules",
  ".git",
]);

export const BLOCKED_PATH_PREFIXES = new Set([
  "mcp/core",
  "mcp/node_modules",
  "mcp/.git",
  "mcp/.secrets",
  "mcp/.mcp_trash",
  "mcp/.mcp_backups",
  "mcp/.mcp_index",
]);

export const READ_BLOCKED_PATH_PREFIXES = new Set([
  "mcp/.secrets",
]);



