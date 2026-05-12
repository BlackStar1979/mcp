import { z } from "zod";
import fs from "fs/promises";
import path from "path";

import { registerSafeTool, textOk, fail } from "./responses.js";
import { safePath, toRel, assertWritablePath } from "./paths.js";
import { audit } from "./audit.js";
import { evaluatePolicyRisk, enforcePolicyDecision } from "./policy/engine.js";
import { fileInfo, createBackupIfExists, trashNameFor, writeJson, readJson } from "./fs_ops.js";
import {
  TRASH_DIR,
  MAX_WRITE_BYTES,
  MAX_READ_FILE_CHARS,
  MAX_READ_LINES_CHARS,
  MAX_READ_CHUNK_CHARS,
} from "./config.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

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

const FILE_INFO_OUTPUT = z.object({
  path: z.string(),
  type: z.enum(["file", "directory"]),
  size: z.number().int().nonnegative(),
  created: z.string(),
  modified: z.string(),
}).strict();

const LIST_DIRECTORY_OUTPUT = z.object({
  path: z.string(),
  count: z.number().int().nonnegative(),
  entries: z.array(FILE_INFO_OUTPUT),
}).strict();

// STEP 5 — output schemas for IO readers. These schemas protect RULE-IO-001.
const READ_FILE_OUTPUT = z.object({
  path: z.string(),
  bytes: z.number(),
  chars: z.number(),
  returned_chars: z.number(),
  total_lines: z.number(),
  truncated: z.boolean(),
  text: z.string(),
  hint: z.string().optional(),
});

const READ_FILE_LINES_OUTPUT = z.object({
  path: z.string(),
  bytes: z.number(),
  start_line: z.number(),
  end_line: z.number(),
  effective_start_line: z.number(),
  effective_end_line: z.number().nullable(),
  total_lines: z.number(),
  returned_lines: z.number(),
  include_line_numbers: z.boolean(),
  returned_chars: z.number(),
  truncated: z.boolean(),
  text: z.string(),
  lines: z.array(z.object({
    line: z.number(),
    text: z.string(),
  })),
});

const READ_FILE_CHUNK_OUTPUT = z.object({
  path: z.string(),
  bytes: z.number(),
  chars: z.number(),
  offset: z.number(),
  length: z.number(),
  returned_chars: z.number(),
  next_offset: z.number(),
  has_more: z.boolean(),
  text: z.string(),
});

function normalizePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return n;
}

function lineCount(text) {
  if (text.length === 0) return 0;
  return text.split(/\r\n|\n|\r/).length;
}

function makeNumberedLines(lines, firstLine) {
  return lines.map((text, index) => ({
    line: firstLine + index,
    text,
  }));
}


function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while (true) {
    const found = text.indexOf(needle, index);
    if (found === -1) return count;
    count += 1;
    index = found + needle.length;
  }
}

function assertSingleOccurrence(text, needle, label) {
  const count = countOccurrences(text, needle);
  if (count !== 1) throw new Error(label + " must match exactly once; matched " + count + ".");
  return count;
}

function applyTextPatch(source, { mode, anchor, content }) {
  assertSingleOccurrence(source, anchor, "anchor");
  if (mode === "before") return source.replace(anchor, content + anchor);
  if (mode === "after") return source.replace(anchor, anchor + content);
  if (mode === "replace") return source.replace(anchor, content);
  throw new Error("Unsupported patch mode: " + mode);
}

export function registerFsTools(server) {
  registerSafeTool(server, "get_info", {
    title: "Get file or directory info",
    description: "Get metadata for a file or folder inside configured workspace roots.",
    inputSchema: z.object({ path: z.string() }),
    outputSchema: FILE_INFO_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ path: requestedPath }) => {
    const full = safePath(requestedPath);
    const info = await fileInfo(full);
    await audit("get_info", { path: info.path });
    return info;
  });

  registerSafeTool(server, "list_directory", {
    title: "List directory",
    description: "List files and folders inside configured workspace roots.",
    inputSchema: z.object({ path: z.string().default(".") }),
    outputSchema: LIST_DIRECTORY_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ path: requestedPath }) => {
    const dir = safePath(requestedPath);
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) throw new Error("Not a directory.");

    const entries = await fs.readdir(dir, { withFileTypes: true });
    const result = [];
    for (const entry of entries) result.push(await fileInfo(path.join(dir, entry.name)));

    await audit("list_directory", { path: toRel(dir), count: result.length });
    return { path: toRel(dir), count: result.length, entries: result };
  });

  server.registerTool("read_file", {
    title: "Read file",
    description: "Read bounded UTF-8 file content inside configured workspace roots. For large files use read_file_lines or read_file_chunk.",
    inputSchema: z.object({
      path: z.string(),
      max_chars: z.number().int().min(1000).max(100000).default(MAX_READ_FILE_CHARS),
    }),
    outputSchema: READ_FILE_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ path: requestedPath, max_chars }) => {
    try {
      const filePath = safePath(requestedPath);
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) throw new Error("Not a file.");

      const text = await fs.readFile(filePath, "utf8");
      const limit = normalizePositiveInt(max_chars, MAX_READ_FILE_CHARS);
      const truncated = text.length > limit;
      const returnedText = truncated ? text.slice(0, limit) : text;

      const payload = {
        path: toRel(filePath),
        bytes: stat.size,
        chars: text.length,
        returned_chars: returnedText.length,
        total_lines: lineCount(text),
        truncated,
        text: returnedText,
        hint: truncated ? "Use read_file_lines or read_file_chunk for precise continuation." : undefined,
      };

      await audit("read_file", {
        path: payload.path,
        bytes: payload.bytes,
        chars: payload.chars,
        returned_chars: payload.returned_chars,
        truncated: payload.truncated,
      });

      return textOk(returnedText, payload);
    } catch (err) {
      return fail(err?.message || String(err), { tool: "read_file" });
    }
  });

  server.registerTool("read_file_lines", {
    title: "Read file lines",
    description: "Read selected 1-based line range from a UTF-8 file inside configured workspace roots. Bounded text is returned both in content.text and structuredContent.text for agent compatibility.",
    inputSchema: z.object({
      path: z.string(),
      start_line: z.number().int().min(1),
      end_line: z.number().int().min(1),
      include_line_numbers: z.boolean().default(true),
      max_chars: z.number().int().min(1000).max(100000).default(MAX_READ_LINES_CHARS),
    }),
    outputSchema: READ_FILE_LINES_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ path: requestedPath, start_line, end_line, include_line_numbers, max_chars }) => {
    try {
      if (end_line < start_line) throw new Error("end_line must be greater than or equal to start_line.");

      const filePath = safePath(requestedPath);
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) throw new Error("Not a file.");

      const text = await fs.readFile(filePath, "utf8");
      const allLines = text.length === 0 ? [] : text.split(/\r\n|\n|\r/);
      const totalLines = allLines.length;
      const fromIndex = Math.max(0, start_line - 1);
      const toIndexExclusive = Math.min(totalLines, end_line);
      const selected = allLines.slice(fromIndex, toIndexExclusive);
      const effectiveStartLine = selected.length > 0 ? start_line : Math.min(start_line, totalLines + 1);

      const rendered = include_line_numbers
        ? selected.map((line, index) => `L${effectiveStartLine + index} ${line}`).join("\n")
        : selected.join("\n");

      const limit = normalizePositiveInt(max_chars, MAX_READ_LINES_CHARS);
      const truncated = rendered.length > limit;
      const returnedText = truncated ? rendered.slice(0, limit) : rendered;

      const payload = {
        path: toRel(filePath),
        bytes: stat.size,
        start_line,
        end_line,
        effective_start_line: effectiveStartLine,
        effective_end_line: selected.length > 0 ? effectiveStartLine + selected.length - 1 : null,
        total_lines: totalLines,
        returned_lines: selected.length,
        include_line_numbers,
        returned_chars: returnedText.length,
        truncated,
        text: returnedText,
        lines: makeNumberedLines(selected, effectiveStartLine),
      };

      await audit("read_file_lines", {
        path: payload.path,
        start_line,
        end_line,
        returned_lines: payload.returned_lines,
        returned_chars: payload.returned_chars,
        truncated,
      });

      return textOk(returnedText, payload);
    } catch (err) {
      return fail(err?.message || String(err), { tool: "read_file_lines" });
    }
  });

  server.registerTool("read_file_chunk", {
    title: "Read file chunk",
    description: "Read a bounded character chunk from a UTF-8 file inside configured workspace roots. Offset and length are character-based, not byte-based. Text is also included in structuredContent.text for agent compatibility.",
    inputSchema: z.object({
      path: z.string(),
      offset: z.number().int().min(0).default(0),
      length: z.number().int().min(1).max(100000).default(MAX_READ_CHUNK_CHARS),
    }),
    outputSchema: READ_FILE_CHUNK_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ path: requestedPath, offset, length }) => {
    try {
      const filePath = safePath(requestedPath);
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) throw new Error("Not a file.");

      const text = await fs.readFile(filePath, "utf8");
      const safeOffset = Math.max(0, offset);
      const safeLength = Math.min(length, MAX_READ_CHUNK_CHARS);
      const returnedText = text.slice(safeOffset, safeOffset + safeLength);

      const payload = {
        path: toRel(filePath),
        bytes: stat.size,
        chars: text.length,
        offset: safeOffset,
        length: safeLength,
        returned_chars: returnedText.length,
        next_offset: safeOffset + returnedText.length,
        has_more: safeOffset + returnedText.length < text.length,
        text: returnedText,
      };

      await audit("read_file_chunk", {
        path: payload.path,
        offset: safeOffset,
        length: safeLength,
        returned_chars: payload.returned_chars,
        has_more: payload.has_more,
      });

      return textOk(returnedText, payload);
    } catch (err) {
      return fail(err?.message || String(err), { tool: "read_file_chunk" });
    }
  });

  registerSafeTool(server, "write_file", {
    title: "Write file",
    description: "Create or overwrite a UTF-8 file inside configured workspace roots. Creates a backup when overwriting existing files.",
    inputSchema: z.object({
      path: z.string(),
      content: z.string(),
      allow_protected: z.boolean().default(false),
    }),
    annotations: DESTRUCTIVE,
  }, async ({ path: requestedPath, content, allow_protected }) => {
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > MAX_WRITE_BYTES) throw new Error(`Write blocked: content is larger than ${MAX_WRITE_BYTES} bytes.`);

    const policy = evaluatePolicyRisk({
      operation: "write_file",
      target: requestedPath,
      delta_bytes: bytes,
      intent: "change_behavior",
      has_dry_run: false
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
    annotations: STATE_CHANGING,
  }, async ({ path: requestedPath, content, allow_protected }) => {
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > MAX_WRITE_BYTES) throw new Error(`Append blocked: content is larger than ${MAX_WRITE_BYTES} bytes.`);

    const policy = evaluatePolicyRisk({
      operation: "append_file",
      target: requestedPath,
      delta_bytes: bytes,
      intent: "change_behavior",
      has_dry_run: false
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
    annotations: STATE_CHANGING,
  }, async ({ from, to, allow_protected }) => {
    const policy = evaluatePolicyRisk({
      operation: "copy_path",
      target: `${from} -> ${to}`,
      intent: "change_behavior",
      has_dry_run: false
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
    annotations: DESTRUCTIVE,
  }, async ({ from, to, allow_protected }) => {
    const policy = evaluatePolicyRisk({
      operation: "move_path",
      target: `${from} -> ${to}`,
      intent: "remove",
      has_dry_run: false
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
    annotations: DESTRUCTIVE,
  }, async ({ path: requestedPath, allow_protected }) => {
    const policy = evaluatePolicyRisk({
      operation: "delete_path",
      target: requestedPath,
      intent: "remove",
      has_dry_run: false
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


  registerSafeTool(server, "edit_file_patch", {
    title: "Patch text file by anchor",
    description: "Safely edit a UTF-8 text file inside configured workspace roots using an exact single anchor. Creates a backup; supports dry-run.",
    inputSchema: z.object({
      path: z.string(),
      anchor: z.string().min(1),
      content: z.string(),
      mode: z.enum(["before", "after", "replace"]).default("replace"),
      dry_run: z.boolean().default(true),
      allow_protected: z.boolean().default(false),
      require_markers: z.array(z.string()).default([]),
    }),
    annotations: STATE_CHANGING,
  }, async ({ path: requestedPath, anchor, content, mode, dry_run, allow_protected, require_markers }) => {
    assertWritablePath(requestedPath, { allowProtected: allow_protected });
    const policy = evaluatePolicyRisk({
      operation: "code_apply_patch",
      target: requestedPath,
      delta_bytes: content.length,
      intent: "change_behavior",
      has_dry_run: dry_run
    });
    enforcePolicyDecision(policy, { confirm: !dry_run });

    const filePath = safePath(requestedPath);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error("Not a file.");

    const original = await fs.readFile(filePath, "utf8");
    const matches = countOccurrences(original, anchor);
    if (matches !== 1) throw new Error("Patch blocked: anchor must match exactly once; matched " + matches + ".");

    const patched = applyTextPatch(original, { mode, anchor, content });
    for (const marker of require_markers || []) {
      if (!patched.includes(marker)) throw new Error("Patch blocked: required marker missing after patch: " + marker);
    }

    const bytesBefore = Buffer.byteLength(original, "utf8");
    const bytesAfter = Buffer.byteLength(patched, "utf8");
    if (bytesAfter > MAX_WRITE_BYTES) throw new Error("Patch blocked: patched file is larger than " + MAX_WRITE_BYTES + " bytes.");

    const payload = {
      status: dry_run ? "dry_run" : "patched",
      path: toRel(filePath),
      mode,
      anchor_matches: matches,
      bytes_before: bytesBefore,
      bytes_after: bytesAfter,
      delta_bytes: bytesAfter - bytesBefore,
      dry_run,
      backup: null,
    };

    if (dry_run) {
      await audit("edit_file_patch_dry_run", payload);
      return payload;
    }

    const backup = await createBackupIfExists(filePath);
    await fs.writeFile(filePath, patched, "utf8");
    payload.backup = backup;
    await audit("edit_file_patch", payload);
    return payload;
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

