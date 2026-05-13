import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import posixPath from "path/posix";

import { registerSafeTool, textOk } from "../core/responses.js";
import { safePath } from "../core/paths.js";
import { audit } from "../core/audit.js";
import {
  appendRemoteSiteOpsLog,
  ensureRemoteDir,
  ensureRemoteSiteOpsDirs,
} from "./remote_site_ops_logger.js";
import {
  buildMetadataManifest,
  buildMetadataManifestLocation,
} from "./remote_site_metadata_manifest_writer.js";
import {
  assertRestorableMetadata,
  buildRestoreMetadataPath,
  parseRestoreMetadata,
} from "./remote_site_restore_resolver.js";
import {
  buildRemoteRetentionPreviewOperation,
} from "./remote_site_retention_tool_runtime.js";
import {
  buildRemoteSiteRuntimeStatus,
} from "./remote_site_runtime_status.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const STATE_CHANGING = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

const DEFAULT_MAX_FILE_BYTES = 256 * 1024;
const DEFAULT_RETENTION_COUNT = 20;
const DEFAULT_RETENTION_DAYS = 30;

const ALLOWED_EXTENSIONS = new Set([
  ".html",
  ".css",
  ".js",
  ".txt",
  ".json",
  ".svg",
  ".ico",
]);

const CONFIG_REF_INPUT = z.object({
  vps_config_ref: z.string(),
});

const REL_PATH_INPUT = z.object({
  remote_path: z.string(),
});

const REMOTE_CONFIG = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().min(1),
  privateKeyPath: z.string().min(1),
  passphrase: z.string().optional(),
  siteRoot: z.string().min(1),
  opsRoot: z.string().min(1),
  maxFileBytes: z.number().int().min(1).max(5 * 1024 * 1024).default(DEFAULT_MAX_FILE_BYTES),
  retentionCount: z.number().int().min(1).max(200).default(DEFAULT_RETENTION_COUNT),
  retentionDays: z.number().int().min(1).max(365).default(DEFAULT_RETENTION_DAYS),
  allowedExtensions: z.array(z.string()).optional(),
});

const REMOTE_SITE_FILE_ENTRY_OUTPUT = z.object({
  type: z.string(),
  name: z.string(),
  size: z.number().int().nonnegative().optional(),
  modifyTime: z.number().int().nonnegative().optional(),
  accessTime: z.number().int().nonnegative().optional(),
  rights: z.object({
    user: z.string().optional(),
    group: z.string().optional(),
    other: z.string().optional(),
  }).partial().optional(),
  owner: z.number().int().nonnegative().optional(),
  group: z.number().int().nonnegative().optional(),
  longname: z.string().optional(),
}).passthrough();

const LIST_REMOTE_SITE_FILES_OUTPUT = z.object({
  status: z.literal("ok"),
  remote_path: z.string(),
  count: z.number().int().nonnegative(),
  entries: z.array(REMOTE_SITE_FILE_ENTRY_OUTPUT),
}).strict();

const READ_REMOTE_SITE_FILE_OUTPUT = z.object({
  status: z.literal("ok"),
  remote_path: z.string(),
  bytes: z.number().int().nonnegative(),
  text: z.string(),
}).strict();

const WRITE_REMOTE_SITE_FILE_OUTPUT = z.object({
  status: z.literal("written"),
  remote_path: z.string(),
  bytes: z.number().int().nonnegative(),
  diff_created: z.boolean(),
  metadata_path: z.string(),
  operation_id: z.string(),
  correlation_id: z.string(),
}).strict();

const EDIT_REMOTE_SITE_FILE_OUTPUT = z.object({
  status: z.literal("edited"),
  remote_path: z.string(),
  bytes: z.number().int().nonnegative(),
  diff: z.string(),
  metadata_path: z.string(),
  operation_id: z.string(),
  correlation_id: z.string(),
}).strict();

const DELETE_REMOTE_SITE_FILE_OUTPUT = z.object({
  status: z.literal("moved_to_trash"),
  remote_path: z.string(),
  trash_path: z.string(),
  metadata_path: z.string(),
  operation_id: z.string(),
  correlation_id: z.string(),
}).strict();

const MOVE_REMOTE_SITE_FILE_OUTPUT = z.object({
  status: z.literal("moved"),
  source_path: z.string(),
  target_path: z.string(),
}).strict();

const RESTORE_REMOTE_SITE_FILE_OUTPUT = z.object({
  status: z.literal("restored"),
  remote_path: z.string(),
  restored_from: z.string(),
  restored_to: z.string(),
  source_operation_id: z.string(),
  restore_operation_id: z.string(),
  correlation_id: z.string(),
  restore_metadata_path: z.string(),
}).strict();

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function blocked(reason, details = {}) {
  return {
    status: "blocked",
    reason,
    ...details,
  };
}

export function normalizeRemoteRelativePath(input) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error("remote_path must be a non-empty string");
  }

  const raw = input.replace(/\\/g, "/").trim();
  if (raw.startsWith("/")) throw new Error("absolute remote paths are not allowed");
  if (raw.includes("\0")) throw new Error("NUL byte is not allowed");

  const normalized = posixPath.normalize(raw);
  if (normalized === "." || normalized === "") throw new Error("remote_path must target a file or directory");
  if (normalized === ".." || normalized.startsWith("../")) throw new Error("path traversal is not allowed");
  if (normalized.split("/").some((part) => part === ".." || part === "")) {
    throw new Error("unsafe path segment");
  }

  return normalized;
}

export function assertAllowedFileExtension(remotePath, allowedExtensions = ALLOWED_EXTENSIONS) {
  const ext = posixPath.extname(remotePath).toLowerCase();
  const allowed = allowedExtensions instanceof Set ? allowedExtensions : new Set(allowedExtensions);
  if (!allowed.has(ext)) {
    throw new Error(`remote_path extension is not allowed: ${ext || "<none>"}`);
  }
  return ext;
}

export function joinRemoteUnderRoot(root, relativePath) {
  const cleanRoot = posixPath.normalize(String(root || "").replace(/\\/g, "/"));
  if (!cleanRoot.startsWith("/")) throw new Error("remote root must be absolute POSIX path");
  const cleanRel = normalizeRemoteRelativePath(relativePath);
  const joined = posixPath.normalize(posixPath.join(cleanRoot, cleanRel));
  if (joined !== cleanRoot && !joined.startsWith(`${cleanRoot}/`)) {
    throw new Error("resolved remote path escapes root");
  }
  return joined;
}

function artifactPath({ opsRoot, kind, remotePath, suffix }) {
  const cleanRel = normalizeRemoteRelativePath(remotePath);
  const parsed = posixPath.parse(cleanRel);
  const safeName = `${parsed.name}__${suffix}_${timestamp()}${parsed.ext || ""}`;
  return posixPath.join(opsRoot, kind, parsed.dir, safeName);
}

function diffPath({ opsRoot, remotePath }) {
  const cleanRel = normalizeRemoteRelativePath(remotePath);
  const parsed = posixPath.parse(cleanRel);
  const safeName = `${parsed.name}__edited_${timestamp()}${parsed.ext || ""}.diff`;
  return posixPath.join(opsRoot, "edits", parsed.dir, safeName);
}

async function writeRemoteMetadataManifest(client, config, manifest) {
  const location = buildMetadataManifestLocation({
    opsRoot: config.opsRoot,
    record: manifest,
  });

  await ensureRemoteDir(client, location.meta_root);

  await client.put(
    Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
    location.full_path
  );

  return location.full_path;
}

function makeUnifiedDiff({ remotePath, before, after }) {
  const beforeLines = String(before ?? "").split(/\r?\n/);
  const afterLines = String(after ?? "").split(/\r?\n/);
  const out = [
    `--- a/${remotePath}`,
    `+++ b/${remotePath}`,
    `@@ generated ${new Date().toISOString()} @@`,
  ];

  const max = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < max; i += 1) {
    const a = beforeLines[i];
    const b = afterLines[i];
    if (a === b) {
      if (a !== undefined) out.push(` ${a}`);
    } else {
      if (a !== undefined) out.push(`-${a}`);
      if (b !== undefined) out.push(`+${b}`);
    }
  }
  return `${out.join("\n")}\n`;
}

async function readConfigFromRef(vpsConfigRef) {
  const configPath = safePath(vpsConfigRef);
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw);
  const config = REMOTE_CONFIG.parse(parsed);

  const privateKeyPath = path.resolve(config.privateKeyPath);
  const privateKey = await fs.readFile(privateKeyPath, "utf8");

  return {
    ...config,
    privateKey,
    allowedExtensions: new Set(config.allowedExtensions || Array.from(ALLOWED_EXTENSIONS)),
  };
}

async function loadSftpClient() {
  try {
    const mod = await import("ssh2-sftp-client");
    return mod.default || mod;
  } catch (err) {
    throw new Error(`ssh2-sftp-client dependency unavailable: ${err?.message || String(err)}`);
  }
}

async function withSftp(vpsConfigRef, fn) {
  let config;
  try {
    config = await readConfigFromRef(vpsConfigRef);
  } catch (err) {
    return blocked("no_valid_vps_access_config", { message: err?.message || String(err) });
  }

  const SftpClient = await loadSftpClient();
  const client = new SftpClient();
  try {
    await client.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      privateKey: config.privateKey,
      passphrase: config.passphrase,
      readyTimeout: 15000,
    });

    await ensureRemoteSiteOpsDirs(client, config);

    return await fn(client, config);
  } finally {
    try { await client.end(); } catch {}
  }
}

async function readRemoteText(client, remoteFile, maxBytes) {
  const stat = await client.stat(remoteFile);
  if (!stat || stat.type === "d") throw new Error("remote target is not a file");
  if (stat.size > maxBytes) throw new Error(`remote file exceeds maxFileBytes: ${stat.size}`);
  const data = await client.get(remoteFile);
  return Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
}

async function putRemoteText(client, remoteFile, content, maxBytes) {
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > maxBytes) throw new Error(`content exceeds maxFileBytes: ${bytes}`);
  await ensureRemoteDir(client, posixPath.dirname(remoteFile));
  await client.put(Buffer.from(content, "utf8"), remoteFile);
  return bytes;
}

function toolBaseInput(extra) {
  return CONFIG_REF_INPUT.extend(extra);
}

function runtimeStatusBlocked(reason, message) {
  const payload = {
    status: "blocked",
    generated_at: new Date().toISOString(),
    inventory: {
      total_artifacts: 0,
      total_size: 0,
      by_area: {},
      permission_warnings: [],
      invalid_entries: [],
    },
    metadata: {
      total_records: 0,
      by_operation: {},
      by_schema_version: {},
      invalid_records: [],
    },
    logs: {
      total_lines: 0,
      by_schema: {},
      by_operation: {},
      invalid_lines: [],
    },
    warnings: [{ code: reason, message }],
  };
  payload.text = JSON.stringify(payload, null, 2);
  return payload;
}

function remoteRowMode(row) {
  if (!row || typeof row !== "object") return null;
  if (row.mode !== undefined) return row.mode;
  if (row.rights && typeof row.rights === "object") return row.rights;
  if (typeof row.longname === "string") {
    const match = row.longname.match(/^[dl-]([rwx-]{3})([rwx-]{3})([rwx-]{3})/);
    if (match) {
      return {
        user: match[1].replace(/-/g, ""),
        group: match[2].replace(/-/g, ""),
        other: match[3].replace(/-/g, ""),
      };
    }
  }
  return null;
}

async function collectOpsRootInventory(client, opsRoot) {
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
        mode: remoteRowMode(row),
        type: row.type === "-" ? "file" : row.type || "file",
      });
    }
  }

  await walk(opsRoot);
  return inventory;
}

async function readOpsMetadataRecords(client, opsRoot, inventory) {
  const metadataFiles = inventory
    .filter((entry) => entry.path.startsWith("meta/") && entry.path.endsWith(".json"))
    .map((entry) => entry.path);

  return Promise.all(
    metadataFiles.map(async (rel) => {
      try {
        const data = await client.get(posixPath.join(opsRoot, rel));
        const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
        return JSON.parse(text);
      } catch (error) {
        return {
          schema_version: -1,
          operation: "invalid_metadata",
          operation_id: rel,
          error: error?.message || String(error),
        };
      }
    })
  );
}

async function readOpsLogLines(client, opsRoot) {
  try {
    const data = await client.get(posixPath.join(opsRoot, "logs", "site-files.log"));
    const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
    return text.split(/\r?\n/).filter((line) => line.trim());
  } catch {
    return [];
  }
}

export function registerRemoteSiteTools(server) {
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
