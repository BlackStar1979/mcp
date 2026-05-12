import path from "node:path";

import { metadataPathForRecord } from "./remote_site_ops_metadata.js";

export function buildRestoreMetadataPath({ opsRoot, operationId }) {
  if (!opsRoot) {
    throw new Error("buildRestoreMetadataPath requires opsRoot");
  }
  if (!operationId) {
    throw new Error("buildRestoreMetadataPath requires operationId");
  }

  return metadataPathForRecord(path.posix.join(opsRoot, "meta"), {
    operation_id: operationId,
  });
}

export function parseRestoreMetadata(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("restore metadata is not valid JSON");
  }

  return validateRestoreMetadata(parsed);
}

export function validateRestoreMetadata(record) {
  if (!record || typeof record !== "object") {
    throw new Error("restore metadata must be an object");
  }

  if (record.schema_version !== 1) {
    throw new Error("unsupported restore metadata schema_version");
  }

  if (!record.operation_id) {
    throw new Error("restore metadata missing operation_id");
  }

  if (!record.correlation_id) {
    throw new Error("restore metadata missing correlation_id");
  }

  if (!record.operation) {
    throw new Error("restore metadata missing operation");
  }

  if (!record.remote_path) {
    throw new Error("restore metadata missing remote_path");
  }

  if (!record.artifact_path) {
    throw new Error("restore metadata missing artifact_path");
  }

  return record;
}

export function assertRestorableMetadata(record) {
  const validated = validateRestoreMetadata(record);

  if (validated.operation !== "delete") {
    throw new Error(`restore supports delete metadata only in v1: ${validated.operation}`);
  }

  return validated;
}
