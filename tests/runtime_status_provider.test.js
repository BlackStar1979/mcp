import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

import { buildRuntimeStatus } from "../core/observability/runtime_status_provider.js";

test("runtime status provider returns canonical shape", async () => {
  const tempDir = path.join(os.tmpdir(), "mcp-runtime-status-test");
  const auditPath = path.join(tempDir, "audit.log");
  const perfPath = path.join(tempDir, "perf.log");

  const status = await buildRuntimeStatus({
    runtime: {
      name: "modular-tools",
      version: "1.7.0",
      profile: "tools",
      auth_mode: "access",
    },
    network: {
      host: "127.0.0.1",
      port: 3001,
      public_endpoint_hint: "https://modular-mcp.romionologic.dev/mcp",
    },
    modules: {
      enabled_ids: ["index", "filesystem"],
      disabled_ids: ["remote_site"],
      degraded_ids: [],
    },
    paths: {
      audit_log_file: auditPath,
      perf_log_file: perfPath,
    },
  });

  assert.equal(typeof status.generated_at, "string");
  assert.equal(status.runtime.name, "modular-tools");
  assert.equal(status.runtime.auth_mode, "access");
  assert.equal(status.network.port, 3001);
  assert.deepEqual(status.modules.enabled_ids, ["index", "filesystem"]);
  assert.deepEqual(status.modules.disabled_ids, ["remote_site"]);
  assert.deepEqual(status.modules.degraded_ids, []);
  assert.equal(typeof status.observability.audit_writable, "boolean");
  assert.equal(typeof status.observability.perf_writable, "boolean");
  assert.ok(["ok", "warn", "degraded"].includes(status.health.level));
});

test("runtime status provider keeps secret-safe payload", async () => {
  const status = await buildRuntimeStatus({
    runtime: {
      name: "modular-tools",
      version: "1.7.0",
      profile: "tools",
      auth_mode: "bearer",
    },
    network: {
      host: "127.0.0.1",
      port: 3002,
      public_endpoint_hint: "https://example.invalid/mcp",
    },
    modules: {
      enabled_ids: ["index"],
      disabled_ids: [],
      degraded_ids: [],
    },
    paths: {
      audit_log_file: path.join(os.tmpdir(), "audit.log"),
      perf_log_file: path.join(os.tmpdir(), "perf.log"),
    },
  });

  const serialized = JSON.stringify(status).toLowerCase();
  assert.equal(serialized.includes("token"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("authorization"), false);
  assert.equal(serialized.includes("cf-access"), false);
});
