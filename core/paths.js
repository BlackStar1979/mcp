import path from "path";
import {
  BASE_DIR,
  BLOCKED_PATH_PREFIXES,
  BLOCKED_TOP_LEVEL_DIRS,
  PRIMARY_WORK_ROOT_ALIAS,
  PROTECTED_PATHS,
  READ_BLOCKED_PATH_PREFIXES,
  WORK_ROOTS,
} from "./config.js";

function canonicalize(fullPath) {
  return path.resolve(fullPath).toLowerCase();
}

function startsInside(candidate, root) {
  const left = canonicalize(candidate);
  const right = canonicalize(root);
  return left === right || left.startsWith(right + path.sep.toLowerCase());
}

function formatDisplayPath(rootAlias, rootRelativePath, primaryAlias) {
  const rel = rootRelativePath && rootRelativePath !== "." ? rootRelativePath : "";
  if (rootAlias === primaryAlias) return rel || ".";
  return rel ? `@${rootAlias}/${rel}` : `@${rootAlias}`;
}

export function normalizeRel(relativePath = ".") {
  const clean = String(relativePath || ".")
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");
  return clean || ".";
}

export function listWorkspaceRoots(roots = WORK_ROOTS, primaryAlias = PRIMARY_WORK_ROOT_ALIAS) {
  return [...roots.entries()].map(([alias, root]) => ({
    alias,
    path: root,
    primary: alias === primaryAlias,
  }));
}

export function resolveWorkspacePath(relativePath = ".", { roots = WORK_ROOTS, primaryAlias = PRIMARY_WORK_ROOT_ALIAS } = {}) {
  const clean = normalizeRel(relativePath);
  if (clean === ".") {
    return {
      requested: clean,
      rootAlias: primaryAlias,
      rootPath: roots.get(primaryAlias),
      rootRelativePath: ".",
      displayPath: ".",
      usedAlias: false,
    };
  }

  const aliasMatch = clean.match(/^@([a-z0-9_-]+)(?:\/(.*))?$/i);
  if (aliasMatch) {
    const rootAlias = aliasMatch[1].toLowerCase();
    if (!roots.has(rootAlias)) {
      throw new Error(`Unknown workspace root alias: @${rootAlias}`);
    }
    const rootRelativePath = aliasMatch[2] ? normalizeRel(aliasMatch[2]) : ".";
    return {
      requested: clean,
      rootAlias,
      rootPath: roots.get(rootAlias),
      rootRelativePath,
      displayPath: formatDisplayPath(rootAlias, rootRelativePath, primaryAlias),
      usedAlias: true,
    };
  }

  return {
    requested: clean,
    rootAlias: primaryAlias,
    rootPath: roots.get(primaryAlias),
    rootRelativePath: clean,
    displayPath: clean,
    usedAlias: false,
  };
}

function blockedPrefixEntries(prefixes) {
  return [...prefixes].map((prefix) => ({ prefix, full: path.resolve(BASE_DIR, prefix) }));
}

function findBlockedPrefix(fullPath, prefixes) {
  const resolved = path.resolve(fullPath);
  for (const entry of blockedPrefixEntries(prefixes)) {
    if (startsInside(resolved, entry.full)) return entry.prefix;
  }
  return null;
}

export function safePath(relativePath = ".", options = {}) {
  const resolvedTarget = resolveWorkspacePath(relativePath, options);
  const full = path.resolve(resolvedTarget.rootPath, resolvedTarget.rootRelativePath);

  if (!startsInside(full, resolvedTarget.rootPath)) {
    throw new Error("Access denied");
  }

  const readBlockedPrefix = findBlockedPrefix(full, READ_BLOCKED_PATH_PREFIXES);
  if (readBlockedPrefix) {
    throw new Error(`Blocked path: ${readBlockedPrefix}`);
  }

  return full;
}

export function describeWorkspaceFullPath(fullPath, { roots = WORK_ROOTS, primaryAlias = PRIMARY_WORK_ROOT_ALIAS } = {}) {
  const resolved = path.resolve(fullPath);
  const matches = [...roots.entries()]
    .filter(([, rootPath]) => startsInside(resolved, rootPath))
    .sort((a, b) => b[1].length - a[1].length);

  if (!matches.length) {
    throw new Error("Access denied");
  }

  const [rootAlias, rootPath] = matches[0];
  const rootRelativePath = path.relative(rootPath, resolved).replaceAll("\\", "/") || ".";

  return {
    rootAlias,
    rootPath,
    rootRelativePath,
    displayPath: formatDisplayPath(rootAlias, rootRelativePath, primaryAlias),
    isPrimary: rootAlias === primaryAlias,
  };
}

export function toRel(fullPath, options = {}) {
  return describeWorkspaceFullPath(fullPath, options).displayPath;
}

function protectedEntries() {
  return [...PROTECTED_PATHS].map((rel) => ({ rel, full: path.resolve(BASE_DIR, rel) }));
}

function findProtectedPath(fullPath) {
  const resolved = canonicalize(fullPath);
  for (const entry of protectedEntries()) {
    if (canonicalize(entry.full) === resolved) return entry.rel;
  }
  return null;
}

export function assertWritablePath(relativePath, { allowProtected = false, roots = WORK_ROOTS, primaryAlias = PRIMARY_WORK_ROOT_ALIAS } = {}) {
  const full = safePath(relativePath, { roots, primaryAlias });
  const location = describeWorkspaceFullPath(full, { roots, primaryAlias });
  const top = location.rootRelativePath.split("/")[0];
  const blockedPrefix = findBlockedPrefix(full, BLOCKED_PATH_PREFIXES);
  const protectedRel = findProtectedPath(full);

  if (location.rootRelativePath === ".") throw new Error("Blocked path: root is not writable");
  if (location.rootRelativePath.startsWith("..")) throw new Error("Access denied");
  if (blockedPrefix) throw new Error(`Blocked path: ${blockedPrefix}`);
  if (BLOCKED_TOP_LEVEL_DIRS.has(top)) throw new Error(`Blocked path: ${top}`);
  if (!allowProtected && protectedRel) throw new Error(`Protected file: ${protectedRel}`);

  return location.displayPath;
}
