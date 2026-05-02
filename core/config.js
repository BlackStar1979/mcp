import path from "path";

export const PORT = 3001;
export const BASE_DIR = path.resolve("C:\\Work\\mcp");
export const ACCESS_SECRET = process.env.MCP_TOKEN;
export const JSON_BODY_LIMIT = process.env.MCP_JSON_BODY_LIMIT || "1mb";

export const TRASH_DIR = path.join(BASE_DIR, ".mcp_trash");
export const BACKUP_DIR = path.join(BASE_DIR, ".mcp_backups");
export const INDEX_DIR = path.join(BASE_DIR, ".mcp_index");
export const INDEX_FILE = path.join(INDEX_DIR, "index.json");
export const LOG_FILE = path.join(BASE_DIR, ".mcp_audit.log");
export const PERF_LOG_FILE = path.join(BASE_DIR, ".mcp_perf.log");

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
]);

export const SKIPPED_SCAN_EXTENSIONS = new Set([
  ".log",
  ".tmp",
  ".cache",
]);

export const PROTECTED_PATHS = new Set([
  "server.js",
  "server_tools.js",
  "package.json",
  "package-lock.json",
]);

export const BLOCKED_TOP_LEVEL_DIRS = new Set([
  "core",
  "node_modules",
  ".git",
  ".mcp_trash",
  ".mcp_backups",
  ".mcp_index",
]);
