import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";

import { registerSafeTool } from "./responses.js";
import { audit } from "./audit.js";
import { listWorkspaceRoots } from "./config.js";
import { describeWorkspaceFullPath, safePath } from "./paths.js";

const DEFAULT_TIMEOUT_MS = Number(process.env.MCP_PROCESS_TIMEOUT_MS || 30000);
const MAX_TIMEOUT_MS = Number(process.env.MCP_PROCESS_MAX_TIMEOUT_MS || 120000);
const DEFAULT_MAX_OUTPUT_CHARS = Number(process.env.MCP_PROCESS_MAX_OUTPUT_CHARS || 60000);
const MAX_OUTPUT_CHARS = Number(process.env.MCP_PROCESS_HARD_OUTPUT_CHARS || 250000);

const DEFAULT_ALLOWED_COMMANDS = [
  "git",
  "node",
  "npm",
  "python",
  "py",
  "pytest",
  "powershell",
  "pwsh",
];

const SAFE_INHERITED_ENV_KEYS = new Set([
  "APPDATA",
  "COMSPEC",
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "LANG",
  "LC_ALL",
  "LOCALAPPDATA",
  "PATH",
  "PATHEXT",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "SYSTEMDRIVE",
  "SYSTEMROOT",
  "TEMP",
  "TERM",
  "TMP",
  "USERPROFILE",
]);

const RUN_PROCESS_OUTPUT = z.object({
  status: z.enum(["ok", "nonzero_exit", "timeout", "spawn_error"]),
  command: z.string(),
  args: z.array(z.string()),
  cwd: z.string(),
  workspace: z.string(),
  exit_code: z.number().int().nullable(),
  signal: z.string().nullable(),
  timed_out: z.boolean(),
  duration_ms: z.number().int().nonnegative(),
  stdout: z.string(),
  stderr: z.string(),
  stdout_truncated: z.boolean(),
  stderr_truncated: z.boolean(),
  output_limit_chars: z.number().int().positive(),
  trace_id: z.string().nullable(),
  error: z.string().nullable(),
}).strict();

const PROCESS_RUNNER_STATUS_OUTPUT = z.object({
  status: z.literal("ok"),
  allowed_commands: z.array(z.string()),
  defaults: z.object({
    timeout_ms: z.number().int().positive(),
    max_timeout_ms: z.number().int().positive(),
    max_output_chars: z.number().int().positive(),
    hard_output_chars: z.number().int().positive(),
  }).strict(),
  powershell: z.object({
    raw_powershell_enabled: z.boolean(),
    command_enabled: z.boolean(),
    default_policy: z.string(),
  }).strict(),
  workspace_roots: z.array(z.object({
    alias: z.string(),
    path: z.string(),
    primary: z.boolean(),
  }).strict()),
  env_policy: z.object({
    inherits_full_parent_env: z.literal(false),
    inherited_keys: z.array(z.string()),
    caller_env_is_sanitized: z.literal(true),
  }).strict(),
}).strict();

const PROCESS_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};

const SHELL_METACHARS = /[&|;<>()`$]/;

function parseCommandAllowlist(raw = process.env.MCP_PROCESS_ALLOWLIST || "") {
  const text = String(raw || "").trim();
  if (!text) return new Set(DEFAULT_ALLOWED_COMMANDS);
  return new Set(
    text
      .split(/[;,]/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
  );
}

const ALLOWED_COMMANDS = parseCommandAllowlist();

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeCommand(value) {
  const command = String(value || "").trim();
  if (!command) throw new Error("Command cannot be empty.");
  if (command.includes("/") || command.includes("\\")) {
    throw new Error("Command must be a bare executable name from the allowlist.");
  }
  const lower = command.toLowerCase();
  if (!ALLOWED_COMMANDS.has(lower)) {
    throw new Error(`Command not allowed: ${command}`);
  }
  return command;
}

function normalizeArgs(args = []) {
  if (!Array.isArray(args)) throw new Error("args must be an array.");
  if (args.length > 100) throw new Error("Too many args; max 100.");
  return args.map((arg) => {
    const text = String(arg);
    if (text.length > 4000) throw new Error("Single argument too long; max 4000 chars.");
    return text;
  });
}

function truncateAppend(current, chunk, maxChars) {
  if (current.length >= maxChars) return { value: current, truncated: true };
  const next = current + chunk;
  if (next.length <= maxChars) return { value: next, truncated: false };
  return { value: next.slice(0, maxChars), truncated: true };
}

function sanitizeEnv(env = {}) {
  const out = {};
  for (const [key, value] of Object.entries(env || {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid env var name: ${key}`);
    }
    if (/token|secret|password|passwd|key/i.test(key)) {
      throw new Error(`Refusing to pass sensitive-looking env var: ${key}`);
    }
    out[key] = String(value);
  }
  return out;
}

function resolveCwd(cwd = ".") {
  const full = safePath(cwd || ".");
  const location = describeWorkspaceFullPath(full);
  return { full, location };
}

function powershellPolicy(command, args) {
  const lower = command.toLowerCase();
  if (!["powershell", "pwsh"].includes(lower)) return;

  const joined = args.join(" ");
  const hasCommand = args.some((a) => /^-command$/i.test(a) || /^-c$/i.test(a));
  const hasEncoded = args.some((a) => /^-encodedcommand$/i.test(a) || /^-enc$/i.test(a));
  const hasFile = args.some((a) => /^-file$/i.test(a));

  if (hasEncoded) throw new Error("PowerShell EncodedCommand is not allowed.");
  if (hasCommand && process.env.MCP_ENABLE_POWERSHELL_COMMAND !== "1") {
    throw new Error("PowerShell -Command is disabled. Use -File with a workspace-local .ps1 file, or set MCP_ENABLE_POWERSHELL_COMMAND=1.");
  }

  if (hasFile) {
    const fileIndex = args.findIndex((a) => /^-file$/i.test(a));
    const fileArg = args[fileIndex + 1];
    if (!fileArg) throw new Error("PowerShell -File requires a script path.");
    const scriptPath = safePath(fileArg);
    const scriptInfo = describeWorkspaceFullPath(scriptPath);
    if (!scriptInfo.rootRelativePath.toLowerCase().endsWith(".ps1")) {
      throw new Error("PowerShell -File must point to a .ps1 file inside an allowed workspace.");
    }
    return;
  }

  if (process.env.MCP_ALLOW_RAW_POWERSHELL !== "1") {
    throw new Error("PowerShell calls must use -File by default.");
  }

  if (SHELL_METACHARS.test(joined)) {
    throw new Error("PowerShell args contain shell metacharacters; rejected.");
  }
}

function buildSpawnEnv(extraEnv = {}) {
  const base = {};
  for (const key of SAFE_INHERITED_ENV_KEYS) {
    if (Object.hasOwn(process.env, key) && process.env[key] !== undefined) {
      base[key] = String(process.env[key]);
    }
  }
  return {
    ...base,
    ...sanitizeEnv(extraEnv),
  };
}

async function runProcessImpl({
  command,
  args = [],
  cwd = ".",
  timeout_ms,
  max_output_chars,
  env = {},
  trace_id = null,
}) {
  const exe = normalizeCommand(command);
  const argv = normalizeArgs(args);
  powershellPolicy(exe, argv);

  const timeout = clampInt(timeout_ms, DEFAULT_TIMEOUT_MS, 100, MAX_TIMEOUT_MS);
  const maxOutput = clampInt(max_output_chars, DEFAULT_MAX_OUTPUT_CHARS, 1000, MAX_OUTPUT_CHARS);
  const cwdInfo = resolveCwd(cwd);

  const started = Date.now();
  let stdout = "";
  let stderr = "";
  let stdoutTruncated = false;
  let stderrTruncated = false;
  let timedOut = false;

  await audit("process_start", {
    source: "process_runner",
    trace_id,
    command: exe,
    args: argv,
    cwd: cwdInfo.location.displayPath,
    timeout_ms: timeout,
    max_output_chars: maxOutput,
  });

  const result = await new Promise((resolve) => {
    const child = spawn(exe, argv, {
      cwd: cwdInfo.full,
      shell: false,
      windowsHide: true,
      env: buildSpawnEnv(env),
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {}
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {}
      }, 1500).unref?.();
    }, timeout);

    child.stdout?.on("data", (buf) => {
      const res = truncateAppend(stdout, buf.toString("utf8"), maxOutput);
      stdout = res.value;
      stdoutTruncated = stdoutTruncated || res.truncated;
    });

    child.stderr?.on("data", (buf) => {
      const res = truncateAppend(stderr, buf.toString("utf8"), maxOutput);
      stderr = res.value;
      stderrTruncated = stderrTruncated || res.truncated;
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        status: "spawn_error",
        exit_code: null,
        signal: null,
        error: error.message || String(error),
      });
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        status: timedOut ? "timeout" : (code === 0 ? "ok" : "nonzero_exit"),
        exit_code: code,
        signal,
        error: null,
      });
    });
  });

  const durationMs = Date.now() - started;

  const payload = {
    status: result.status,
    command: exe,
    args: argv,
    cwd: cwdInfo.location.displayPath,
    workspace: cwdInfo.location.rootAlias,
    exit_code: result.exit_code,
    signal: result.signal,
    timed_out: timedOut,
    duration_ms: durationMs,
    stdout,
    stderr,
    stdout_truncated: stdoutTruncated,
    stderr_truncated: stderrTruncated,
    output_limit_chars: maxOutput,
    trace_id,
    error: result.error,
  };

  await audit("process_finish", {
    source: "process_runner",
    trace_id,
    command: exe,
    cwd: cwdInfo.location.displayPath,
    status: payload.status,
    exit_code: payload.exit_code,
    signal: payload.signal,
    timed_out: payload.timed_out,
    duration_ms: durationMs,
    stdout_truncated: stdoutTruncated,
    stderr_truncated: stderrTruncated,
  });

  return payload;
}

export function registerProcessTools(server) {
  registerSafeTool(
    server,
    "run_process",
    {
      title: "Run bounded workspace process",
      description: "Run an allowlisted local process inside an allowed workspace root with bounded output, timeout, audit logging, and restrictive PowerShell policy.",
      inputSchema: z.object({
        command: z.string(),
        args: z.array(z.string()).default([]),
        cwd: z.string().default("."),
        timeout_ms: z.number().int().min(100).max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
        max_output_chars: z.number().int().min(1000).max(MAX_OUTPUT_CHARS).default(DEFAULT_MAX_OUTPUT_CHARS),
        env: z.record(z.string(), z.string()).default({}),
        trace_id: z.string().nullable().default(null),
      }).strict(),
      outputSchema: RUN_PROCESS_OUTPUT,
      annotations: PROCESS_TOOL_ANNOTATIONS,
    },
    runProcessImpl
  );

  registerSafeTool(
    server,
    "process_runner_status",
    {
      title: "Process runner status",
      description: "Show process runner policy, command allowlist, workspace roots, and environment inheritance limits.",
      inputSchema: z.object({}).strict(),
      outputSchema: PROCESS_RUNNER_STATUS_OUTPUT,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => ({
      status: "ok",
      allowed_commands: [...ALLOWED_COMMANDS].sort(),
      defaults: {
        timeout_ms: DEFAULT_TIMEOUT_MS,
        max_timeout_ms: MAX_TIMEOUT_MS,
        max_output_chars: DEFAULT_MAX_OUTPUT_CHARS,
        hard_output_chars: MAX_OUTPUT_CHARS,
      },
      powershell: {
        raw_powershell_enabled: process.env.MCP_ALLOW_RAW_POWERSHELL === "1",
        command_enabled: process.env.MCP_ENABLE_POWERSHELL_COMMAND === "1",
        default_policy: "PowerShell requires -File with a workspace-local .ps1 script unless explicitly enabled otherwise.",
      },
      workspace_roots: listWorkspaceRoots(),
      env_policy: {
        inherits_full_parent_env: false,
        inherited_keys: [...SAFE_INHERITED_ENV_KEYS].sort(),
        caller_env_is_sanitized: true,
      },
    })
  );
}
