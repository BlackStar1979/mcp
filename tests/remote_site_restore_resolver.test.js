import test from "node:test";
import assert from "node:assert/strict";

import {
  assertRestorableMetadata,
  buildRestoreMetadataPath,
  parseRestoreMetadata,
  validateRestoreMetadata,
} from "../core/remote_site_restore_resolver.js";

function validDeleteRecord() {
  return {
    schema_version: 1,
    operation_id: "op-1",
    correlation_id: "corr-1",
    operation: "delete",
    actor: "gpt-mcp",
    remote_path: "index.html",
    artifact_path: "/srv/site/.mcp_site_ops/trash/index__deleted.html",
    created_at: "2026-05-10T00:00:00.000Z",
    details: {},
  };
}

test("buildRestoreMetadataPath resolves operation id under meta root", () => {
  assert.equal(
    buildRestoreMetadataPath({ opsRoot: "/srv/site/.mcp_site_ops", operationId: "abc-123" }),
    "/srv/site/.mcp_site_ops/meta/abc-123.json"
  );
});

test("parseRestoreMetadata parses valid JSON and validates schema", () => {
  const parsed = parseRestoreMetadata(JSON.stringify(validDeleteRecord()));
  assert.equal(parsed.operation, "delete");
  assert.equal(parsed.remote_path, "index.html");
});

test("parseRestoreMetadata rejects invalid JSON", () => {
  assert.throws(() => parseRestoreMetadata("not-json"), /not valid JSON/i);
});

test("validateRestoreMetadata rejects unsupported schema", () => {
  const record = validDeleteRecord();
  record.schema_version = 999;
  assert.throws(() => validateRestoreMetadata(record), /unsupported restore metadata schema_version/i);
});

test("validateRestoreMetadata rejects missing artifact", () => {
  const record = validDeleteRecord();
  delete record.artifact_path;
  assert.throws(() => validateRestoreMetadata(record), /missing artifact_path/i);
});

test("assertRestorableMetadata accepts delete metadata", () => {
  const record = assertRestorableMetadata(validDeleteRecord());
  assert.equal(record.operation, "delete");
});

test("assertRestorableMetadata rejects non-delete metadata in v1", () => {
  const record = validDeleteRecord();
  record.operation = "edit";
  assert.throws(() => assertRestorableMetadata(record), /delete metadata only/i);
});
