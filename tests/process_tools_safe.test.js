import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { registerProcessTools } from "../core/process_tools_safe.js";

const processToolsSource = fs.readFileSync("core/process_tools_safe.js", "utf8");
const serverToolsSource = fs.readFileSync("server_tools.js", "utf8");

function captureTool(name) {
  let captured;
  const server = {
    registerTool(toolName, config, handler) {
      if (toolName === name) captured = { name: toolName, config, handler };
    },
  };

  registerProcessTools(server);
  assert.ok(captured, `expected to capture ${name}`);
  return captured;
}

test("process tools expose explicit output schemas and no full env inheritance", () => {
  assert.match(processToolsSource, /outputSchema:\s*RUN_PROCESS_OUTPUT/);
  assert.match(processToolsSource, /outputSchema:\s*PROCESS_RUNNER_STATUS_OUTPUT/);
  assert.match(processToolsSource, /inherits_full_parent_env:\s*z\.literal\(false\)/);
  assert.doesNotMatch(processToolsSource, /\{\s*\.\.\.process\.env/);
});

test("server_tools registers process tools module", () => {
  assert.match(serverToolsSource, /import\s+\{\s*registerProcessTools\s*\}\s+from\s+"\.\/core\/process_tools_safe\.js"/);
  assert.match(serverToolsSource, /registerProcessTools\(server\)/);
});

test("process_runner_status exposes allowlist, roots, and env policy", async () => {
  const captured = captureTool("process_runner_status");
  const result = await captured.handler({});
  const payload = result.structuredContent || result;

  assert.equal(payload.status, "ok");
  assert.ok(payload.allowed_commands.includes("node"));
  assert.equal(payload.env_policy.inherits_full_parent_env, false);
  assert.equal(payload.env_policy.caller_env_is_sanitized, true);
  assert.ok(payload.workspace_roots.some((item) => item.alias === "work"));
});

test("run_process executes bounded node --version inside repo workspace", async () => {
  const captured = captureTool("run_process");
  const result = await captured.handler({
    command: "node",
    args: ["--version"],
    cwd: "mcp",
    timeout_ms: 5000,
  });
  const payload = result.structuredContent || result;

  assert.equal(payload.status, "ok");
  assert.equal(payload.command, "node");
  assert.equal(payload.workspace, "work");
  assert.match(payload.stdout, /^v\d+/m);
});

test("run_process rejects non-allowlisted commands", async () => {
  const captured = captureTool("run_process");
  const result = await captured.handler({
    command: "bash",
    args: ["--version"],
    cwd: "mcp",
  });
  const payload = result.structuredContent || result;

  assert.equal(payload.status, "error");
  assert.match(payload.message, /Command not allowed/);
});

test("run_process rejects PowerShell EncodedCommand", async () => {
  const captured = captureTool("run_process");
  const result = await captured.handler({
    command: "pwsh",
    args: ["-EncodedCommand", "QUJD"],
    cwd: "mcp",
  });
  const payload = result.structuredContent || result;

  assert.equal(payload.status, "error");
  assert.match(payload.message, /EncodedCommand is not allowed/);
});
