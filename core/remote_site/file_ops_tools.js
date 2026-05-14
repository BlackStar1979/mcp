import posixPath from "path/posix";
import { z } from "zod";

import { registerSafeTool, textOk } from "../responses.js";
import { audit } from "../audit.js";
import { appendRemoteSiteOpsLog, ensureRemoteDir } from "../remote_site_ops_logger.js";
import { assertRestorableMetadata, buildRestoreMetadataPath, parseRestoreMetadata } from "../remote_site_restore_resolver.js";
import { buildMetadataManifest } from "../remote_site_metadata_manifest_writer.js";
import {
  REL_PATH_INPUT,
  READ_ONLY,
  STATE_CHANGING,
  LIST_REMOTE_SITE_FILES_OUTPUT,
  READ_REMOTE_SITE_FILE_OUTPUT,
  WRITE_REMOTE_SITE_FILE_OUTPUT,
  EDIT_REMOTE_SITE_FILE_OUTPUT,
  DELETE_REMOTE_SITE_FILE_OUTPUT,
  MOVE_REMOTE_SITE_FILE_OUTPUT,
  RESTORE_REMOTE_SITE_FILE_OUTPUT,
  assertAllowedFileExtension,
  artifactPath,
  diffPath,
  joinRemoteUnderRoot,
  makeUnifiedDiff,
  normalizeRemoteRelativePath,
  putRemoteText,
  readRemoteText,
  toolBaseInput,
  withSftp,
  writeRemoteMetadataManifest,
} from "./shared_runtime.js";

export function registerRemoteSiteFileOpsTools(server) {
  registerSafeTool(server, "list_remote_site_files", {
    title: "List remote site files",
    description: "List files under the bounded ROMION public site webroot over SFTP. Requires a per-call VPS config reference.",
    inputSchema: toolBaseInput({ remote_path: z.string().default(".") }),
    outputSchema: LIST_REMOTE_SITE_FILES_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ vps_config_ref, remote_path }) => {
    return withSftp(vps_config_ref, async (client, config) => {
      const rel = remote_path === "." ? "." : normalizeRemoteRelativePath(remote_path);
      const remoteDir = rel === "." ? config.siteRoot : joinRemoteUnderRoot(config.siteRoot, rel);
      const entries = await client.list(remoteDir);
      await audit("list_remote_site_files", { vps_config_ref, remote_path: rel, count: entries.length });
      await appendRemoteSiteOpsLog(client, config, { action: "list", remote_path: rel, count: entries.length });
      return { status: "ok", remote_path: rel, count: entries.length, entries };
    });
  });

  registerSafeTool(server, "read_remote_site_file", {
    title: "Read remote site file",
    description: "Read a bounded UTF-8 file under the ROMION public site webroot over SFTP.",
    inputSchema: toolBaseInput({ ...REL_PATH_INPUT.shape }),
    outputSchema: READ_REMOTE_SITE_FILE_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ vps_config_ref, remote_path }) => {
    return withSftp(vps_config_ref, async (client, config) => {
      const rel = normalizeRemoteRelativePath(remote_path);
      assertAllowedFileExtension(rel, config.allowedExtensions);
      const remoteFile = joinRemoteUnderRoot(config.siteRoot, rel);
      const text = await readRemoteText(client, remoteFile, config.maxFileBytes);
      await audit("read_remote_site_file", { vps_config_ref, remote_path: rel, bytes: Buffer.byteLength(text, "utf8") });
      await appendRemoteSiteOpsLog(client, config, { action: "read", remote_path: rel, bytes: Buffer.byteLength(text, "utf8") });
      return textOk(text, { status: "ok", remote_path: rel, bytes: Buffer.byteLength(text, "utf8") });
    });
  });

  registerSafeTool(server, "write_remote_site_file", {
    title: "Write remote site file",
    description: "Write a bounded UTF-8 file under the ROMION public site webroot. Existing file diffs are stored outside webroot.",
    inputSchema: toolBaseInput({ remote_path: z.string(), content: z.string() }),
    outputSchema: WRITE_REMOTE_SITE_FILE_OUTPUT,
    annotations: STATE_CHANGING,
  }, async ({ vps_config_ref, remote_path, content }) => {
    return withSftp(vps_config_ref, async (client, config) => {
      const rel = normalizeRemoteRelativePath(remote_path);
      assertAllowedFileExtension(rel, config.allowedExtensions);
      const remoteFile = joinRemoteUnderRoot(config.siteRoot, rel);
      let before = "";
      let existed = true;
      try { before = await readRemoteText(client, remoteFile, config.maxFileBytes); }
      catch { existed = false; }
      if (existed) {
        const patchFile = diffPath({ opsRoot: config.opsRoot, remotePath: rel });
        await ensureRemoteDir(client, posixPath.dirname(patchFile));
        await client.put(Buffer.from(makeUnifiedDiff({ remotePath: rel, before, after: content }), "utf8"), patchFile);
      }
      const bytes = await putRemoteText(client, remoteFile, content, config.maxFileBytes);

      const manifest = buildMetadataManifest({
        operation: "write",
        remotePath: rel,
        artifactPath: existed ? diffPath({ opsRoot: config.opsRoot, remotePath: rel }) : null,
        details: {
          existed,
          bytes_after: bytes,
          bytes_before: existed ? Buffer.byteLength(before, "utf8") : 0,
        },
      });
      const metadataPath = await writeRemoteMetadataManifest(client, config, manifest);

      await audit("write_remote_site_file", {
        vps_config_ref,
        remote_path: rel,
        bytes,
        existed,
        metadata_path: metadataPath,
        operation_id: manifest.operation_id,
        correlation_id: manifest.correlation_id,
      });
      await appendRemoteSiteOpsLog(client, config, {
        action: "write",
        remote_path: rel,
        bytes,
        existed,
        operation_id: manifest.operation_id,
        correlation_id: manifest.correlation_id,
        artifact: manifest.artifact_path,
        details: {
          metadata_path: metadataPath,
          bytes_before: existed ? Buffer.byteLength(before, "utf8") : 0,
          bytes_after: bytes,
        },
      });
      return {
        status: "written",
        remote_path: rel,
        bytes,
        diff_created: existed,
        metadata_path: metadataPath,
        operation_id: manifest.operation_id,
        correlation_id: manifest.correlation_id,
      };
    });
  });

  registerSafeTool(server, "edit_remote_site_file", {
    title: "Edit remote site file",
    description: "Replace file content after writing a diff artifact outside webroot.",
    inputSchema: toolBaseInput({ remote_path: z.string(), content: z.string() }),
    outputSchema: EDIT_REMOTE_SITE_FILE_OUTPUT,
    annotations: STATE_CHANGING,
  }, async ({ vps_config_ref, remote_path, content }) => {
    return withSftp(vps_config_ref, async (client, config) => {
      const rel = normalizeRemoteRelativePath(remote_path);
      assertAllowedFileExtension(rel, config.allowedExtensions);
      const remoteFile = joinRemoteUnderRoot(config.siteRoot, rel);
      const before = await readRemoteText(client, remoteFile, config.maxFileBytes);
      const patchFile = diffPath({ opsRoot: config.opsRoot, remotePath: rel });
      await ensureRemoteDir(client, posixPath.dirname(patchFile));
      await client.put(Buffer.from(makeUnifiedDiff({ remotePath: rel, before, after: content }), "utf8"), patchFile);
      const bytes = await putRemoteText(client, remoteFile, content, config.maxFileBytes);

      const manifest = buildMetadataManifest({
        operation: "edit",
        remotePath: rel,
        artifactPath: patchFile,
        details: {
          diff_path: patchFile,
          bytes_after: bytes,
          bytes_before: Buffer.byteLength(before, "utf8"),
        },
      });
      const metadataPath = await writeRemoteMetadataManifest(client, config, manifest);

      await audit("edit_remote_site_file", {
        vps_config_ref,
        remote_path: rel,
        bytes,
        diff: patchFile,
        metadata_path: metadataPath,
        operation_id: manifest.operation_id,
        correlation_id: manifest.correlation_id,
      });
      await appendRemoteSiteOpsLog(client, config, {
        action: "edit",
        remote_path: rel,
        bytes,
        diff: patchFile,
        operation_id: manifest.operation_id,
        correlation_id: manifest.correlation_id,
        artifact: patchFile,
        details: {
          metadata_path: metadataPath,
          bytes_before: Buffer.byteLength(before, "utf8"),
          bytes_after: bytes,
        },
      });
      return {
        status: "edited",
        remote_path: rel,
        bytes,
        diff: patchFile,
        metadata_path: metadataPath,
        operation_id: manifest.operation_id,
        correlation_id: manifest.correlation_id,
      };
    });
  });

  registerSafeTool(server, "delete_remote_site_file", {
    title: "Soft-delete remote site file",
    description: "Move a remote site file to private trash outside webroot. No hard delete.",
    inputSchema: toolBaseInput({ ...REL_PATH_INPUT.shape }),
    outputSchema: DELETE_REMOTE_SITE_FILE_OUTPUT,
    annotations: STATE_CHANGING,
  }, async ({ vps_config_ref, remote_path }) => {
    return withSftp(vps_config_ref, async (client, config) => {
      const rel = normalizeRemoteRelativePath(remote_path);
      assertAllowedFileExtension(rel, config.allowedExtensions);
      const source = joinRemoteUnderRoot(config.siteRoot, rel);
      const target = artifactPath({ opsRoot: config.opsRoot, kind: "trash", remotePath: rel, suffix: "deleted" });
      await ensureRemoteDir(client, posixPath.dirname(target));
      await client.rename(source, target);

      const manifest = buildMetadataManifest({
        operation: "delete",
        remotePath: rel,
        artifactPath: target,
        details: {
          source_path: source,
          trash_path: target,
        },
      });
      const metadataPath = await writeRemoteMetadataManifest(client, config, manifest);

      await audit("delete_remote_site_file", {
        vps_config_ref,
        remote_path: rel,
        trash_path: target,
        metadata_path: metadataPath,
        operation_id: manifest.operation_id,
        correlation_id: manifest.correlation_id,
      });
      await appendRemoteSiteOpsLog(client, config, {
        action: "delete",
        remote_path: rel,
        trash_path: target,
        operation_id: manifest.operation_id,
        correlation_id: manifest.correlation_id,
        artifact: target,
        details: {
          metadata_path: metadataPath,
        },
      });
      return {
        status: "moved_to_trash",
        remote_path: rel,
        trash_path: target,
        metadata_path: metadataPath,
        operation_id: manifest.operation_id,
        correlation_id: manifest.correlation_id,
      };
    });
  });

  registerSafeTool(server, "move_remote_site_file", {
    title: "Move remote site file",
    description: "Move a remote site file inside the bounded public webroot. Overwrite is forbidden in v1.",
    inputSchema: toolBaseInput({ source_path: z.string(), target_path: z.string() }),
    outputSchema: MOVE_REMOTE_SITE_FILE_OUTPUT,
    annotations: STATE_CHANGING,
  }, async ({ vps_config_ref, source_path, target_path }) => {
    return withSftp(vps_config_ref, async (client, config) => {
      const sourceRel = normalizeRemoteRelativePath(source_path);
      const targetRel = normalizeRemoteRelativePath(target_path);
      assertAllowedFileExtension(sourceRel, config.allowedExtensions);
      assertAllowedFileExtension(targetRel, config.allowedExtensions);
      const source = joinRemoteUnderRoot(config.siteRoot, sourceRel);
      const target = joinRemoteUnderRoot(config.siteRoot, targetRel);
      try {
        await client.stat(target);
        throw new Error("target already exists; overwrite is forbidden in v1");
      } catch (err) {
        if (!/No such file|not exist|ENOENT/i.test(err?.message || String(err))) throw err;
      }
      await ensureRemoteDir(client, posixPath.dirname(target));
      await client.rename(source, target);
      await audit("move_remote_site_file", { vps_config_ref, source_path: sourceRel, target_path: targetRel });
      await appendRemoteSiteOpsLog(client, config, { action: "move", source_path: sourceRel, target_path: targetRel });
      return { status: "moved", source_path: sourceRel, target_path: targetRel };
    });
  });

  registerSafeTool(server, "restore_remote_site_file", {
    title: "Restore remote site file",
    description: "Restore a file from private trash using a metadata operation id. Restore v1 supports delete metadata only and forbids overwrite.",
    inputSchema: toolBaseInput({ operation_id: z.string().min(1) }),
    outputSchema: RESTORE_REMOTE_SITE_FILE_OUTPUT,
    annotations: STATE_CHANGING,
  }, async ({ vps_config_ref, operation_id }) => {
    return withSftp(vps_config_ref, async (client, config) => {
      const metadataPath = buildRestoreMetadataPath({
        opsRoot: config.opsRoot,
        operationId: operation_id,
      });

      const rawMetadata = await client.get(metadataPath);
      const metadataText = Buffer.isBuffer(rawMetadata) ? rawMetadata.toString("utf8") : String(rawMetadata);
      const deleteMetadata = assertRestorableMetadata(parseRestoreMetadata(metadataText));

      const targetRel = normalizeRemoteRelativePath(deleteMetadata.remote_path);
      assertAllowedFileExtension(targetRel, config.allowedExtensions);
      const source = deleteMetadata.artifact_path;
      const target = joinRemoteUnderRoot(config.siteRoot, targetRel);
      const trashRoot = posixPath.normalize(posixPath.join(config.opsRoot, "trash"));
      const cleanSource = posixPath.normalize(String(source || "").replace(/\\/g, "/"));
      if (cleanSource !== trashRoot && !cleanSource.startsWith(`${trashRoot}/`)) {
        throw new Error("restore artifact is outside trash root");
      }

      try {
        await client.stat(target);
        throw new Error("restore target already exists; overwrite is forbidden in v1");
      } catch (err) {
        if (!/No such file|not exist|ENOENT/i.test(err?.message || String(err))) throw err;
      }

      await ensureRemoteDir(client, posixPath.dirname(target));
      await client.rename(cleanSource, target);

      const restoreManifest = buildMetadataManifest({
        operation: "restore",
        remotePath: targetRel,
        artifactPath: target,
        correlationId: deleteMetadata.correlation_id,
        details: {
          restored_from_operation_id: deleteMetadata.operation_id,
          restored_from_metadata_path: metadataPath,
          restored_from_artifact_path: cleanSource,
          restore_target_path: target,
        },
      });
      const restoreMetadataPath = await writeRemoteMetadataManifest(client, config, restoreManifest);

      await audit("restore_remote_site_file", {
        vps_config_ref,
        operation_id,
        remote_path: targetRel,
        restored_from: cleanSource,
        restore_metadata_path: restoreMetadataPath,
        restore_operation_id: restoreManifest.operation_id,
        correlation_id: restoreManifest.correlation_id,
      });
      await appendRemoteSiteOpsLog(client, config, {
        action: "restore",
        remote_path: targetRel,
        operation_id: restoreManifest.operation_id,
        correlation_id: restoreManifest.correlation_id,
        artifact: target,
        details: {
          restored_from_operation_id: deleteMetadata.operation_id,
          restored_from_metadata_path: metadataPath,
          restore_metadata_path: restoreMetadataPath,
        },
      });

      return {
        status: "restored",
        remote_path: targetRel,
        restored_from: cleanSource,
        restored_to: target,
        source_operation_id: deleteMetadata.operation_id,
        restore_operation_id: restoreManifest.operation_id,
        correlation_id: restoreManifest.correlation_id,
        restore_metadata_path: restoreMetadataPath,
      };
    });
  });
}

