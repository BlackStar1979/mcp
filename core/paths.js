import path from "path";
import { BASE_DIR, BLOCKED_TOP_LEVEL_DIRS, PROTECTED_PATHS } from "./config.js";

export function normalizeRel(relativePath = ".") {
  return String(relativePath || ".")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");
}

export function safePath(relativePath = ".") {
  const clean = normalizeRel(relativePath);
  const resolved = path.resolve(BASE_DIR, clean);

  if (resolved !== BASE_DIR && !resolved.startsWith(BASE_DIR + path.sep)) {
    throw new Error("Access denied");
  }

  return resolved;
}

export function toRel(fullPath) {
  return path.relative(BASE_DIR, fullPath).replaceAll("\\", "/") || ".";
}

export function assertWritablePath(relativePath, { allowProtected = false } = {}) {
  const full = safePath(relativePath);
  const rel = toRel(full);
  const top = rel.split("/")[0];

  if (rel === ".") throw new Error("Blocked path: root is not writable");
  if (rel.startsWith("..")) throw new Error("Access denied");
  if (BLOCKED_TOP_LEVEL_DIRS.has(top)) throw new Error(`Blocked path: ${top}`);
  if (!allowProtected && PROTECTED_PATHS.has(rel)) throw new Error(`Protected file: ${rel}`);

  return rel;
}
