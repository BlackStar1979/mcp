import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CONNECTOR_SHAPE_VERSION = "2025-05-strict-v1";
export const STC_SAFE_SERVER_NAME = "mcp-stc-safe";
export const STC_SAFE_SERVER_VERSION = "0.1.0";
export const STC_SAFE_HOST = process.env.MCP_SAFE_HOST || "127.0.0.1";
export const STC_SAFE_PORT = Number(process.env.MCP_SAFE_PORT || 3010);
export const STC_SAFE_PUBLIC_BASE_URL = String(
  process.env.MCP_SAFE_PUBLIC_BASE_URL || "https://mcp-stc-safe.romionologic.dev"
).replace(/\/+$/, "");

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..");

function toPosix(value) {
  return String(value || "").replaceAll("\\", "/");
}

function compareTitle(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

function normalizePublicBaseUrl(value) {
  const text = String(value || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//.test(text)) {
    throw new Error(`Connector-safe public base URL must be HTTPS: ${value}`);
  }
  return text;
}

function docUrl(publicBaseUrl, id) {
  return `${publicBaseUrl}/docs/${encodeURIComponent(id)}`;
}

function readUtf8IfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function inferTitle(relativePath, text) {
  const lines = String(text || "").split(/\r?\n/);
  const heading = lines.find((line) => /^#\s+/.test(line.trim()));
  if (heading) {
    return heading.trim().replace(/^#\s+/, "");
  }

  const base = path.basename(relativePath, path.extname(relativePath));
  return base.replace(/[-_]+/g, " ").trim() || relativePath;
}

function normalizeDocId(relativePath) {
  const noExt = toPosix(relativePath).replace(/\.[^.]+$/, "");
  return noExt
    .toLowerCase()
    .replace(/^docs\//, "docs/")
    .replace(/^readme$/, "readme")
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\/-+/g, "/")
    .replace(/^-+|-+$/g, "");
}

export function loadDefaultConnectorDocs({ repoRoot = REPO_ROOT } = {}) {
  const docs = [];

  const addDoc = (relativePath) => {
    const absolutePath = path.join(repoRoot, relativePath);
    const text = readUtf8IfExists(absolutePath);
    if (!text) return;

    docs.push({
      id: normalizeDocId(relativePath),
      title: inferTitle(relativePath, text),
      text,
      metadata: {
        source: "mcp",
        kind: "repo-doc",
        path: toPosix(relativePath),
      },
    });
  };

  addDoc("README.md");

  const docsDir = path.join(repoRoot, "docs");
  if (fs.existsSync(docsDir)) {
    for (const entry of fs.readdirSync(docsDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (path.extname(entry.name).toLowerCase() !== ".md") continue;
      addDoc(path.join("docs", entry.name));
    }
  }

  return docs;
}

export function readRequestBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

export function rpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id: id ?? null, error };
}

export function jsonResponse(res, statusCode, body) {
  const text = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
  });
  res.end(text);
}

export function textResponse(res, statusCode, text) {
  const body = String(text || "");
  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

export function emptyResponse(res, statusCode = 204) {
  res.writeHead(statusCode, { "cache-control": "no-store" });
  res.end();
}

export function toolTextResult(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload),
      },
    ],
  };
}

export function createConnectorSafeRuntime({
  docs = loadDefaultConnectorDocs(),
  publicBaseUrl = STC_SAFE_PUBLIC_BASE_URL,
} = {}) {
  const normalizedPublicBaseUrl = normalizePublicBaseUrl(publicBaseUrl);
  const docMap = new Map();

  for (const doc of docs) {
    if (!doc?.id || !doc?.title) continue;
    docMap.set(String(doc.id), {
      id: String(doc.id),
      title: String(doc.title),
      text: String(doc.text || ""),
      metadata: typeof doc.metadata === "object" && doc.metadata
        ? { ...doc.metadata }
        : { source: "mcp", kind: "repo-doc" },
    });
  }

  function searchDocs(query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return [];

    const terms = q.split(/\s+/).filter(Boolean);
    const scored = [];

    for (const doc of docMap.values()) {
      const haystack = `${doc.id}\n${doc.title}\n${doc.text}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (haystack.includes(term)) score += 1;
      }
      if (score > 0) scored.push({ doc, score });
    }

    scored.sort((a, b) => b.score - a.score || compareTitle(a.doc.title, b.doc.title));
    return scored.slice(0, 10).map(({ doc }) => ({
      id: doc.id,
      title: doc.title,
      url: docUrl(normalizedPublicBaseUrl, doc.id),
    }));
  }

  function fetchDoc(id) {
    const doc = docMap.get(String(id || "").trim());
    if (!doc) return null;

    return {
      id: doc.id,
      title: doc.title,
      text: doc.text,
      url: docUrl(normalizedPublicBaseUrl, doc.id),
      metadata: { ...doc.metadata },
    };
  }

  function toolsList() {
    const readOnlyAnnotations = {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    };

    return [
      {
        name: "search",
        title: "Connector-safe document search",
        description: `Strict connector-safe search (${CONNECTOR_SHAPE_VERSION}). Returns JSON in content[0].text with top-level results[].`,
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
          additionalProperties: false,
        },
        annotations: readOnlyAnnotations,
      },
      {
        name: "fetch",
        title: "Connector-safe document fetch",
        description: `Strict connector-safe fetch (${CONNECTOR_SHAPE_VERSION}). Returns JSON in content[0].text with id/title/text/url/metadata.`,
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        },
        annotations: readOnlyAnnotations,
      },
    ];
  }

  async function handleRpcMessage(message) {
    const id = Object.prototype.hasOwnProperty.call(message, "id") ? message.id : undefined;
    const method = message.method;
    const params = message.params || {};

    if (id === undefined && method !== "notifications/initialized") {
      return undefined;
    }

    switch (method) {
      case "initialize":
        return rpcResult(id, {
          protocolVersion: params.protocolVersion || "2025-03-26",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: STC_SAFE_SERVER_NAME, version: STC_SAFE_SERVER_VERSION },
          instructions: `Strict connector-safe MCP profile (${CONNECTOR_SHAPE_VERSION}). Only search and fetch are exposed.`,
        });

      case "notifications/initialized":
        return undefined;

      case "ping":
        return rpcResult(id, {});

      case "tools/list":
        return rpcResult(id, { tools: toolsList() });

      case "tools/call": {
        const name = params.name;
        const args = params.arguments || {};

        if (name === "search") {
          return rpcResult(id, toolTextResult({ results: searchDocs(args.query) }));
        }

        if (name === "fetch") {
          const doc = fetchDoc(args.id);
          if (!doc) {
            return rpcResult(id, {
              content: [{ type: "text", text: JSON.stringify({ error: "Document not found." }) }],
              isError: true,
            });
          }
          return rpcResult(id, toolTextResult(doc));
        }

        return rpcError(id, -32602, `Unknown tool: ${name}`);
      }

      default:
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  }

  async function handleMcp(req, res) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, mcp-session-id",
        "access-control-max-age": "3600",
      });
      res.end();
      return;
    }

    if (req.method !== "POST") {
      jsonResponse(res, 405, rpcError(null, -32000, "Method not allowed. Use POST /mcp."));
      return;
    }

    let payload;
    try {
      const raw = await readRequestBody(req);
      payload = JSON.parse(raw || "null");
    } catch (error) {
      jsonResponse(res, 400, rpcError(null, -32700, error.message || "Parse error"));
      return;
    }

    try {
      if (Array.isArray(payload)) {
        const responses = [];
        for (const item of payload) {
          const response = await handleRpcMessage(item || {});
          if (response !== undefined) responses.push(response);
        }
        if (responses.length === 0) return emptyResponse(res, 204);
        jsonResponse(res, 200, responses);
        return;
      }

      const response = await handleRpcMessage(payload || {});
      if (response === undefined) return emptyResponse(res, 204);
      jsonResponse(res, 200, response);
    } catch (error) {
      jsonResponse(res, 500, rpcError(payload?.id, -32603, error.message || "Internal server error"));
    }
  }

  function healthPayload() {
    return {
      status: "ok",
      server: STC_SAFE_SERVER_NAME,
      version: STC_SAFE_SERVER_VERSION,
      connectorShapeVersion: CONNECTOR_SHAPE_VERSION,
      mcp: "/mcp",
      public_base_url: normalizedPublicBaseUrl,
      tool_names: toolsList().map((tool) => tool.name),
    };
  }

  function createServer({ host = STC_SAFE_HOST, port = STC_SAFE_PORT } = {}) {
    return http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);
      res.setHeader("access-control-allow-origin", "*");

      if (url.pathname === "/" || url.pathname === "/healthz") {
        jsonResponse(res, 200, healthPayload());
        return;
      }

      if (url.pathname.startsWith("/docs/")) {
        const id = decodeURIComponent(url.pathname.slice("/docs/".length));
        const doc = fetchDoc(id);
        if (!doc) {
          textResponse(res, 404, "Not found");
          return;
        }
        textResponse(res, 200, `${doc.title}\n\n${doc.text}`);
        return;
      }

      if (url.pathname === "/mcp") {
        await handleMcp(req, res);
        return;
      }

      jsonResponse(res, 404, { error: "Not found" });
    });
  }

  return {
    publicBaseUrl: normalizedPublicBaseUrl,
    docs: [...docMap.values()],
    toolsList,
    searchDocs,
    fetchDoc,
    handleRpcMessage,
    handleMcp,
    createServer,
    healthPayload,
  };
}

export function assertConnectorShape(runtime = createConnectorSafeRuntime()) {
  const searchResult = toolTextResult({ results: runtime.searchDocs("current state") });
  const parsedSearch = JSON.parse(searchResult.content[0].text);

  if (!Array.isArray(parsedSearch.results)) {
    throw new Error("search must return a top-level results array");
  }

  for (const item of parsedSearch.results) {
    const keys = Object.keys(item).sort();
    if (JSON.stringify(keys) !== JSON.stringify(["id", "title", "url"])) {
      throw new Error(`search result keys mismatch: ${keys.join(",")}`);
    }
    if (!/^https:\/\//.test(item.url)) {
      throw new Error(`search URL must be HTTPS: ${item.url}`);
    }
    if (/^(file|http):\/\//.test(item.url) || item.url.includes("127.0.0.1") || item.url.includes("localhost")) {
      throw new Error(`search URL must be public HTTPS only: ${item.url}`);
    }
  }

  const firstDoc = runtime.docs[0];
  if (!firstDoc) {
    throw new Error("connector-safe runtime has no documents");
  }

  const fetchResult = toolTextResult(runtime.fetchDoc(firstDoc.id));
  const parsedFetch = JSON.parse(fetchResult.content[0].text);

  for (const key of ["id", "title", "text", "url", "metadata"]) {
    if (!(key in parsedFetch)) {
      throw new Error(`fetch missing key: ${key}`);
    }
  }

  if (!/^https:\/\//.test(parsedFetch.url)) {
    throw new Error(`fetch URL must be HTTPS: ${parsedFetch.url}`);
  }

  const toolNames = runtime.toolsList().map((tool) => tool.name).sort();
  if (JSON.stringify(toolNames) !== JSON.stringify(["fetch", "search"])) {
    throw new Error(`connector-safe runtime must expose only fetch/search: ${toolNames.join(",")}`);
  }

  if (runtime.healthPayload().connectorShapeVersion !== CONNECTOR_SHAPE_VERSION) {
    throw new Error("health payload does not expose connector shape version");
  }
}
