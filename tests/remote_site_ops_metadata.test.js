import test from "node:test";
import assert from "node:assert/strict";

import {
  REMOTE_SITE_SCHEMA_VERSION,
  buildRemoteArtifactName,
  buildRemoteMetadataRecord,
  generateCorrelationId,
  generateOperationId,
  metadataFilenameForRecord,
  metadataPathForRecord,
} from "../core/remote_site_ops_metadata.js";

test("schema version is stable", () => {
  assert.equal(REMOTE_SITE_SCHEMA_VERSION, 1);
});

test("generateOperationId returns UUID-like value", () => {
  const value = generateOperationId();
  assert.match(value, /^[0-9a-f-]{36}$/i);
});

test("generateCorrelationId returns UUID-like value", () => {
  const value = generateCorrelationId();
  assert.match(value, /^[0-9a-f-]{36}$/i);
});

test("buildRemoteArtifactName normalizes paths", () => {
  const value = buildRemoteArtifactName({
    operation: "delete",
    remotePath: "pages/index.html",
    timestamp: "2026-05-09T22:30:00.000Z",
  });

  assert.equal(
    value,
    "pages__index.html__delete__2026-05-09T22-30-00-000Z"
  );
});

test("buildRemoteMetadataRecord creates canonical structure", () => {
  const record = buildRemoteMetadataRecord({
    operation: "delete",
    remotePath: "index.html",
    artifactPath: "/ops/trash/index.html",
  });

  assert.equal(record.schema_version, 1);
  assert.equal(record.operation, "delete");
  assert.equal(record.remote_path, "index.html");
  assert.equal(record.actor, "gpt-mcp");
  assert.equal(record.artifact_path, "/ops/trash/index.html");
  assert.match(record.operation_id, /^[0-9a-f-]{36}$/i);
  assert.match(record.correlation_id, /^[0-9a-f-]{36}$/i);
});

test("metadataFilenameForRecord requires operation_id", () => {
  assert.throws(() => metadataFilenameForRecord({}), /operation_id/i);
});

test("metadataPathForRecord builds canonical meta path", () => {
  const record = {
    operation_id: "abc-123",
  };

  assert.equal(
    metadataPathForRecord("/ops/meta", record),
    "/ops/meta/abc-123.json"
  );
});
