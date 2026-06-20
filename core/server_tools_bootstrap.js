import path from "node:path";
import { fileURLToPath } from "url";

export const SERVER_AUTH_MODES = Object.freeze(["access", "bearer", "oauth2"]);
export const SERVER_TOOLS_AUTH_PORTS = Object.freeze({
  access: 3001,
  bearer: 3002,
  oauth2: 3003,
});
export const SERVER_TOOL_MODULES = Object.freeze([
  {
    id: "index",
    label: "index tools",
    importPath: "./core/tools_index.js",
    registerExport: "registerIndexTools",
  },
  {
    id: "filesystem",
    label: "filesystem tools",
    importPath: "./core/tools_fs.js",
    registerExport: "registerFsTools",
  },
  {
    id: "connector",
    label: "connector search/fetch tools",
    importPath: "./core/connector_tools.js",
    registerExport: "registerConnectorTools",
  },
  {
    id: "science",
    label: "science tools",
    importPath: "./core/science_tools.js",
    registerExport: "registerScienceTools",
  },
  {
    id: "code_safe",
    label: "connector-safe code tools",
    importPath: "./core/code_tools_safe.js",
    registerExport: "registerCodeTools",
  },
  {
    id: "registry_safe",
    label: "connector-safe registry tools",
    importPath: "./core/registry_tools_safe.js",
    registerExport: "registerRegistryTools",
  },
  {
    id: "web",
    label: "web tools",
    importPath: "./core/web_tools.js",
    registerExport: "registerWebTools",
  },
  {
    id: "truth",
    label: "truth tools",
    importPath: "./core/truth_tools.js",
    registerExport: "registerTruthTools",
  },
  {
    id: "process",
    label: "process tools",
    importPath: "./core/process_tools_safe.js",
    registerExport: "registerProcessTools",
  },
  {
    id: "remote_site",
    label: "remote site tools",
    importPath: "./core/remote_site_tools.js",
    registerExport: "registerRemoteSiteTools",
  },
]);
const SERVER_TOOL_MODULE_ID_SET = new Set(SERVER_TOOL_MODULES.map((item) => item.id));

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

function parseModuleList(value, optionName) {
  const raw = String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const unique = [];
  for (const moduleId of raw) {
    if (!SERVER_TOOL_MODULE_ID_SET.has(moduleId)) {
      throw usageError(`Unknown module id in ${optionName}: ${moduleId}`);
    }
    if (!unique.includes(moduleId)) {
      unique.push(moduleId);
    }
  }
  return unique;
}

function parseEnvModuleList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function serverToolsUsage() {
  return [
    "Usage:",
    "  node C:\\Work\\mcp\\server_tools.js",
    "  node C:\\Work\\mcp\\server_tools.js --auth access",
    "  node C:\\Work\\mcp\\server_tools.js --auth bearer --token-file <BASE MCP>\\.secrets\\mcp_token.txt",
    "  node C:\\Work\\mcp\\server_tools.js --auth oauth2",
    "  node C:\\Work\\mcp\\server_tools.js --modules index,filesystem,science,code_safe,registry_safe,web,truth,process,remote_site",
    "  node C:\\Work\\mcp\\server_tools.js --disable-modules process,remote_site",
    "",
    "Notes:",
    "  --auth access  => port 3001, Cloudflare Access assertion model",
    "  --auth bearer  => port 3002, bearer token model",
    "  --auth oauth2  => port 3003, reserved and not implemented yet",
    "  --modules / --disable-modules  => startup-time module gating",
    "  env MCP_ENABLED_MODULES / MCP_DISABLED_MODULES can be used as defaults",
  ].join("\n");
}

export function parseServerToolsCliArgs(argv = process.argv.slice(2)) {
  const args = [...argv];
  let authMode = "access";
  let tokenFile = null;
  let modules = null;
  let disableModules = null;

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

    if (arg === "--modules") {
      if (!args.length) throw usageError("Missing value after --modules.");
      modules = parseModuleList(args.shift(), "--modules");
      continue;
    }

    if (arg === "--disable-modules") {
      if (!args.length) throw usageError("Missing value after --disable-modules.");
      disableModules = parseModuleList(args.shift(), "--disable-modules");
      continue;
    }

    throw usageError(`Unknown argument: ${arg}`);
  }

  if (tokenFile && authMode !== "bearer") {
    throw usageError("--token-file is only valid with --auth bearer.");
  }

  if (modules && !modules.length) {
    throw usageError("--modules cannot be empty.");
  }

  return { authMode, tokenFile, modules, disableModules };
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

  if (Array.isArray(parsed.modules)) {
    if (parsed.modules.length) {
      env.MCP_ENABLED_MODULES = parsed.modules.join(",");
    } else {
      delete env.MCP_ENABLED_MODULES;
    }
  }

  if (Array.isArray(parsed.disableModules)) {
    if (parsed.disableModules.length) {
      env.MCP_DISABLED_MODULES = parsed.disableModules.join(",");
    } else {
      delete env.MCP_DISABLED_MODULES;
    }
  }

  const enabledModuleIds = resolveEnabledServerModuleIds({
    env,
    modulesFromCli: parsed.modules,
    disabledFromCli: parsed.disableModules,
  });
  const enabledModules = SERVER_TOOL_MODULES.filter((item) => enabledModuleIds.includes(item.id));
  const disabledModules = SERVER_TOOL_MODULES.filter((item) => !enabledModuleIds.includes(item.id));

  return {
    authMode: parsed.authMode,
    tokenFile: parsed.tokenFile,
    port: SERVER_TOOLS_AUTH_PORTS[parsed.authMode],
    enabledModules,
    disabledModules,
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

export function resolveEnabledServerModuleIds({ env = process.env, modulesFromCli = null, disabledFromCli = null } = {}) {
  const defaultIds = SERVER_TOOL_MODULES.map((item) => item.id);

  let enabled = defaultIds;
  if (Array.isArray(modulesFromCli) && modulesFromCli.length) {
    enabled = modulesFromCli;
  } else {
    const envEnabledRaw = parseEnvModuleList(env.MCP_ENABLED_MODULES);
    if (envEnabledRaw.length) {
      for (const moduleId of envEnabledRaw) {
        if (!SERVER_TOOL_MODULE_ID_SET.has(moduleId)) {
          throw usageError(`Unknown module id in MCP_ENABLED_MODULES: ${moduleId}`);
        }
      }
      enabled = [...new Set(envEnabledRaw)];
    }
  }

  let disabled = [];
  if (Array.isArray(disabledFromCli) && disabledFromCli.length) {
    disabled = disabledFromCli;
  } else {
    const envDisabledRaw = parseEnvModuleList(env.MCP_DISABLED_MODULES);
    if (envDisabledRaw.length) {
      for (const moduleId of envDisabledRaw) {
        if (!SERVER_TOOL_MODULE_ID_SET.has(moduleId)) {
          throw usageError(`Unknown module id in MCP_DISABLED_MODULES: ${moduleId}`);
        }
      }
      disabled = [...new Set(envDisabledRaw)];
    }
  }

  const disabledSet = new Set(disabled);
  const filtered = enabled.filter((moduleId) => !disabledSet.has(moduleId));
  if (!filtered.length) {
    throw usageError("No modules left after applying --modules/--disable-modules and env gating.");
  }

  return filtered;
}

