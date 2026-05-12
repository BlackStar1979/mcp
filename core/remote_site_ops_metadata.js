import crypto from "node:crypto";
import path from "node:path";

export const REMOTE_SITE_SCHEMA_VERSION = 1;

export function generateOperationId() {
  return crypto.randomUUID();
}

export function generateCorrelationId() {
  return crypto.randomUUID();
}

export function buildRemoteArtifactName({
  operation,
  remotePath,
  timestamp = new Date().toISOString(),
}) {
  if (!operation) {
    throw new Error("buildRemoteArtifactName requires operation");
  }

  if (!remotePath) {
    throw new Error("buildRemoteArtifactName requires remotePath");
  }

  const safeRemote = remotePath
    .replace(/[\\/]+/g, "__")
    .replace(/[^a-zA-Z0-9._-]/g, "_");

  const safeTs = timestamp.replace(/[:.]/g, "-");

  return `${safeRemote}__${operation}__${safeTs}`;
}

export function buildRemoteMetadataRecord({
  operation,
  remotePath,
  artifactPath,
  actor = "gpt-mcp",
  correlationId,
  operationId,
  details = {},
}) {
  if (!operation) {
    throw new Error("buildRemoteMetadataRecord requires operation");
  }

  if (!remotePath) {
    throw new Error("buildRemoteMetadataRecord requires remotePath");
  }

  return {
    schema_version: REMOTE_SITE_SCHEMA_VERSION,
    operation_id: operationId || generateOperationId(),
    correlation_id: correlationId || generateCorrelationId(),
    operation,
    actor,
    remote_path: remotePath,
    artifact_path: artifactPath || null,
    created_at: new Date().toISOString(),
    details,
  };
}

export function metadataFilenameForRecord(record) {
  if (!record?.operation_id) {
    throw new Error("metadataFilenameForRecord requires operation_id");
  }

  return `${record.operation_id}.json`;
}

export function metadataPathForRecord(metaRoot, record) {
  if (!metaRoot) {
    throw new Error("metadataPathForRecord requires metaRoot");
  }

  return path.posix.join(metaRoot, metadataFilenameForRecord(record));
}
