import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { TRASH_DIR, BACKUP_DIR, INDEX_DIR } from "./config.js";
import { toRel } from "./paths.js";

export async function ensureInternalDirs() {
  await fs.mkdir(TRASH_DIR, { recursive: true });
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  await fs.mkdir(INDEX_DIR, { recursive: true });
}

export async function fileInfo(fullPath) {
  const stat = await fs.stat(fullPath);
  return {
    path: toRel(fullPath),
    type: stat.isDirectory() ? "directory" : "file",
    size: stat.size,
    created: stat.birthtime.toISOString(),
    modified: stat.mtime.toISOString(),
  };
}

export async function createBackupIfExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return null;
  } catch {
    return null;
  }

  await ensureInternalDirs();
  const rel = toRel(filePath);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const hash = crypto.createHash("sha256").update(rel).digest("hex").slice(0, 12);
  const backupName = `${stamp}_${hash}_${path.basename(filePath)}.bak`;
  const backupPath = path.join(BACKUP_DIR, backupName);
  await fs.copyFile(filePath, backupPath);
  return toRel(backupPath);
}

export function trashNameFor(relativePath) {
  const rel = String(relativePath || ".").replaceAll("\\", "/").replace(/^\.\//, "");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const hash = crypto.createHash("sha256").update(rel).digest("hex").slice(0, 12);
  return `${stamp}_${hash}_${path.basename(rel)}`;
}

export async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}
