import { z } from "zod";
import { registerSafeTool } from "./responses.js";
import { loadIndex, buildIndex } from "./indexer.js";

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

function norm(text) {
  return String(text || "").toLowerCase();
}

function tokens(text) {
  return norm(text)
    .replace(/[^\p{L}\p{N}_-]+/gu, " ")
    .split(/\s+/)
    .filter((x) => x.length >= 2);
}

function scoreDoc(doc, query) {
  const q = norm(query).trim();
  const qs = tokens(query);
  const p = norm(doc.path);
  const s = norm(doc.sample);
  let score = 0;

  if (!q && qs.length === 0) return 0;

  if (q && p.includes(q)) score += 30;
  if (q && s.includes(q)) score += 20;

  for (const t of qs) {
    if (p.includes(t)) score += 10;
    if (s.includes(t)) score += 3;
  }

  if (p.startsWith("romionsim/workflow/")) score += 5;
  if (p.startsWith("romionsim/docs/")) score += 4;
  if (p.startsWith("romionsim/validation/")) score += 3;
  if (p.startsWith("romionsim/experiments/")) score += 3;
  if (p.includes("NEXT_SESSION_START.md")) score += 20;
  if (p.includes("ENGINE_TEST_GRID.md")) score += 18;
  if (p.includes("PROJECT_WORKING_MEMORY.md")) score += 12;

  return score;
}

function snippet(doc, query, maxLen = 700) {
  const sample = String(doc.sample || "");
  const lower = norm(sample);
  const qs = tokens(query);
  let pos = -1;

  for (const t of qs) {
    const found = lower.indexOf(t);
    if (found >= 0 && (pos < 0 || found < pos)) pos = found;
  }

  const start = Math.max(0, (pos < 0 ? 0 : pos) - 180);
  return sample.slice(start, start + maxLen).replace(/\s+/g, " ").trim();
}

function rankDocs(index, query, { limit = 10, romionsimOnly = false } = {}) {
  return index.docs
    .filter((d) => !romionsimOnly || String(d.path || "").startsWith("romionsim/"))
    .map((d) => ({
      path: d.path,
      score: scoreDoc(d, query),
      snippet: snippet(d, query),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit);
}

function importantRomionsimDocs(index) {
  const wanted = [
    "romionsim/workflow/NEXT_SESSION_START.md",
    "romionsim/workflow/ENGINE_TEST_GRID.md",
    "romionsim/workflow/PROJECT_WORKING_MEMORY.md",
    "romionsim/docs/README.md",
    "romionsim/docs/INDEX.md",
    "romionsim/docs/ARCHITECTURE.md",
    "romionsim/validation/README.md",
  ];

  const byPath = new Map(index.docs.map((d) => [d.path, d]));
  return wanted
    .filter((p) => byPath.has(p))
    .map((p) => {
      const d = byPath.get(p);
      return {
        path: d.path,
        score: 100,
        snippet: snippet(d, "romionsim", 700),
        role: "pinned_context",
      };
    });
}

export function registerIndexTools(server) {
  registerSafeTool(server, "index_status", {
    title: "Show index status",
    description: "Show current index metadata and statistics.",
    inputSchema: z.object({}),
    annotations: READ_ONLY,
  }, async () => {
    try {
      const i = await loadIndex();
      return {
        status: "ok",
        count: i.docs.length,
        created_at: i.created_at,
        root: i.root || ".",
        version: i.version || 1,
      };
    } catch {
      return { status: "missing" };
    }
  });

  registerSafeTool(server, "build_index", {
    title: "Build index",
    description: "Build index.",
    inputSchema: z.object({}),
    annotations: STATE_CHANGING,
  }, async () => {
    const i = await buildIndex();
    return { status: "built", count: i.docs.length, created_at: i.created_at };
  });

  registerSafeTool(server, "search_index", {
    title: "Search index",
    description: "Search indexed files.",
    inputSchema: z.object({
      query: z.string(),
      limit: z.number().int().min(1).max(50).default(10),
    }),
    annotations: READ_ONLY,
  }, async ({ query, limit }) => {
    const i = await loadIndex();
    const results = rankDocs(i, query, { limit });
    return { query, results };
  });

  registerSafeTool(server, "search_index_context", {
    title: "Search index context",
    description: "Search index and return contextual snippets.",
    inputSchema: z.object({
      query: z.string(),
      limit: z.number().int().min(1).max(20).default(5),
      context_lines: z.number().int().min(0).max(8).default(2),
    }),
    annotations: READ_ONLY,
  }, async ({ query, limit }) => {
    const i = await loadIndex();
    const results = rankDocs(i, query, { limit }).map((r) => ({
      path: r.path,
      score: r.score,
      context: r.snippet,
    }));
    return { query, results };
  });

  registerSafeTool(server, "collect_context", {
    title: "Collect context",
    description: "Collect bounded context from indexed files.",
    inputSchema: z.object({
      query: z.string(),
      limit: z.number().int().min(1).max(20).default(8),
      max_chars_per_file: z.number().int().min(500).max(30000).default(8000),
    }),
    annotations: READ_ONLY,
  }, async ({ query, limit, max_chars_per_file }) => {
    const i = await loadIndex();
    const ranked = rankDocs(i, query, { limit });
    const byPath = new Map(i.docs.map((d) => [d.path, d]));
    const files = ranked.map((r) => {
      const d = byPath.get(r.path);
      return {
        path: r.path,
        score: r.score,
        text: String(d?.sample || "").slice(0, max_chars_per_file),
      };
    });
    return { query, files };
  });

  registerSafeTool(server, "collect_romionsim_context", {
    title: "Collect romionsim context",
    description: "Collect romionsim-specific context. Retrieval helper only; does not analyze or write files.",
    inputSchema: z.object({
      query: z.string(),
      limit: z.number().int().min(1).max(30).default(12),
      include_pinned: z.boolean().default(true),
    }),
    annotations: READ_ONLY,
  }, async ({ query, limit, include_pinned }) => {
    const i = await loadIndex();
    const pinned = include_pinned ? importantRomionsimDocs(i) : [];
    const ranked = rankDocs(i, query, { limit, romionsimOnly: true });

    const seen = new Set();
    const files = [];

    for (const item of [...pinned, ...ranked]) {
      if (seen.has(item.path)) continue;
      seen.add(item.path);
      files.push(item);
    }

    return {
      query,
      scope: "romionsim/",
      mode: "retrieval_helper_only",
      count: files.length,
      files,
    };
  });
}
