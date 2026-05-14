import { z } from "zod";
import fs from "fs/promises";
import path from "path";

import { registerSafeTool, textOk, fail } from "../responses.js";
import { safePath, toRel } from "../paths.js";
import { audit } from "../audit.js";
import { fileInfo } from "../fs_ops.js";
import {
  MAX_READ_FILE_CHARS,
  MAX_READ_LINES_CHARS,
  MAX_READ_CHUNK_CHARS,
} from "../config.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
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

export function registerFsReadTools(server) {
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
}
