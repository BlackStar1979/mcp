import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SERVER_TOOL_MODULES,
  SERVER_TOOLS_AUTH_PORTS,
  applyServerToolsCliConfig,
  assertSupportedRuntimeConfig,
  parseServerToolsCliArgs,
  resolveAuthModulePath,
} from "../core/server_tools_bootstrap.js";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TESTS_DIR, "..");

test("server_tools CLI defaults to access mode", () => {
  assert.deepEqual(parseServerToolsCliArgs([]), {
    authMode: "access",
    tokenFile: null,
    modules: null,
    disableModules: null,
  });
});

test("server_tools CLI parses bearer token file and oauth2 mode", () => {
  const parsedBearer = parseServerToolsCliArgs(["--auth", "bearer", "--token-file", ".secrets/mcp_token.txt"]);
  assert.equal(parsedBearer.authMode, "bearer");
  assert.equal(parsedBearer.tokenFile, path.resolve(REPO_ROOT, ".secrets/mcp_token.txt"));

  const parsedOauth = parseServerToolsCliArgs(["--auth", "oauth2"]);
  assert.equal(parsedOauth.authMode, "oauth2");
  assert.equal(parsedOauth.tokenFile, null);
});

test("server_tools CLI parses module enable/disable lists", () => {
  const parsed = parseServerToolsCliArgs([
    "--modules",
    "index,filesystem,truth",
    "--disable-modules",
    "filesystem",
  ]);
  assert.deepEqual(parsed.modules, ["index", "filesystem", "truth"]);
  assert.deepEqual(parsed.disableModules, ["filesystem"]);
});

test("server_tools CLI rejects unknown or mis-scoped arguments", () => {
  assert.throws(() => parseServerToolsCliArgs(["--auth", "weird"]), /Unsupported auth mode/);
  assert.throws(() => parseServerToolsCliArgs(["--token-file", "x"]), /only valid with --auth bearer/);
  assert.throws(() => parseServerToolsCliArgs(["--modules", "unknown"]), /Unknown module id/);
  assert.throws(() => parseServerToolsCliArgs(["--disable-modules", "unknown"]), /Unknown module id/);
  assert.throws(() => parseServerToolsCliArgs(["--wat"]), /Unknown argument/);
});

test("applyServerToolsCliConfig sets access mode environment cleanly", () => {
  const env = {
    MCP_BEARER_TOKEN_FILE: "C:\\tmp\\token.txt",
    MCP_BEARER_TOKEN: "secret",
    MCP_TOKEN: "legacy",
  };

  const runtime = applyServerToolsCliConfig({ authMode: "access", tokenFile: null }, { env });
  assert.equal(runtime.port, SERVER_TOOLS_AUTH_PORTS.access);
  assert.equal(env.MCP_SERVER_AUTH_MODE, "access");
  assert.equal(runtime.enabledModules.length, SERVER_TOOL_MODULES.length);
  assert.equal(runtime.disabledModules.length, 0);
  assert.equal("MCP_BEARER_TOKEN_FILE" in env, false);
  assert.equal("MCP_BEARER_TOKEN" in env, false);
  assert.equal("MCP_TOKEN" in env, false);
});

test("applyServerToolsCliConfig sets bearer mode token file cleanly", () => {
  const env = {
    MCP_TOKEN: "legacy",
  };
  const tokenFile = path.resolve(REPO_ROOT, ".secrets/mcp_token.txt");
  const runtime = applyServerToolsCliConfig({ authMode: "bearer", tokenFile }, { env });

  assert.equal(runtime.port, SERVER_TOOLS_AUTH_PORTS.bearer);
  assert.equal(env.MCP_SERVER_AUTH_MODE, "bearer");
  assert.equal(env.MCP_BEARER_TOKEN_FILE, tokenFile);
  assert.equal(runtime.enabledModules.length, SERVER_TOOL_MODULES.length);
  assert.equal(runtime.disabledModules.length, 0);
  assert.equal("MCP_TOKEN" in env, false);
});

test("applyServerToolsCliConfig applies module gating when provided by CLI", () => {
  const env = {
    MCP_ENABLED_MODULES: "web,truth,process", // should be ignored when CLI modules are set
    MCP_DISABLED_MODULES: "process", // should be ignored when CLI disable list is set
  };

  const runtime = applyServerToolsCliConfig(
    {
      authMode: "access",
      tokenFile: null,
      modules: ["web", "truth", "process"],
      disableModules: ["process"],
    },
    { env }
  );

  assert.deepEqual(
    runtime.enabledModules.map((item) => item.id),
    ["web", "truth"]
  );
  assert.deepEqual(
    runtime.disabledModules.map((item) => item.id),
    ["index", "filesystem", "science", "code_safe", "registry_safe", "process", "remote_site"]
  );
  assert.equal(env.MCP_ENABLED_MODULES, "web,truth,process");
  assert.equal(env.MCP_DISABLED_MODULES, "process");
});

test("assertSupportedRuntimeConfig blocks oauth2 and missing bearer secret", () => {
  assert.throws(
    () => assertSupportedRuntimeConfig({ authMode: "oauth2", tokenFile: null }, { env: {} }),
    /not implemented/
  );
  assert.throws(
    () => assertSupportedRuntimeConfig({ authMode: "bearer", tokenFile: null }, { env: {} }),
    /Bearer auth requires --token-file or MCP_BEARER_TOKEN/
  );
  assert.doesNotThrow(
    () => assertSupportedRuntimeConfig({ authMode: "bearer", tokenFile: "C:\\Work\\mcp\\.secrets\\mcp_token.txt" }, { env: {} })
  );
});

test("assertSupportedRuntimeConfig still accepts legacy MCP_TOKEN fallback for local bearer mode", () => {
  assert.doesNotThrow(
    () => assertSupportedRuntimeConfig({ authMode: "bearer", tokenFile: null }, { env: { MCP_TOKEN: "legacy-local-secret" } })
  );
});

test("resolveAuthModulePath returns access and bearer modules", () => {
  assert.equal(resolveAuthModulePath("access"), "./core/auth.js");
  assert.equal(resolveAuthModulePath("bearer"), "./core/auth_bearer.js");
});

test("module gating rejects NONE-equivalent selection", () => {
  const env = {};
  assert.throws(
    () =>
      applyServerToolsCliConfig(
        {
          authMode: "access",
          tokenFile: null,
          modules: ["web"],
          disableModules: ["web"],
        },
        { env }
      ),
    /No modules left/
  );
});

test("module gating rejects unknown env module ids", () => {
  const env = {
    MCP_ENABLED_MODULES: "web,unknown",
  };
  assert.throws(
    () =>
      applyServerToolsCliConfig(
        {
          authMode: "access",
          tokenFile: null,
          modules: null,
          disableModules: null,
        },
        { env }
      ),
    /Unknown module id in MCP_ENABLED_MODULES/
  );
});

