import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
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

test("runtime status provider marks degraded modules as degraded health", async () => {
  const tempDir = path.join(os.tmpdir(), "mcp-runtime-status-degraded-test");
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
      public_endpoint_hint: "",
    },
    modules: {
      enabled_ids: ["index"],
      disabled_ids: ["remote_site"],
      degraded_ids: ["web"],
    },
    paths: {
      audit_log_file: auditPath,
      perf_log_file: perfPath,
    },
  });

  assert.equal(status.status, "degraded");
  assert.equal(status.health.level, "degraded");
  assert.deepEqual(status.modules.degraded_ids, ["web"]);
});

test("runtime status provider does not create missing log directories while checking writability", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-runtime-status-sidefx-"));
  const missingLogsDir = path.join(tempDir, "nested", "logs");
  const auditPath = path.join(missingLogsDir, "audit.log");
  const perfPath = path.join(missingLogsDir, "perf.log");

  await assert.rejects(fs.access(missingLogsDir));

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
      public_endpoint_hint: "",
    },
    modules: {
      enabled_ids: ["index"],
      disabled_ids: [],
      degraded_ids: [],
    },
    paths: {
      audit_log_file: auditPath,
      perf_log_file: perfPath,
    },
  });

  await assert.rejects(fs.access(missingLogsDir));
  assert.equal(status.observability.audit_writable, false);
  assert.equal(status.observability.perf_writable, false);
  assert.equal(status.status, "warn");
  assert.deepEqual(status.health.warnings, [
    "audit_log_not_writable",
    "perf_log_not_writable",
  ]);
});
