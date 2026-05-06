import fs from "fs/promises";
import path from "path";
import {
  INDEX_FILE,
  MAX_INDEX_FILE_BYTES,
  MAX_INDEX_TEXT_CHARS,
  ALLOWED_INDEX_EXTENSIONS,
  BLOCKED_TOP_LEVEL_DIRS,
  SKIPPED_SCAN_DIRS,
  SKIPPED_SCAN_EXTENSIONS,
  listWorkspaceRoots,
} from "./config.js";
import { safePath, toRel } from "./paths.js";

const DEFAULT_MAX_FILES = 20000;
const DEFAULT_MAX_DIRS = 5000;

export function tokenize(text) {
  return String(text || "").toLowerCase().split(/\W+/).filter(x => x.length > 2);
}

export async function loadIndex() {
  return JSON.parse(await fs.readFile(INDEX_FILE, "utf8"));
}

function shouldSkipDir(rel) {
  const normalized = String(rel || ".");
  const local = normalized.startsWith("@")
    ? normalized.replace(/^@[a-z0-9_-]+\/?/i, "") || "."
    : normalized;
  const parts = local.split("/");
  const top = parts[0];
  if (BLOCKED_TOP_LEVEL_DIRS.has(top)) return true;
  for (const p of parts) {
    if (SKIPPED_SCAN_DIRS.has(p)) return true;
  }
  return false;
}

export async function buildIndex(options = {}) {
  const maxFiles = Number.isInteger(options.max_files) ? options.max_files : DEFAULT_MAX_FILES;
  const maxDirs = Number.isInteger(options.max_dirs) ? options.max_dirs : DEFAULT_MAX_DIRS;
  const roots = listWorkspaceRoots();

  const docs = [];
  const skipped = { oversized: 0, extension: 0, directories: 0 };
  let visitedFiles = 0;
  let visitedDirs = 0;
  let truncated = false;

  async function walk(dir) {
    if (truncated) return;
    visitedDirs += 1;
    if (visitedDirs > maxDirs) {
      truncated = true;
      return;
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (truncated) return;
      const full = path.join(dir, e.name);
      const rel = toRel(full);

      if (e.isDirectory()) {
        if (shouldSkipDir(rel)) {
          skipped.directories += 1;
          continue;
        }
        await walk(full);
        continue;
      }

      if (!e.isFile()) continue;
      visitedFiles += 1;
      if (visitedFiles > maxFiles) {
        truncated = true;
        return;
      }

      const ext = path.extname(full).toLowerCase();
      if (SKIPPED_SCAN_EXTENSIONS.has(ext)) {
        skipped.extension += 1;
        continue;
      }
      if (!ALLOWED_INDEX_EXTENSIONS.has(ext)) {
        skipped.extension += 1;
        continue;
      }

      const stat = await fs.stat(full);
      if (stat.size > MAX_INDEX_FILE_BYTES) {
        skipped.oversized += 1;
        continue;
      }

      const text = await fs.readFile(full, "utf8");
      docs.push({
        path: rel,
        sample: text.slice(0, MAX_INDEX_TEXT_CHARS),
        bytes: stat.size,
        modified: stat.mtime.toISOString(),
      });
    }
  }

  await fs.mkdir(path.dirname(INDEX_FILE), { recursive: true });
  for (const root of roots) {
    await walk(safePath(root.primary ? "." : `@${root.alias}`));
    if (truncated) break;
  }

  const idx = {
    version: 3,
    created_at: new Date().toISOString(),
    root: ".",
    roots: roots.map((item) => ({ alias: item.alias, path: item.path, primary: item.primary })),
    docs,
    stats: {
      docs: docs.length,
      visited_files: visitedFiles,
      visited_dirs: visitedDirs,
      skipped,
      truncated,
      max_files: maxFiles,
      max_dirs: maxDirs,
      max_index_file_bytes: MAX_INDEX_FILE_BYTES,
      max_index_text_chars: MAX_INDEX_TEXT_CHARS,
    },
  };

  await fs.writeFile(INDEX_FILE, JSON.stringify(idx, null, 2));
  return idx;
}
