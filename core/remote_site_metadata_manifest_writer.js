import path from "node:path";

import {
  buildRemoteMetadataRecord,
  metadataFilenameForRecord,
  metadataPathForRecord,
} from "./remote_site_ops_metadata.js";

export function buildMetadataManifest({
  operation,
  remotePath,
  artifactPath,
  actor = "gpt-mcp",
  correlationId,
  operationId,
  details = {},
}) {
  return buildRemoteMetadataRecord({
    operation,
    remotePath,
    artifactPath,
    actor,
    correlationId,
    operationId,
    details,
  });
}

export function buildMetadataManifestLocation({
  opsRoot,
  record,
}) {
  if (!opsRoot) {
    throw new Error("buildMetadataManifestLocation requires opsRoot");
  }

  if (!record) {
    throw new Error("buildMetadataManifestLocation requires record");
  }

  const metaRoot = path.posix.join(opsRoot, "meta");

  return {
    meta_root: metaRoot,
    filename: metadataFilenameForRecord(record),
    full_path: metadataPathForRecord(metaRoot, record),
  };
}
