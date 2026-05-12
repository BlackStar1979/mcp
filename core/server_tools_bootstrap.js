import path from "node:path";
import { fileURLToPath } from "url";

export const SERVER_AUTH_MODES = Object.freeze(["access", "bearer", "oauth2"]);
export const SERVER_TOOLS_AUTH_PORTS = Object.freeze({
  access: 3001,
  bearer: 3002,
  oauth2: 3003,
});

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..");

function usageError(message) {
  const error = new Error(message);
  error.code = "CLI_USAGE";
  return error;
}

function normalizeAuthMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (!SERVER_AUTH_MODES.includes(mode)) {
    throw usageError(`Unsupported auth mode: ${value}`);
  }
  return mode;
}

function resolveCliPath(value) {
  const raw = String(value || "").trim().replace(/^['"]|['"]$/g, "");
  if (!raw) {
    throw usageError("Token file path cannot be empty.");
  }
  return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(REPO_ROOT, raw);
}

export function serverToolsUsage() {
  return [
    "Usage:",
    "  node C:\\Work\\mcp\\server_tools.js",
    "  node C:\\Work\\mcp\\server_tools.js --auth access",
    "  node C:\\Work\\mcp\\server_tools.js --auth bearer --token-file <BASE MCP>\\.secrets\\mcp_token.txt",
    "  node C:\\Work\\mcp\\server_tools.js --auth oauth2",
    "",
    "Notes:",
    "  --auth access  => port 3001, Cloudflare Access assertion model",
    "  --auth bearer  => port 3002, bearer token model",
    "  --auth oauth2  => port 3003, reserved and not implemented yet",
  ].join("\n");
}

export function parseServerToolsCliArgs(argv = process.argv.slice(2)) {
  const args = [...argv];
  let authMode = "access";
  let tokenFile = null;

  while (args.length) {
    const arg = args.shift();

    if (arg === "--auth") {
      if (!args.length) throw usageError("Missing value after --auth.");
      authMode = normalizeAuthMode(args.shift());
      continue;
    }

    if (arg === "--token-file") {
      if (!args.length) throw usageError("Missing value after --token-file.");
      tokenFile = resolveCliPath(args.shift());
      continue;
    }

    throw usageError(`Unknown argument: ${arg}`);
  }

  if (tokenFile && authMode !== "bearer") {
    throw usageError("--token-file is only valid with --auth bearer.");
  }

  return { authMode, tokenFile };
}

export function applyServerToolsCliConfig(parsed, { env = process.env } = {}) {
  env.MCP_SERVER_AUTH_MODE = parsed.authMode;

  if (parsed.authMode === "access") {
    delete env.MCP_BEARER_TOKEN_FILE;
    delete env.MCP_BEARER_TOKEN;
    delete env.MCP_TOKEN;
  } else if (parsed.authMode === "bearer") {
    if (parsed.tokenFile) {
      env.MCP_BEARER_TOKEN_FILE = parsed.tokenFile;
      delete env.MCP_BEARER_TOKEN;
      delete env.MCP_TOKEN;
    } else {
      delete env.MCP_BEARER_TOKEN_FILE;
    }
  } else {
    delete env.MCP_BEARER_TOKEN_FILE;
    delete env.MCP_BEARER_TOKEN;
    delete env.MCP_TOKEN;
  }

  return {
    authMode: parsed.authMode,
    tokenFile: parsed.tokenFile,
    port: SERVER_TOOLS_AUTH_PORTS[parsed.authMode],
  };
}

export function assertSupportedRuntimeConfig(parsed, { env = process.env } = {}) {
  if (parsed.authMode === "oauth2") {
    throw new Error("OAuth2 auth mode is declared but not implemented yet.");
  }

  if (
    parsed.authMode === "bearer" &&
    !parsed.tokenFile &&
    !String(env.MCP_BEARER_TOKEN || "").trim() &&
    !String(env.MCP_TOKEN || "").trim()
  ) {
    throw usageError("Bearer auth requires --token-file or MCP_BEARER_TOKEN.");
  }
}

export function resolveAuthModulePath(authMode) {
  if (authMode === "access") return "./core/auth.js";
  if (authMode === "bearer") return "./core/auth_bearer.js";
  throw new Error(`No auth module is available for mode: ${authMode}`);
}

