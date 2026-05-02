import express from "express";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const PORT = 3000;
const BASE_DIR = path.resolve("C:\\Work\\mcp");
const BASE_DIR_LABEL = "C:\\Work\\mcp";
const BASE_FILE_URL = "file:///C:/Work/mcp";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const ALLOWED_EXTENSIONS = new Set([
  ".txt", ".md", ".csv", ".json", ".xml", ".html", ".htm",
  ".js", ".ts", ".py", ".ps1", ".bat", ".cmd",
  ".log", ".ini", ".yml", ".yaml"
]);

const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".mcp_backups",
  ".mcp_index",
  ".mcp_trash"
]);

function safePath(relativePath = ".") {
  const clean = String(relativePath).replaceAll("\\", "/");
  const resolved = path.resolve(BASE_DIR, clean);

  if (resolved !== BASE_DIR && !resolved.startsWith(BASE_DIR + path.sep)) {
    throw new Error(`Access denied: outside ${BASE_DIR_LABEL}.`);
  }

  return resolved;
}

function toRel(fullPath) {
  return path.relative(BASE_DIR, fullPath).replaceAll("\\", "/") || ".";
}

function fileUrl(relativePath) {
  const rel = relativePath.replaceAll("\\", "/");
  return rel === "." ? BASE_FILE_URL : `${BASE_FILE_URL}/${rel}`;
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
    url: fileUrl(rel),
  };
}

function createServer() {
  const server = new McpServer(
    {
      name: "local-mcp-readonly-files",
      version: "1.1.2",
    },
    {
      instructions:
        `Read-only MCP server for files in ${BASE_DIR_LABEL}. Use search/fetch for knowledge retrieval and list_directory/read_file/get_info for direct file inspection.`,
    }
  );

  server.registerTool(
    "search",
    {
      title: "Search local MCP files",
      description: `Search file names and text contents inside ${BASE_DIR_LABEL}.`,
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

      for await (const filePath of walkFiles(BASE_DIR)) {
        const ext = path.extname(filePath).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) continue;

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
            url: fileUrl(rel),
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
      description: `Fetch full UTF-8 text content of a file from ${BASE_DIR_LABEL} by ID returned from search.`,
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
        url: fileUrl(rel),
        metadata: {
          source: "local_filesystem",
          base_dir: BASE_DIR_LABEL,
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
      description: `List files and folders inside ${BASE_DIR_LABEL}.`,
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
      description: `Read full UTF-8 text content of a file inside ${BASE_DIR_LABEL}.`,
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
      description: `Get metadata for a file or folder inside ${BASE_DIR_LABEL}.`,
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
  console.log(`Base directory: ${BASE_DIR}`);
});
