import { z } from "zod";
import fs from "fs/promises";
import path from "path";

import { registerSafeTool } from "../responses.js";
import { safePath, toRel, assertWritablePath } from "../paths.js";
import { audit } from "../audit.js";
import { evaluatePolicyRisk, enforcePolicyDecision } from "../policy/engine.js";
import { createBackupIfExists, trashNameFor, writeJson, readJson } from "../fs_ops.js";
import { TRASH_DIR, MAX_WRITE_BYTES } from "../config.js";

const STATE_CHANGING = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};

const WRITE_FILE_OUTPUT = z.object({
  status: z.literal("written"),
  path: z.string(),
  bytes: z.number().int().nonnegative(),
  backup: z.string().nullable(),
}).strict();

const APPEND_FILE_OUTPUT = z.object({
  status: z.literal("appended"),
  path: z.string(),
  bytes: z.number().int().nonnegative(),
  backup: z.string().nullable(),
}).strict();

const COPY_PATH_OUTPUT = z.object({
  status: z.literal("copied"),
  from: z.string(),
  to: z.string(),
  backup: z.string().nullable(),
}).strict();

const MOVE_PATH_OUTPUT = z.object({
  status: z.literal("moved"),
  from: z.string(),
  to: z.string(),
}).strict();

const DELETE_PATH_OUTPUT = z.object({
  status: z.literal("moved_to_trash"),
  from: z.string(),
  to: z.string(),
  metadata: z.string(),
}).strict();

const RESTORE_PATH_OUTPUT = z.object({
  status: z.literal("restored"),
  from: z.string(),
  to: z.string(),
}).strict();

export function registerFsMutationTools(server) {
  registerSafeTool(server, "write_file", {
    title: "Write file",
    description: "Create or overwrite a UTF-8 file inside configured workspace roots. Creates a backup when overwriting existing files.",
    inputSchema: z.object({
      path: z.string(),
      content: z.string(),
      allow_protected: z.boolean().default(false),
    }),
    outputSchema: WRITE_FILE_OUTPUT,
    annotations: DESTRUCTIVE,
  }, async ({ path: requestedPath, content, allow_protected }) => {
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > MAX_WRITE_BYTES) throw new Error(`Write blocked: content is larger than ${MAX_WRITE_BYTES} bytes.`);

    const policy = evaluatePolicyRisk({
      operation: "write_file",
      target: requestedPath,
      delta_bytes: bytes,
      intent: "change_behavior",
      has_dry_run: false,
    });
    enforcePolicyDecision(policy, { confirm: true });

    assertWritablePath(requestedPath, { allowProtected: allow_protected });
    const filePath = safePath(requestedPath);
    const backup = await createBackupIfExists(filePath);

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
    await audit("write_file", { path: toRel(filePath), bytes, backup, allow_protected });
    return { status: "written", path: toRel(filePath), bytes, backup };
  });

  registerSafeTool(server, "append_file", {
    title: "Append file",
    description: "Append UTF-8 text to a file inside configured workspace roots. Creates a backup when appending to existing files.",
    inputSchema: z.object({
      path: z.string(),
      content: z.string(),
      allow_protected: z.boolean().default(false),
    }),
    outputSchema: APPEND_FILE_OUTPUT,
    annotations: STATE_CHANGING,
  }, async ({ path: requestedPath, content, allow_protected }) => {
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > MAX_WRITE_BYTES) throw new Error(`Append blocked: content is larger than ${MAX_WRITE_BYTES} bytes.`);

    const policy = evaluatePolicyRisk({
      operation: "append_file",
      target: requestedPath,
      delta_bytes: bytes,
      intent: "change_behavior",
      has_dry_run: false,
    });
    enforcePolicyDecision(policy, { confirm: true });

    assertWritablePath(requestedPath, { allowProtected: allow_protected });
    const filePath = safePath(requestedPath);
    const backup = await createBackupIfExists(filePath);

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, content, "utf8");
    await audit("append_file", { path: toRel(filePath), bytes, backup, allow_protected });
    return { status: "appended", path: toRel(filePath), bytes, backup };
  });

  registerSafeTool(server, "copy_path", {
    title: "Copy path",
    description: "Copy a file or directory inside configured workspace roots.",
    inputSchema: z.object({
      from: z.string(),
      to: z.string(),
      allow_protected: z.boolean().default(false),
    }),
    outputSchema: COPY_PATH_OUTPUT,
    annotations: STATE_CHANGING,
  }, async ({ from, to, allow_protected }) => {
    const policy = evaluatePolicyRisk({
      operation: "copy_path",
      target: `${from} -> ${to}`,
      intent: "change_behavior",
      has_dry_run: false,
    });
    enforcePolicyDecision(policy, { confirm: true });

    assertWritablePath(to, { allowProtected: allow_protected });
    const fromPath = safePath(from);
    const toPath = safePath(to);
    const backup = await createBackupIfExists(toPath);

    await fs.mkdir(path.dirname(toPath), { recursive: true });
    await fs.cp(fromPath, toPath, { recursive: true, force: true });
    await audit("copy_path", { from: toRel(fromPath), to: toRel(toPath), backup, allow_protected });
    return { status: "copied", from: toRel(fromPath), to: toRel(toPath), backup };
  });

  registerSafeTool(server, "move_path", {
    title: "Move path",
    description: "Move or rename a file/folder inside configured workspace roots.",
    inputSchema: z.object({
      from: z.string(),
      to: z.string(),
      allow_protected: z.boolean().default(false),
    }),
    outputSchema: MOVE_PATH_OUTPUT,
    annotations: DESTRUCTIVE,
  }, async ({ from, to, allow_protected }) => {
    const policy = evaluatePolicyRisk({
      operation: "move_path",
      target: `${from} -> ${to}`,
      intent: "remove",
      has_dry_run: false,
    });
    enforcePolicyDecision(policy, { confirm: true });

    assertWritablePath(from, { allowProtected: allow_protected });
    assertWritablePath(to, { allowProtected: allow_protected });

    const fromPath = safePath(from);
    const toPath = safePath(to);
    await fs.mkdir(path.dirname(toPath), { recursive: true });
    await fs.rename(fromPath, toPath);
    await audit("move_path", { from: toRel(fromPath), to: toRel(toPath), allow_protected });
    return { status: "moved", from: toRel(fromPath), to: toRel(toPath) };
  });

  registerSafeTool(server, "delete_path", {
    title: "Delete path",
    description: "Soft-delete a file or directory inside configured workspace roots by moving it to .mcp_trash and writing restore metadata.",
    inputSchema: z.object({
      path: z.string(),
      allow_protected: z.boolean().default(false),
    }),
    outputSchema: DELETE_PATH_OUTPUT,
    annotations: DESTRUCTIVE,
  }, async ({ path: requestedPath, allow_protected }) => {
    const policy = evaluatePolicyRisk({
      operation: "delete_path",
      target: requestedPath,
      intent: "remove",
      has_dry_run: false,
    });
    enforcePolicyDecision(policy, { confirm: true });

    assertWritablePath(requestedPath, { allowProtected: allow_protected });
    const target = safePath(requestedPath);
    const rel = toRel(target);
    if (rel === ".") throw new Error("Refusing to delete root.");

    await fs.mkdir(TRASH_DIR, { recursive: true });
    const trashPath = path.join(TRASH_DIR, trashNameFor(rel));
    await fs.rename(target, trashPath);

    const metadataPath = `${trashPath}.json`;
    await writeJson(metadataPath, {
      deleted_at: new Date().toISOString(),
      original_path: rel,
      trash_path: toRel(trashPath),
    });

    await audit("delete_path_soft", { from: rel, to: toRel(trashPath), metadata: toRel(metadataPath), allow_protected });
    return { status: "moved_to_trash", from: rel, to: toRel(trashPath), metadata: toRel(metadataPath) };
  });

  registerSafeTool(server, "restore_path", {
    title: "Restore path",
    description: "Restore a file or directory from .mcp_trash. If destination is omitted, original path is read from metadata when available.",
    inputSchema: z.object({
      trash_path: z.string(),
      destination: z.string().optional(),
      overwrite: z.boolean().default(false),
      allow_protected: z.boolean().default(false),
    }),
    outputSchema: RESTORE_PATH_OUTPUT,
    annotations: DESTRUCTIVE,
  }, async ({ trash_path, destination, overwrite, allow_protected }) => {
    const trashFull = safePath(trash_path);
    const trashRel = toRel(trashFull);
    if (!trashRel.startsWith(".mcp_trash/")) throw new Error("restore_path only accepts paths inside .mcp_trash.");

    let destRel = destination;
    const metadataPath = `${trashFull}.json`;
    if (!destRel) {
      try {
        const meta = await readJson(metadataPath);
        destRel = meta.original_path;
      } catch {
        throw new Error("Destination omitted and restore metadata was not found.");
      }
    }

    assertWritablePath(destRel, { allowProtected: allow_protected });
    const destFull = safePath(destRel);

    try {
      await fs.stat(destFull);
      if (!overwrite) throw new Error("Destination already exists. Set overwrite=true to replace it.");
      await createBackupIfExists(destFull);
      await fs.rm(destFull, { recursive: true, force: true });
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }

    await fs.mkdir(path.dirname(destFull), { recursive: true });
    await fs.rename(trashFull, destFull);
    try { await fs.rm(metadataPath, { force: true }); } catch {}

    await audit("restore_path", { from: trashRel, to: toRel(destFull), overwrite, allow_protected });
    return { status: "restored", from: trashRel, to: toRel(destFull) };
  });
}
