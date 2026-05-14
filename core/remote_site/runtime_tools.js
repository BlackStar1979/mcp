import posixPath from "path/posix";
import { z } from "zod";

import { registerSafeTool, textOk } from "../responses.js";
import { audit } from "../audit.js";
import { buildRemoteRetentionPreviewOperation } from "../remote_site_retention_tool_runtime.js";
import { buildRemoteSiteRuntimeStatus } from "../remote_site_runtime_status.js";
import {
  READ_ONLY,
  collectOpsRootInventory,
  readOpsLogLines,
  readOpsMetadataRecords,
  runtimeStatusBlocked,
  toolBaseInput,
  withSftp,
} from "./shared_runtime.js";

export function registerRemoteSiteRuntimeTools(server) {
  registerSafeTool(server, "remote_site_runtime_status", {
    title: "Remote site runtime status",
    description:
      "Read-only bounded introspection of remote site opsRoot inventory, metadata, logs, and warnings.",
    inputSchema: toolBaseInput({}),
    annotations: READ_ONLY,
    outputSchema: z.object({
      status: z.string(),
      generated_at: z.string(),
      inventory: z.record(z.string(), z.unknown()),
      metadata: z.record(z.string(), z.unknown()),
      logs: z.record(z.string(), z.unknown()),
      warnings: z.array(z.record(z.string(), z.unknown())),
      text: z.string(),
    }).strict(),
  }, async ({ vps_config_ref }) => {
    const connected = await withSftp(vps_config_ref, async (client, config) => {
      const inventory = await collectOpsRootInventory(client, config.opsRoot);
      const metadataRecords = await readOpsMetadataRecords(client, config.opsRoot, inventory);
      const logLines = await readOpsLogLines(client, config.opsRoot);
      const status = buildRemoteSiteRuntimeStatus({
        inventoryEntries: inventory,
        metadataRecords,
        logLines,
      });

      await audit("remote_site_runtime_status", {
        vps_config_ref,
        status: status.status,
        warnings: status.warnings.length,
      });

      return status;
    });

    if (connected && connected.reason) {
      const blockedPayload = runtimeStatusBlocked(
        connected.reason,
        connected.message || "runtime status blocked"
      );
      return textOk(blockedPayload.text, blockedPayload);
    }

    connected.text = JSON.stringify(connected, null, 2);
    return textOk(connected.text, connected);
  });

  registerSafeTool(server, "preview_remote_site_retention", {
    title: "Preview remote site retention",
    description:
      "Build read-only retention preview for remote site ops artifacts without deleting files.",
    inputSchema: toolBaseInput({}),
    annotations: READ_ONLY,
    outputSchema: z.object({
      mode: z.string(),
      purge_count: z.number(),
      summary: z.record(z.string(), z.unknown()),
      text: z.string(),
    }).strict(),
  }, async ({ vps_config_ref }) => {
    return withSftp(vps_config_ref, async (client, config) => {
      const inventory = [];

      async function walk(dir, prefix = "") {
        const rows = await client.list(dir);

        for (const row of rows) {
          const rel = prefix ? `${prefix}/${row.name}` : row.name;
          const full = posixPath.join(dir, row.name);

          if (row.type === "d") {
            await walk(full, rel);
            continue;
          }

          inventory.push({
            path: rel,
            size: row.size ?? 0,
            modified_at: row.modifyTime
              ? new Date(row.modifyTime).toISOString()
              : new Date().toISOString(),
          });
        }
      }

      await walk(config.opsRoot);

      const metadataFiles = inventory
        .filter((entry) => entry.path.startsWith("meta/") && entry.path.endsWith(".json"))
        .map((entry) => entry.path);

      const operation = await buildRemoteRetentionPreviewOperation({
        inventoryEntries: inventory,
        metadataRecords: await Promise.all(
          metadataFiles.map(async (rel) => {
            try {
              const full = posixPath.join(config.opsRoot, rel);
              const data = await client.get(full);
              const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
              return JSON.parse(text);
            } catch {
              return {
                schema_version: -1,
                invalid_metadata_file: rel,
              };
            }
          })
        ),
      });

      await audit("preview_remote_site_retention", {
        vps_config_ref,
        purge_count: operation.preview.purge_count,
      });

      return textOk(JSON.stringify(operation, null, 2), {
        mode: operation.preview.mode,
        purge_count: operation.preview.purge_count,
        summary: {
          generated_at: operation.preview.generated_at,
          referenced_artifacts_count: operation.preview.referenced_artifacts_count,
          invalid_metadata_records: operation.preview.invalid_metadata_records.length,
          invalid_inventory_entries: operation.preview.invalid_inventory_entries.length,
          purge_candidates: operation.preview.purge_candidates.length,
        },
      });
    });
  });
}

