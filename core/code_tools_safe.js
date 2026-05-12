import { z } from "zod";
import fs from "fs/promises";
import path from "path";

import { registerSafeTool } from "./responses.js";
import { safePath, toRel } from "./paths.js";
import { audit } from "./audit.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const MAX_CODE_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SYMBOLS = 1000;
const MAX_DEPENDENCIES = 500;

const CODE_SYMBOL = z.object({
  kind: z.string(),
  name: z.string(),
  line: z.number().int().positive(),
  exported: z.boolean().optional(),
  async: z.boolean().optional(),
  source: z.string().optional(),
}).strict();

const CODE_SYMBOLS_OUTPUT = z.object({
  path: z.string(),
  language: z.string(),
  bytes: z.number().int().nonnegative(),
  total_lines: z.number().int().nonnegative(),
  symbol_count: z.number().int().nonnegative(),
  truncated: z.boolean(),
  symbols: z.array(CODE_SYMBOL),
}).strict();

const CODE_GRAPH_NODE = z.object({
  path: z.string(),
  language: z.string(),
  imports: z.number().int().nonnegative(),
  symbols: z.number().int().nonnegative(),
}).strict();

const CODE_GRAPH_EDGE = z.object({
  from: z.string(),
  to: z.string(),
  source: z.string(),
  line: z.number().int().positive(),
}).strict();

const CODE_GRAPH_UNRESOLVED = z.object({
  from: z.string(),
  source: z.string(),
  line: z.number().int().positive(),
  candidates: z.array(z.string()),
}).strict();

const CODE_DEPENDENCIES_OUTPUT = z.object({
  path: z.string(),
  recursive: z.boolean(),
  max_files: z.number().int().positive(),
  visited_files: z.number().int().nonnegative(),
  scanned_files: z.number().int().nonnegative(),
  truncated: z.boolean(),
  nodes_count: z.number().int().nonnegative(),
  edges_count: z.number().int().nonnegative(),
  unresolved_count: z.number().int().nonnegative(),
  nodes: z.array(CODE_GRAPH_NODE),
  edges: z.array(CODE_GRAPH_EDGE),
  unresolved: z.array(CODE_GRAPH_UNRESOLVED),
}).strict();

const CODE_AUDIT_DEGREE = z.object({
  path: z.string(),
  degree: z.number().int().nonnegative(),
}).strict();

const CODE_AUDIT_OUTPUT = z.object({
  path: z.string(),
  recursive: z.boolean(),
  max_files: z.number().int().positive(),
  summary: z.object({
    nodes: z.number().int().nonnegative(),
    edges: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
    truncated: z.boolean(),
  }).strict(),
  high_fan_in: z.array(CODE_AUDIT_DEGREE),
  high_fan_out: z.array(CODE_AUDIT_DEGREE),
  unresolved: z.array(CODE_GRAPH_UNRESOLVED),
}).strict();

const CODE_IMPACT_ITEM = z.object({
  path: z.string(),
  depth: z.number().int().positive(),
  via: z.string(),
  line: z.number().int().positive(),
}).strict();

const CODE_IMPACT_OUTPUT = z.object({
  scope: z.string(),
  direction: z.enum(["both", "dependents", "dependencies"]),
  max_depth: z.number().int().positive(),
  graph: z.object({
    nodes: z.number().int().nonnegative(),
    edges: z.number().int().nonnegative(),
    truncated: z.boolean(),
  }).strict(),
  target: z.string(),
  found: z.boolean(),
  affected_count: z.number().int().nonnegative(),
  dependencies_count: z.number().int().nonnegative(),
  affected: z.array(CODE_IMPACT_ITEM),
  dependencies: z.array(CODE_IMPACT_ITEM),
}).strict();

function linesOf(text) {
  return String(text || "").split(/\r\n|\n|\r/);
}

function addSymbol(symbols, item) {
  if (symbols.length < MAX_SYMBOLS) symbols.push(item);
}

function extractJsSymbols(text) {
  const symbols = [];
  const lines = linesOf(text);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const n = i + 1;
    let m;

    m = line.match(/^\s*export\s+function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (m) { addSymbol(symbols, { kind: "function", name: m[1], line: n, exported: true }); continue; }

    m = line.match(/^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (m) { addSymbol(symbols, { kind: "function", name: m[1], line: n, exported: false }); continue; }

    m = line.match(/^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
    if (m) { addSymbol(symbols, { kind: "variable", name: m[1], line: n, exported: true }); continue; }

    m = line.match(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(?[^=]*\)?\s*=>/);
    if (m) { addSymbol(symbols, { kind: "function", name: m[1], line: n, exported: false }); continue; }

    m = line.match(/^\s*export\s+class\s+([A-Za-z_$][\w$]*)\b/);
    if (m) { addSymbol(symbols, { kind: "class", name: m[1], line: n, exported: true }); continue; }

    m = line.match(/^\s*class\s+([A-Za-z_$][\w$]*)\b/);
    if (m) { addSymbol(symbols, { kind: "class", name: m[1], line: n, exported: false }); continue; }

    m = line.match(/^\s*import\s+(.+?)\s+from\s+["'](.+?)["']/);
    if (m) { addSymbol(symbols, { kind: "import", name: m[1].trim(), source: m[2], line: n }); continue; }
  }

  return symbols;
}

function extractPySymbols(text) {
  const symbols = [];
  const lines = linesOf(text);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const n = i + 1;
    let m;

    m = line.match(/^\s*async\s+def\s+([A-Za-z_][\w]*)\s*\(/);
    if (m) { addSymbol(symbols, { kind: "function", name: m[1], line: n, async: true }); continue; }

    m = line.match(/^\s*def\s+([A-Za-z_][\w]*)\s*\(/);
    if (m) { addSymbol(symbols, { kind: "function", name: m[1], line: n }); continue; }

    m = line.match(/^\s*class\s+([A-Za-z_][\w]*)\b/);
    if (m) { addSymbol(symbols, { kind: "class", name: m[1], line: n }); continue; }

    m = line.match(/^\s*from\s+([A-Za-z_][\w.]*|\.+[A-Za-z_][\w.]*)\s+import\s+(.+)/);
    if (m) { addSymbol(symbols, { kind: "import", source: m[1], name: m[2].trim(), line: n }); continue; }

    m = line.match(/^\s*import\s+(.+)/);
    if (m) { addSymbol(symbols, { kind: "import", name: m[1].trim(), line: n }); continue; }
  }

  return symbols;
}

function extractSymbols(relPath, text) {
  const ext = path.extname(relPath).toLowerCase();

  if ([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"].includes(ext)) {
    return { language: "javascript", symbols: extractJsSymbols(text) };
  }

  if (ext === ".py") {
    return { language: "python", symbols: extractPySymbols(text) };
  }

  return { language: "unsupported", symbols: [] };
}

function localImportCandidates(fileRel, language, source) {
  const dir = path.posix.dirname(fileRel);
  const out = [];
  const clean = String(source || "").replaceAll("\\", "/");

  if (language === "javascript") {
    if (!clean.startsWith(".")) return out;
    const base = path.posix.normalize(path.posix.join(dir, clean));
    for (const ext of ["", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]) out.push(base + ext);
    for (const ext of [".js", ".ts", ".tsx", ".jsx"]) out.push(path.posix.join(base, "index" + ext));
    return out;
  }

  if (language === "python") {
    if (!clean.startsWith(".")) return out;
    const dots = clean.match(/^\.+/)?.[0]?.length || 0;
    const rest = clean.slice(dots).replaceAll(".", "/");
    let baseDir = dir;
    for (let i = 1; i < dots; i += 1) baseDir = path.posix.dirname(baseDir);
    const base = path.posix.normalize(path.posix.join(baseDir, rest));
    out.push(base + ".py");
    out.push(path.posix.join(base, "__init__.py"));
  }

  return out;
}

function resolveCandidate(candidates, existing) {
  for (const candidate of candidates) {
    if (existing.has(candidate)) return candidate;
  }
  return null;
}

async function walkFiles(rootFull, rootRel, recursive, maxFiles) {
  const files = [];
  let visited = 0;
  let truncated = false;

  async function walk(dir) {
    if (truncated) return;
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (truncated) return;
      const full = path.join(dir, entry.name);
      const rel = toRel(full);

      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name.startsWith(".mcp_")) {
          continue;
        }
        if (recursive) await walk(full);
        continue;
      }

      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (![".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py"].includes(ext)) continue;

      visited += 1;
      if (visited > maxFiles) {
        truncated = true;
        return;
      }

      if (rootRel && !rel.startsWith(rootRel)) continue;
      files.push(rel);
    }
  }

  await walk(rootFull);
  return { files, visited, truncated };
}

async function buildDependencyGraph(requestedPath, recursive, maxFiles) {
  const root = safePath(requestedPath);
  const stat = await fs.stat(root);
  const rootRel = toRel(root);
  const fileList = stat.isFile()
    ? { files: [rootRel], visited: 1, truncated: false }
    : await walkFiles(root, rootRel === "." ? "" : rootRel, recursive, maxFiles);

  const existing = new Set(fileList.files);
  const nodes = [];
  const edges = [];
  const unresolved = [];

  for (const rel of fileList.files) {
    if (nodes.length >= maxFiles) break;
    const full = safePath(rel);
    const st = await fs.stat(full);
    if (st.size > MAX_CODE_FILE_BYTES) continue;

    const text = await fs.readFile(full, "utf8");
    const { language, symbols } = extractSymbols(rel, text);
    const imports = symbols.filter((item) => item.kind === "import").slice(0, MAX_DEPENDENCIES);

    nodes.push({ path: rel, language, imports: imports.length, symbols: symbols.length });

    for (const imp of imports) {
      const source = imp.source || imp.name;
      const candidates = localImportCandidates(rel, language, source);
      const resolved = resolveCandidate(candidates, existing);
      if (resolved) edges.push({ from: rel, to: resolved, source, line: imp.line });
      else if (candidates.length > 0) unresolved.push({ from: rel, source, line: imp.line, candidates: candidates.slice(0, 5) });
    }
  }

  return {
    path: rootRel,
    recursive,
    max_files: maxFiles,
    visited_files: fileList.visited,
    scanned_files: fileList.files.length,
    truncated: fileList.truncated,
    nodes_count: nodes.length,
    edges_count: edges.length,
    unresolved_count: unresolved.length,
    nodes,
    edges: edges.slice(0, MAX_DEPENDENCIES),
    unresolved: unresolved.slice(0, MAX_DEPENDENCIES),
  };
}

function degreeMaps(graph) {
  const inDegree = new Map();
  const outDegree = new Map();

  for (const node of graph.nodes) {
    inDegree.set(node.path, 0);
    outDegree.set(node.path, 0);
  }

  for (const edge of graph.edges) {
    outDegree.set(edge.from, (outDegree.get(edge.from) || 0) + 1);
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  }

  return { inDegree, outDegree };
}

function auditGraph(graph, topN) {
  const { inDegree, outDegree } = degreeMaps(graph);
  const sortDesc = (map) => [...map.entries()]
    .map(([filePath, degree]) => ({ path: filePath, degree }))
    .sort((a, b) => b.degree - a.degree || a.path.localeCompare(b.path))
    .slice(0, topN);

  return {
    summary: {
      nodes: graph.nodes_count,
      edges: graph.edges_count,
      unresolved: graph.unresolved_count,
      truncated: graph.truncated,
    },
    high_fan_in: sortDesc(inDegree),
    high_fan_out: sortDesc(outDegree),
    unresolved: graph.unresolved.slice(0, topN),
  };
}

function impactGraph(graph, target, direction, maxDepth) {
  const forward = new Map();
  const reverse = new Map();
  const nodeSet = new Set(graph.nodes.map((node) => node.path));

  for (const node of graph.nodes) {
    forward.set(node.path, []);
    reverse.set(node.path, []);
  }

  for (const edge of graph.edges) {
    forward.get(edge.from)?.push({ path: edge.to, via: edge.source, line: edge.line });
    reverse.get(edge.to)?.push({ path: edge.from, via: edge.source, line: edge.line });
  }

  const start = target.replaceAll("\\", "/");
  if (!nodeSet.has(start)) {
    return { target: start, found: false, affected_count: 0, dependencies_count: 0, affected: [], dependencies: [] };
  }

  function traverse(map) {
    const seen = new Set([start]);
    const out = [];
    const queue = [{ path: start, depth: 0, via: null, line: null }];

    while (queue.length) {
      const cur = queue.shift();
      if (cur.depth >= maxDepth) continue;
      for (const next of map.get(cur.path) || []) {
        if (seen.has(next.path)) continue;
        seen.add(next.path);
        const item = { path: next.path, depth: cur.depth + 1, via: next.via, line: next.line };
        out.push(item);
        queue.push(item);
      }
    }

    return out;
  }

  const affected = direction === "dependencies" ? [] : traverse(reverse);
  const dependencies = direction === "dependents" ? [] : traverse(forward);

  return { target: start, found: true, affected_count: affected.length, dependencies_count: dependencies.length, affected, dependencies };
}

export function registerCodeTools(server) {
  registerSafeTool(server, "code_symbols", {
    title: "Extract code symbols",
    description: "Extract bounded structural symbols from JS/TS/Python files without executing user code.",
    inputSchema: z.object({ path: z.string() }),
    outputSchema: CODE_SYMBOLS_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ path: requestedPath }) => {
    const full = safePath(requestedPath);
    const stat = await fs.stat(full);
    if (!stat.isFile()) throw new Error("Not a file.");
    if (stat.size > MAX_CODE_FILE_BYTES) throw new Error(`File too large for code_symbols: ${stat.size} bytes.`);
    const rel = toRel(full);
    const text = await fs.readFile(full, "utf8");
    const { language, symbols } = extractSymbols(rel, text);
    await audit("code_symbols", {
      path: rel,
      language,
      bytes: stat.size,
      symbol_count: symbols.length,
    });
    return { path: rel, language, bytes: stat.size, total_lines: linesOf(text).length, symbol_count: symbols.length, truncated: symbols.length >= MAX_SYMBOLS, symbols };
  });

  registerSafeTool(server, "code_dependencies", {
    title: "Build code dependency graph",
    description: "Build bounded import dependency graph for JS/TS/Python files without executing user code.",
    inputSchema: z.object({ path: z.string(), recursive: z.boolean().default(true), max_files: z.number().int().min(1).max(5000).default(500) }),
    outputSchema: CODE_DEPENDENCIES_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ path: requestedPath, recursive, max_files }) => {
    const graph = await buildDependencyGraph(requestedPath, recursive, max_files);
    await audit("code_dependencies", {
      path: graph.path,
      recursive: graph.recursive,
      max_files: graph.max_files,
      nodes: graph.nodes_count,
      edges: graph.edges_count,
      unresolved: graph.unresolved_count,
      truncated: graph.truncated,
    });
    return graph;
  });
  

  registerSafeTool(server, "code_audit", {
    title: "Audit code dependency graph",
    description: "Summarize dependency graph structure: fan-in/fan-out and unresolved local imports.",
    inputSchema: z.object({ path: z.string(), recursive: z.boolean().default(true), max_files: z.number().int().min(1).max(5000).default(500), top_n: z.number().int().min(1).max(100).default(20) }),
    outputSchema: CODE_AUDIT_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ path: requestedPath, recursive, max_files, top_n }) => {
    const graph = await buildDependencyGraph(requestedPath, recursive, max_files);
    await audit("code_audit", {
      path: graph.path,
      recursive: graph.recursive,
      max_files: graph.max_files,
      nodes: graph.nodes_count,
      edges: graph.edges_count,
      unresolved: graph.unresolved_count,
    });
    return { path: graph.path, recursive: graph.recursive, max_files: graph.max_files, ...auditGraph(graph, top_n) };
  });

  registerSafeTool(server, "code_impact", {
    title: "Analyze code dependency impact",
    description: "Trace dependents and dependencies for one file inside a bounded JS/TS/Python import graph.",
    inputSchema: z.object({ path: z.string(), target: z.string(), recursive: z.boolean().default(true), max_files: z.number().int().min(1).max(5000).default(500), max_depth: z.number().int().min(1).max(20).default(5), direction: z.enum(["both", "dependents", "dependencies"]).default("both") }),
    outputSchema: CODE_IMPACT_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ path: requestedPath, target, recursive, max_files, max_depth, direction }) => {
    const graph = await buildDependencyGraph(requestedPath, recursive, max_files);
    const result = { scope: graph.path, direction, max_depth, graph: { nodes: graph.nodes_count, edges: graph.edges_count, truncated: graph.truncated }, ...impactGraph(graph, target, direction, max_depth) };
    await audit("code_impact", {
      scope: graph.path,
      target,
      direction,
      max_depth,
      affected_count: result.affected_count,
      dependencies_count: result.dependencies_count,
    });
    return result;
  });
}
