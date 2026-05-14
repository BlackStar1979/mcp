import express from "express";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import {
  ALLOWED_INDEX_EXTENSIONS,
  listWorkspaceRoots,
  workspaceAccessHint,
  LOG_FILE,
  PERF_LOG_FILE,
} from "./core/config.js";
import { buildRuntimeStatus } from "./core/observability/runtime_status_provider.js";
import { safePath, toRel } from "./core/paths.js";

const PORT = 3000;
const ROOTS = listWorkspaceRoots();
const PRIMARY_ROOT = ROOTS.find((item) => item.primary);

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".mcp_backups",
  ".mcp_index",
  ".mcp_trash",
]);

function fileUrl(fullPath) {
  return pathToFileURL(fullPath).href;
}

async function* walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      yield* walkFiles(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

async function* walkAllRoots() {
  for (const root of ROOTS) {
    yield* walkFiles(root.path);
  }
}

async function fileInfo(fullPath) {
  const stat = await fs.stat(fullPath);
  const rel = toRel(fullPath);

  return {
    id: rel,
    path: rel,
    name: path.basename(fullPath),
    type: stat.isDirectory() ? "directory" : "file",
    size: stat.size,
    created: stat.birthtime.toISOString(),
    modified: stat.mtime.toISOString(),
    url: fileUrl(fullPath),
  };
}

function createServer() {
  const rootsHint = workspaceAccessHint();
  const server = new McpServer(
    {
      name: "local-mcp-readonly-files",
      version: "1.1.3",
    },
    {
      instructions:
        `Read-only MCP server for configured workspace roots. ${rootsHint} Use search/fetch for knowledge retrieval and list_directory/read_file/get_info for direct file inspection.`,
    }
  );

  server.registerTool(
    "search",
    {
      title: "Search local MCP files",
      description: `Search file names and text contents across configured workspace roots. ${rootsHint}`,
      inputSchema: z.object({
        query: z.string(),
      }),
      annotations: READ_ONLY,
    },
    async ({ query }) => {
      const q = String(query || "").trim().toLowerCase();
      const results = [];

      if (!q) {
        const output = { results: [] };
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
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

        if (results.length >= 20) break;
      }

      const output = { results };

      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch local MCP file",
      description: `Fetch full UTF-8 text content of a file by ID returned from search. ${rootsHint}`,
      inputSchema: z.object({
        id: z.string(),
      }),
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

      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    "list_directory",
    {
      title: "List directory",
      description: `List files and folders inside configured workspace roots. Bare paths resolve under ${PRIMARY_ROOT.path}; use @alias/... for secondary roots.`,
      inputSchema: z.object({
        path: z.string().default("."),
      }),
      annotations: READ_ONLY,
    },
    async ({ path: requestedPath }) => {
      const dirPath = safePath(requestedPath);
      const stat = await fs.stat(dirPath);

      if (!stat.isDirectory()) throw new Error("Not a directory.");

      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const result = [];

      for (const entry of entries) {
        result.push(await fileInfo(path.join(dirPath, entry.name)));
      }

      const output = {
        directory: toRel(dirPath),
        count: result.length,
        entries: result,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    "read_file",
    {
      title: "Read file",
      description: `Read full UTF-8 text content of a file inside configured workspace roots. ${rootsHint}`,
      inputSchema: z.object({
        path: z.string(),
      }),
      annotations: READ_ONLY,
    },
    async ({ path: requestedPath }) => {
      const filePath = safePath(requestedPath);
      const stat = await fs.stat(filePath);

      if (!stat.isFile()) throw new Error("Not a file.");

      const rel = toRel(filePath);
      const text = await fs.readFile(filePath, "utf8");

      const output = {
        id: rel,
        path: rel,
        text,
        size: stat.size,
        modified: stat.mtime.toISOString(),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    "get_info",
    {
      title: "Get file or directory info",
      description: `Get metadata for a file or folder inside configured workspace roots. ${rootsHint}`,
      inputSchema: z.object({
        path: z.string(),
      }),
      annotations: READ_ONLY,
    },
    async ({ path: requestedPath }) => {
      const targetPath = safePath(requestedPath);
      const output = await fileInfo(targetPath);

      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  return server;
}

const app = express();
app.use(express.json({ limit: "50mb" }));

app.get("/", (req, res) => {
  res.send("Read-only MCP server is running. Use /mcp.");
});

async function runtimeStatusPayload() {
  return buildRuntimeStatus({
    runtime: {
      name: "local-mcp-readonly-files",
      version: "1.1.3",
      profile: "readonly",
      auth_mode: "none",
    },
    network: {
      host: "127.0.0.1",
      port: PORT,
      public_endpoint_hint: "",
    },
    modules: {
      enabled_ids: ["index", "filesystem"],
      disabled_ids: [],
      degraded_ids: [],
    },
    paths: {
      audit_log_file: LOG_FILE,
      perf_log_file: PERF_LOG_FILE,
    },
  });
}

app.get("/healthz", async (req, res) => {
  const status = await runtimeStatusPayload();
  res.status(status.health.level === "degraded" ? 503 : 200).json(status);
});

app.get("/statusz", async (req, res) => {
  const status = await runtimeStatusPayload();
  res.status(200).json(status);
});

app.all("/mcp", async (req, res) => {
  const server = createServer();

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", async () => {
    try {
      await transport.close();
    } catch {}
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Read-only MCP server running at http://127.0.0.1:${PORT}/mcp`);
  console.log(`Primary workspace root: ${PRIMARY_ROOT.path}`);
  console.log(`Configured workspace roots: ${ROOTS.map((item) => `${item.primary ? '*' : ''}${item.alias}=${item.path}`).join(', ')}`);
});
