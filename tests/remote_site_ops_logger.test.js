import test from "node:test";
import assert from "node:assert/strict";

import {
  REMOTE_SITE_OPS_DIRS,
  normalizeOpsEvent,
  remoteOpsLogPath,
  resolveOpsRoot,
} from "../core/remote_site_ops_logger.js";

test("remote ops dirs include required lifecycle directories", () => {
  assert.deepEqual(REMOTE_SITE_OPS_DIRS, ["trash", "edits", "logs", "meta"]);
});

test("normalizeOpsEvent accepts action alias and normalizes schema", () => {
  const event = normalizeOpsEvent({
    action: "delete",
    remote_path: "index.html",
    trash_path: "/ops/trash/index__deleted.html",
    details: { bytes_before: 123 },
  });

  assert.equal(event.operation, "delete");
  assert.equal(event.actor, "gpt-mcp");
  assert.equal(event.remote_path, "index.html");
  assert.equal(event.result, "success");
  assert.equal(event.artifact, "/ops/trash/index__deleted.html");
  assert.equal(event.details.bytes_before, 123);
  assert.match(event.ts, /^\d{4}-\d{2}-\d{2}T/);
});

test("normalizeOpsEvent requires operation or action", () => {
  assert.throws(() => normalizeOpsEvent({ remote_path: "index.html" }), /requires operation/i);
});

test("remoteOpsLogPath builds canonical JSONL log path", () => {
  assert.equal(
    remoteOpsLogPath("/home/ubuntu/apps/romion-site/.mcp_site_ops"),
    "/home/ubuntu/apps/romion-site/.mcp_site_ops/logs/site-files.log"
  );
});


test("resolveOpsRoot accepts direct opsRoot string", () => {
  const opsRoot = "/home/ubuntu/apps/romion-site/.mcp_site_ops";
  assert.equal(resolveOpsRoot(opsRoot), opsRoot);
});

test("resolveOpsRoot accepts config object with opsRoot", () => {
  const config = { opsRoot: "/home/ubuntu/apps/romion-site/.mcp_site_ops" };
  assert.equal(resolveOpsRoot(config), config.opsRoot);
});

test("resolveOpsRoot rejects invalid config", () => {
  assert.throws(() => resolveOpsRoot({}), /unable to resolve remote ops root/i);
});
