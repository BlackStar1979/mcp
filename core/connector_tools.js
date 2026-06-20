import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";

import { registerSafeTool, ok, textOk } from "./responses.js";
import { safePath, toRel } from "./paths.js";
import {
  ALLOWED_INDEX_EXTENSIONS,
  SKIPPED_SCAN_DIRS,
  listWorkspaceRoots,
  workspaceAccessHint,
} from "./config.js";

// Connector-shape read-only retrieval (search/fetch) over the configured workspace
// roots. This is the OpenAI/connector contract (id/title/text/url) folded in from the
// retired standalone read-only server.js. read_file/list_directory/get_info are NOT
// here — the filesystem module already provides them.

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const SEARCH_RESULT_ITEM_OUTPUT = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string(),
}).strict();

const SEARCH_OUTPUT = z.object({
  results: z.array(SEARCH_RESULT_ITEM_OUTPUT),
}).strict();

const FETCH_OUTPUT = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string(),
  metadata: z.object({
    source: z.string(),
    workspace_access: z.string(),
    size: z.number().int().nonnegative(),
    modified: z.string(),
  }).strict(),
}).strict();

const MAX_SEARCH_RESULTS = 20;

function fileUrl(fullPath) {
  return pathToFileURL(fullPath).href;
}

async function* walkFiles(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIPPED_SCAN_DIRS.has(entry.name)) continue;
      yield* walkFiles(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

async function* walkAllRoots() {
  for (const root of listWorkspaceRoots()) {
    yield* walkFiles(root.path);
  }
}

export function registerConnectorTools(server) {
  const rootsHint = workspaceAccessHint();

  registerSafeTool(server,
    "search",
    {
      title: "Search local MCP files",
      description: `Search file names and text contents across configured workspace roots. ${rootsHint}`,
      inputSchema: z.object({
        query: z.string(),
      }),
      outputSchema: SEARCH_OUTPUT,
      annotations: READ_ONLY,
    },
    async ({ query }) => {
      const q = String(query || "").trim().toLowerCase();
      const results = [];

      if (!q) {
        return ok({ results: [] });
      }

      for await (const filePath of walkAllRoots()) {
        const ext = path.extname(filePath).toLowerCase();
        if (!ALLOWED_INDEX_EXTENSIONS.has(ext)) continue;

        const rel = toRel(filePath);

        let text;
        try {
          text = await fs.readFile(filePath, "utf8");
        } catch {
          continue;
        }

        const haystack = `${rel}\n${text}`.toLowerCase();

        if (haystack.includes(q)) {
          const idx = Math.max(0, haystack.indexOf(q));
          const snippet = text
            .slice(Math.max(0, idx - 160), Math.min(text.length, idx + 500))
            .replace(/\s+/g, " ")
            .trim();

          results.push({
            id: rel,
            title: rel,
            text: snippet,
            url: fileUrl(filePath),
          });
        }

        if (results.length >= MAX_SEARCH_RESULTS) break;
      }

      return ok({ results });
    }
  );

  registerSafeTool(server,
    "fetch",
    {
      title: "Fetch local MCP file",
      description: `Fetch full UTF-8 text content of a file by ID returned from search. ${rootsHint}`,
      inputSchema: z.object({
        id: z.string(),
      }),
      outputSchema: FETCH_OUTPUT,
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      const filePath = safePath(id);
      const stat = await fs.stat(filePath);

      if (!stat.isFile()) throw new Error("Not a file.");

      const rel = toRel(filePath);
      const text = await fs.readFile(filePath, "utf8");

      const output = {
        id: rel,
        title: rel,
        text,
        url: fileUrl(filePath),
        metadata: {
          source: "local_filesystem",
          workspace_access: rootsHint,
          size: stat.size,
          modified: stat.mtime.toISOString(),
        },
      };

      return textOk(text, output);
    }
  );
}
