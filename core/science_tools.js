import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

import { registerSafeTool, textOk } from "./responses.js";
import { safePath, toRel } from "./paths.js";
import { audit } from "./audit.js";
import { withHeavySlot } from "./heavy_gate.js";
import { logPerf } from "./perf.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const INVENTORY_DEFAULT_MAX_FILES = 20000;

const INVENTORY_GROUP_ENTRY = z.object({
  count: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  human_bytes: z.string(),
}).strict();

const INVENTORY_TREE_OUTPUT = z.object({
  path: z.string(),
  files: z.number().int().nonnegative(),
  directories: z.number().int().nonnegative(),
  total_bytes: z.number().int().nonnegative(),
  human_total_bytes: z.string(),
  truncated: z.boolean(),
  max_files: z.number().int().positive(),
  by_extension: z.record(z.string(), INVENTORY_GROUP_ENTRY),
  by_kind: z.record(z.string(), INVENTORY_GROUP_ENTRY),
  by_directory: z.record(z.string(), INVENTORY_GROUP_ENTRY),
  largest: z.array(z.object({
    path: z.string(),
    bytes: z.number().int().nonnegative(),
    human_bytes: z.string(),
    extension: z.string(),
    kind: z.string(),
    modified: z.string(),
  }).strict()),
}).strict();

const SCIENCE_TEXT_OUTPUT = z.object({
  text: z.string(),
}).passthrough();

function humanBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(bytes || 0);
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

function extensionKey(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".fits.gz")) return ".fits.gz";
  if (lower.endsWith(".fit.gz")) return ".fit.gz";
  if (lower.endsWith(".pdf.gz")) return ".pdf.gz";
  if (lower.endsWith(".tar.gz")) return ".tar.gz";
  if (lower.endsWith(".hdf5")) return ".hdf5";
  return path.extname(lower) || "[none]";
}

function kindForExtension(ext) {
  if ([".fit", ".fits", ".fit.gz", ".fits.gz"].includes(ext)) return "fits";
  if ([".h5", ".hdf5"].includes(ext)) return "hdf5";
  if ([".txt", ".csv", ".tsv", ".rdb", ".dat"].includes(ext)) return "table_or_text";
  if ([".gz", ".pdf.gz", ".tar.gz"].includes(ext)) return "compressed";
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) return "image";
  if (ext === ".pdf") return "pdf";
  return "other";
}

function addGroup(groups, key, bytes) {
  if (!groups[key]) groups[key] = { count: 0, bytes: 0, human_bytes: "0 B" };
  groups[key].count += 1;
  groups[key].bytes += bytes;
}

function finalizeGroups(groups) {
  for (const value of Object.values(groups)) {
    value.human_bytes = humanBytes(value.bytes);
  }
  return Object.fromEntries(
    Object.entries(groups).sort((a, b) => b[1].bytes - a[1].bytes || a[0].localeCompare(b[0]))
  );
}

function scriptPath(scriptName) {
  return path.join(MODULE_DIR, scriptName);
}

async function runPython(script, payload, timeoutMs = 120000) {
  return withHeavySlot(script, { rel_path: payload.rel_path, timeout_ms: timeoutMs }, () => new Promise((resolve, reject) => {
    const proc = spawn("python", [scriptPath(script)], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let out = "";
    let err = "";
    let closed = false;
    const started = Date.now();

    const timer = setTimeout(() => {
      if (closed) return;
      closed = true;
      try { proc.kill(); } catch {}
      reject(new Error(`Timeout after ${timeoutMs} ms while running ${script}`));
    }, timeoutMs);

    proc.stdout.on("data", d => out += d.toString());
    proc.stderr.on("data", d => err += d.toString());

    proc.on("error", e => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      reject(e);
    });

    proc.on("close", code => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      logPerf({ type: "python_done", script, code, ms: Date.now() - started, stdout_chars: out.length, stderr_chars: err.length });

      if (code !== 0) {
        reject(new Error(err || `Python exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(new Error(`Invalid JSON from ${script}: ${e.message}`));
      }
    });

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  }));
}

export function registerScienceTools(server) {
  registerSafeTool(server, "inventory_tree", {
    title: "Inventory tree",
    description: "Scan directory recursively and aggregate file types, scientific-data kinds, sizes and largest files.",
    inputSchema: z.object({
      path: z.string(),
      max_depth: z.number().int().min(0).max(30).default(20),
      top_n_largest: z.number().int().min(1).max(200).default(50),
      group_depth: z.number().int().min(1).max(10).default(4),
      max_files: z.number().int().min(1).max(100000).default(INVENTORY_DEFAULT_MAX_FILES),
    }),
    outputSchema: INVENTORY_TREE_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ path: requestedPath, max_depth, top_n_largest, group_depth, max_files }) => {
    const root = safePath(requestedPath);
    const rootStat = await fs.stat(root);
    if (!rootStat.isDirectory()) throw new Error("Not a directory.");

    const state = {
      path: toRel(root),
      files: 0,
      directories: 0,
      total_bytes: 0,
      human_total_bytes: "0 B",
      truncated: false,
      max_files,
      by_extension: {},
      by_kind: {},
      by_directory: {},
      largest: [],
    };

    async function walk(dir, depth) {
      if (depth > max_depth || state.files >= max_files) return;
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const e of entries) {
        if (state.files >= max_files) {
          state.truncated = true;
          return;
        }

        const full = path.join(dir, e.name);
        const rel = toRel(full);

        if (e.isDirectory()) {
          state.directories += 1;
          await walk(full, depth + 1);
          continue;
        }

        if (!e.isFile()) continue;

        const stat = await fs.stat(full);
        const ext = extensionKey(e.name);
        const kind = kindForExtension(ext);
        const dirKey = rel.split("/").slice(0, group_depth).join("/");

        state.files += 1;
        state.total_bytes += stat.size;
        addGroup(state.by_extension, ext, stat.size);
        addGroup(state.by_kind, kind, stat.size);
        addGroup(state.by_directory, dirKey, stat.size);

        state.largest.push({
          path: rel,
          bytes: stat.size,
          human_bytes: humanBytes(stat.size),
          extension: ext,
          kind,
          modified: stat.mtime.toISOString(),
        });
        state.largest.sort((a, b) => b.bytes - a.bytes);
        if (state.largest.length > top_n_largest) state.largest.length = top_n_largest;
      }
    }

    await walk(root, 0);

    state.human_total_bytes = humanBytes(state.total_bytes);
    state.by_extension = finalizeGroups(state.by_extension);
    state.by_kind = finalizeGroups(state.by_kind);
    state.by_directory = finalizeGroups(state.by_directory);

    await audit("inventory_tree", {
      path: state.path,
      files: state.files,
      directories: state.directories,
      total_bytes: state.total_bytes,
      truncated: state.truncated,
    });

    return state;
  });

  registerSafeTool(server, "fits_info", {
    title: "FITS info",
    description: "Inspect FITS file structure.",
    inputSchema: z.object({
      path: z.string(),
      max_header_cards: z.number().int().min(0).max(300).default(80),
      max_columns: z.number().int().min(0).max(500).default(120),
    }),
    outputSchema: SCIENCE_TEXT_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ path: requestedPath, max_header_cards, max_columns }) => {
    const full = safePath(requestedPath);
    const data = await runPython("fits_info.py", {
      path: full,
      rel_path: toRel(full),
      max_header_cards,
      max_columns,
    });
    await audit("fits_info", {
      path: toRel(full),
      max_header_cards,
      max_columns,
      status: data?.status || "ok",
    });
    return textOk(JSON.stringify(data, null, 2), data);
  });

  registerSafeTool(server, "hdf5_info", {
    title: "HDF5 info",
    description: "Inspect HDF5 file structure.",
    inputSchema: z.object({
      path: z.string(),
      max_items: z.number().int().min(1).max(5000).default(500),
      include_attrs: z.boolean().default(true),
      max_attrs: z.number().int().min(0).max(100).default(20),
    }),
    outputSchema: SCIENCE_TEXT_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ path: requestedPath, max_items, include_attrs, max_attrs }) => {
    const full = safePath(requestedPath);
    const data = await runPython("hdf5_info.py", {
      path: full,
      rel_path: toRel(full),
      max_items,
      include_attrs,
      max_attrs,
    });
    await audit("hdf5_info", {
      path: toRel(full),
      max_items,
      include_attrs,
      max_attrs,
      status: data?.status || "ok",
    });
    return textOk(JSON.stringify(data, null, 2), data);
  });

  registerSafeTool(server, "table_profile", {
    title: "Table profile",
    description: "Profile text tables.",
    inputSchema: z.object({
      path: z.string(),
      max_lines: z.number().int().min(10).max(200000).default(10000),
      sample_rows: z.number().int().min(1).max(100).default(20),
    }),
    outputSchema: SCIENCE_TEXT_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ path: requestedPath, max_lines, sample_rows }) => {
    const full = safePath(requestedPath);
    const data = await runPython("table_profile.py", {
      path: full,
      rel_path: toRel(full),
      max_lines,
      sample_rows,
    });
    await audit("table_profile", {
      path: toRel(full),
      max_lines,
      sample_rows,
      status: data?.status || "ok",
    });
    return textOk(JSON.stringify(data, null, 2), data);
  });
}
