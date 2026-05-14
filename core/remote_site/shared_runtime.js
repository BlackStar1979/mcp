import fs from "fs/promises";
import path from "path";
import posixPath from "path/posix";

import { z } from "zod";

import { safePath } from "../paths.js";
import { ensureRemoteDir, ensureRemoteSiteOpsDirs } from "../remote_site_ops_logger.js";
import { buildMetadataManifestLocation } from "../remote_site_metadata_manifest_writer.js";

export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const STATE_CHANGING = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export const DEFAULT_MAX_FILE_BYTES = 256 * 1024;
export const DEFAULT_RETENTION_COUNT = 20;
export const DEFAULT_RETENTION_DAYS = 30;

export const ALLOWED_EXTENSIONS = new Set([
  ".html",
  ".css",
  ".js",
  ".txt",
  ".json",
  ".svg",
  ".ico",
]);

export const CONFIG_REF_INPUT = z.object({
  vps_config_ref: z.string(),
});

export const REL_PATH_INPUT = z.object({
  remote_path: z.string(),
});

export const REMOTE_CONFIG = z.object({
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

export const REMOTE_SITE_FILE_ENTRY_OUTPUT = z.object({
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

export const LIST_REMOTE_SITE_FILES_OUTPUT = z.object({
  status: z.literal("ok"),
  remote_path: z.string(),
  count: z.number().int().nonnegative(),
  entries: z.array(REMOTE_SITE_FILE_ENTRY_OUTPUT),
}).strict();

export const READ_REMOTE_SITE_FILE_OUTPUT = z.object({
  status: z.literal("ok"),
  remote_path: z.string(),
  bytes: z.number().int().nonnegative(),
  text: z.string(),
}).strict();

export const WRITE_REMOTE_SITE_FILE_OUTPUT = z.object({
  status: z.literal("written"),
  remote_path: z.string(),
  bytes: z.number().int().nonnegative(),
  diff_created: z.boolean(),
  metadata_path: z.string(),
  operation_id: z.string(),
  correlation_id: z.string(),
}).strict();

export const EDIT_REMOTE_SITE_FILE_OUTPUT = z.object({
  status: z.literal("edited"),
  remote_path: z.string(),
  bytes: z.number().int().nonnegative(),
  diff: z.string(),
  metadata_path: z.string(),
  operation_id: z.string(),
  correlation_id: z.string(),
}).strict();

export const DELETE_REMOTE_SITE_FILE_OUTPUT = z.object({
  status: z.literal("moved_to_trash"),
  remote_path: z.string(),
  trash_path: z.string(),
  metadata_path: z.string(),
  operation_id: z.string(),
  correlation_id: z.string(),
}).strict();

export const MOVE_REMOTE_SITE_FILE_OUTPUT = z.object({
  status: z.literal("moved"),
  source_path: z.string(),
  target_path: z.string(),
}).strict();

export const RESTORE_REMOTE_SITE_FILE_OUTPUT = z.object({
  status: z.literal("restored"),
  remote_path: z.string(),
  restored_from: z.string(),
  restored_to: z.string(),
  source_operation_id: z.string(),
  restore_operation_id: z.string(),
  correlation_id: z.string(),
  restore_metadata_path: z.string(),
}).strict();

export function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function blocked(reason, details = {}) {
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

export function artifactPath({ opsRoot, kind, remotePath, suffix }) {
  const cleanRel = normalizeRemoteRelativePath(remotePath);
  const parsed = posixPath.parse(cleanRel);
  const safeName = `${parsed.name}__${suffix}_${timestamp()}${parsed.ext || ""}`;
  return posixPath.join(opsRoot, kind, parsed.dir, safeName);
}

export function diffPath({ opsRoot, remotePath }) {
  const cleanRel = normalizeRemoteRelativePath(remotePath);
  const parsed = posixPath.parse(cleanRel);
  const safeName = `${parsed.name}__edited_${timestamp()}${parsed.ext || ""}.diff`;
  return posixPath.join(opsRoot, "edits", parsed.dir, safeName);
}

export async function writeRemoteMetadataManifest(client, config, manifest) {
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

export function makeUnifiedDiff({ remotePath, before, after }) {
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

export async function readConfigFromRef(vpsConfigRef) {
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

export async function loadSftpClient() {
  try {
    const mod = await import("ssh2-sftp-client");
    return mod.default || mod;
  } catch (err) {
    throw new Error(`ssh2-sftp-client dependency unavailable: ${err?.message || String(err)}`);
  }
}

export async function withSftp(vpsConfigRef, fn) {
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

export async function readRemoteText(client, remoteFile, maxBytes) {
  const stat = await client.stat(remoteFile);
  if (!stat || stat.type === "d") throw new Error("remote target is not a file");
  if (stat.size > maxBytes) throw new Error(`remote file exceeds maxFileBytes: ${stat.size}`);
  const data = await client.get(remoteFile);
  return Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
}

export async function putRemoteText(client, remoteFile, content, maxBytes) {
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > maxBytes) throw new Error(`content exceeds maxFileBytes: ${bytes}`);
  await ensureRemoteDir(client, posixPath.dirname(remoteFile));
  await client.put(Buffer.from(content, "utf8"), remoteFile);
  return bytes;
}

export function toolBaseInput(extra) {
  return CONFIG_REF_INPUT.extend(extra);
}

export function runtimeStatusBlocked(reason, message) {
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

export function remoteRowMode(row) {
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

export async function collectOpsRootInventory(client, opsRoot) {
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

export async function readOpsMetadataRecords(client, opsRoot, inventory) {
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

export async function readOpsLogLines(client, opsRoot) {
  try {
    const data = await client.get(posixPath.join(opsRoot, "logs", "site-files.log"));
    const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
    return text.split(/\r?\n/).filter((line) => line.trim());
  } catch {
    return [];
  }
}

