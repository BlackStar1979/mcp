import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMetadataManifest,
  buildMetadataManifestLocation,
} from "../core/remote_site_metadata_manifest_writer.js";

test("buildMetadataManifest creates canonical manifest", () => {
  const manifest = buildMetadataManifest({
    operation: "delete",
    remotePath: "index.html",
    artifactPath: "/ops/trash/index.html",
  });

  assert.equal(manifest.operation, "delete");
  assert.equal(manifest.remote_path, "index.html");
  assert.equal(manifest.artifact_path, "/ops/trash/index.html");
  assert.ok(manifest.operation_id);
  assert.ok(manifest.correlation_id);
});

test("buildMetadataManifestLocation builds canonical meta location", () => {
  const location = buildMetadataManifestLocation({
    opsRoot: "/srv/site/.mcp_site_ops",
    record: {
      operation_id: "abc-123",
    },
  });

  assert.equal(location.meta_root, "/srv/site/.mcp_site_ops/meta");
  assert.equal(location.filename, "abc-123.json");
  assert.equal(
    location.full_path,
    "/srv/site/.mcp_site_ops/meta/abc-123.json"
  );
});
