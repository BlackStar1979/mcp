import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { audit } from "./audit.js";
import { timeRequest, timeTool } from "./perf.js";

export const CONNECTOR_SHAPE_VERSION = "2025-05-strict-v1";
export const STC_SAFE_SERVER_NAME = "mcp-stc-safe";
export const STC_SAFE_SERVER_VERSION = "0.1.0";
export const STC_SAFE_AUDIT_VERSION = "stc-safe-audit-v1";
export const STC_SAFE_HOST = process.env.MCP_SAFE_HOST || "127.0.0.1";
export const STC_SAFE_PORT = Number(process.env.MCP_SAFE_PORT || 3010);
export const STC_SAFE_PUBLIC_BASE_URL = String(
  process.env.MCP_SAFE_PUBLIC_BASE_URL || "https://mcp-stc-safe.romionologic.dev"
).replace(/\/+$/, "");
export const STC_SAFE_FETCH_CAP_CHARS = Number(process.env.MCP_SAFE_FETCH_CAP_CHARS || 2500);
export const STC_SAFE_ENABLE_DIAGNOSTIC_DOCS = /^(1|true|yes)$/i.test(
  String(process.env.MCP_SAFE_ENABLE_DIAGNOSTIC_DOCS || "")
);

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..");
let REQUEST_COUNTER = 0;

const SEARCH_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "url"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          url: { type: "string" },
        },
      },
    },
  },
};

const FETCH_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "title", "text", "url", "metadata"],
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    text: { type: "string" },
    url: { type: "string" },
    metadata: {
      type: "object",
      additionalProperties: true,
      required: [
        "source",
        "kind",
        "connectorShapeVersion",
        "truncated",
        "original_chars",
        "cap_chars",
      ],
      properties: {
        source: { type: "string" },
        kind: { type: "string" },
        connectorShapeVersion: { type: "string" },
        truncated: { type: "boolean" },
        original_chars: { type: "integer", minimum: 0 },
        cap_chars: { type: "integer", minimum: 0 },
      },
    },
  },
};

const DIAGNOSTIC_DOCS = [
  {
    id: "stc-safe-health",
    title: "STC-SAFE Health",
    text:
      "This is a small neutral canary document for validating MCP connector fetch behavior. " +
      "It contains no executable instructions, no code, no local paths, and no operational tool names.",
    metadata: {
      source: "stc-safe",
      kind: "canary",
    },
  },
  {
    id: "risk-canary-neutral",
    title: "Risk Canary Neutral",
    text:
      "This is a neutral risk canary document for validating connector behavior with ordinary text only.",
    metadata: {
      source: "stc-safe",
      kind: "risk-canary-neutral",
    },
  },
  {
    id: "risk-canary-cyber-markers",
    title: "Risk Canary Cyber Markers",
    text:
      "This is a fake redacted marker document for connector safety testing. " +
      "It contains only inert placeholders: MCP, TOKEN_PLACEHOLDER, Bearer REDACTED, " +
      "Authorization: Bearer REDACTED, LOCALHOST_LITERAL, 127.0.0.1 example only, " +
      "secret placeholder only. These are inert placeholders only and not executable instructions.",
    metadata: {
      source: "stc-safe",
      kind: "risk-canary-cyber-markers",
    },
  },
];

function toPosix(value) {
  return String(value || "").replaceAll("\\", "/");
}

function compareTitle(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

function stableSha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function byteLength(value) {
  return Buffer.byteLength(String(value ?? ""), "utf8");
}

function classifySensitiveMarkers(value) {
  const text = String(value ?? "");
  const lower = text.toLowerCase();

  return {
    has_mcp: /\bmcp\b/i.test(text),
    has_token: /token/i.test(text),
    has_localhost: lower.includes("localhost"),
    has_loopback: lower.includes("127.0.0.1") || lower.includes("::1"),
    has_bearer: /\bbearer\b/i.test(text),
    has_authorization: /authorization/i.test(text),
    has_secret: /secret/i.test(text),
    has_key: /\bkey\b/i.test(text) || /api[_-]?key/i.test(text),
    has_password: /password/i.test(text) || /\bpwd\b/i.test(text),
  };
}

function summarizeSensitiveArg(value) {
  const text = String(value ?? "");
  return {
    arg_sha256: stableSha256(text),
    arg_length_chars: text.length,
    arg_length_bytes: byteLength(text),
    flags: classifySensitiveMarkers(text),
  };
}

function nextRequestId() {
  REQUEST_COUNTER += 1;
  return `stc-safe-${Date.now().toString(36)}-${REQUEST_COUNTER}`;
}

async function auditConnectorEvent(event, fields = {}) {
  await audit(event, {
    audit_version: STC_SAFE_AUDIT_VERSION,
    server: STC_SAFE_SERVER_NAME,
    server_version: STC_SAFE_SERVER_VERSION,
    connectorShapeVersion: CONNECTOR_SHAPE_VERSION,
    ...fields,
  });
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

  if (STC_SAFE_ENABLE_DIAGNOSTIC_DOCS) {
    docs.push(...DIAGNOSTIC_DOCS.map((doc) => ({ ...doc, metadata: { ...doc.metadata } })));
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

function truncateText(text, maxChars) {
  const value = String(text || "");

  if (value.length <= maxChars) {
    return {
      text: value,
      truncated: false,
      original_chars: value.length,
    };
  }

  return {
    text: value.slice(0, maxChars),
    truncated: true,
    original_chars: value.length,
  };
}

export function toolTextResult(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload),
      },
    ],
    structuredContent: payload,
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

    const truncated = truncateText(doc.text, STC_SAFE_FETCH_CAP_CHARS);

    return {
      id: doc.id,
      title: doc.title,
      text: truncated.text,
      url: docUrl(normalizedPublicBaseUrl, doc.id),
      metadata: {
        ...doc.metadata,
        connectorShapeVersion: CONNECTOR_SHAPE_VERSION,
        truncated: truncated.truncated,
        original_chars: truncated.original_chars,
        cap_chars: STC_SAFE_FETCH_CAP_CHARS,
      },
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
        outputSchema: SEARCH_OUTPUT_SCHEMA,
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
        outputSchema: FETCH_OUTPUT_SCHEMA,
        annotations: readOnlyAnnotations,
      },
    ];
  }

  async function handleRpcMessage(message) {
    const id = Object.prototype.hasOwnProperty.call(message, "id") ? message.id : undefined;
    const method = message.method;
    const params = message.params || {};
    const requestId = nextRequestId();

    if (id === undefined && method !== "notifications/initialized") {
      return undefined;
    }

    await auditConnectorEvent("rpc_received", {
      request_id: requestId,
      method: method || null,
      has_rpc_id: id !== undefined,
      rpc_id_type: id === undefined ? "undefined" : id === null ? "null" : typeof id,
    });

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
          return timeTool("stc_safe.search", args, async () => {
            const startedAt = Date.now();
            const argSummary = summarizeSensitiveArg(args.query);
            await auditConnectorEvent("tool_call_start", {
              request_id: requestId,
              tool: "search",
              arg_name: "query",
              ...argSummary,
            });
            try {
              const output = { results: searchDocs(args.query) };
              await auditConnectorEvent("stc_safe_search", {
                request_id: requestId,
                ...argSummary,
                result_count: output.results.length,
                shape_version: CONNECTOR_SHAPE_VERSION,
              });
              await auditConnectorEvent("tool_call_end", {
                request_id: requestId,
                tool: "search",
                result_count: output.results.length,
                result_chars: JSON.stringify(output).length,
                duration_ms: Date.now() - startedAt,
                is_error: false,
              });
              return rpcResult(id, toolTextResult(output));
            } catch (error) {
              await auditConnectorEvent("tool_call_error", {
                request_id: requestId,
                tool: "search",
                duration_ms: Date.now() - startedAt,
                error_message: error.message || String(error),
              });
              throw error;
            }
          });
        }

        if (name === "fetch") {
          return timeTool("stc_safe.fetch", args, async () => {
            const startedAt = Date.now();
            const argSummary = summarizeSensitiveArg(args.id);
            await auditConnectorEvent("tool_call_start", {
              request_id: requestId,
              tool: "fetch",
              arg_name: "id",
              ...argSummary,
            });
            try {
              const doc = fetchDoc(args.id);
              await auditConnectorEvent("stc_safe_fetch", {
                request_id: requestId,
                ...argSummary,
                found: Boolean(doc),
                shape_version: CONNECTOR_SHAPE_VERSION,
              });
              if (!doc) {
                const errorPayload = { error: "Document not found." };
                await auditConnectorEvent("tool_call_end", {
                  request_id: requestId,
                  tool: "fetch",
                  result_count: 0,
                  result_chars: JSON.stringify(errorPayload).length,
                  result_text_truncated: false,
                  result_original_chars: 0,
                  result_cap_chars: STC_SAFE_FETCH_CAP_CHARS,
                  duration_ms: Date.now() - startedAt,
                  is_error: true,
                });
                return rpcResult(id, {
                  content: [{ type: "text", text: JSON.stringify(errorPayload) }],
                  isError: true,
                });
              }
              await auditConnectorEvent("tool_call_end", {
                request_id: requestId,
                tool: "fetch",
                result_count: 1,
                result_chars: doc.text.length,
                result_text_truncated: doc.metadata.truncated,
                result_original_chars: doc.metadata.original_chars,
                result_cap_chars: doc.metadata.cap_chars,
                duration_ms: Date.now() - startedAt,
                is_error: false,
              });
              return rpcResult(id, toolTextResult(doc));
            } catch (error) {
              await auditConnectorEvent("tool_call_error", {
                request_id: requestId,
                tool: "fetch",
                duration_ms: Date.now() - startedAt,
                error_message: error.message || String(error),
              });
              throw error;
            }
          });
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
      await timeRequest({ method: req.method, url: req.url, runtime: "stc_safe" }, async () => {
        if (Array.isArray(payload)) {
          const responses = [];
          for (const item of payload) {
            const response = await handleRpcMessage(item || {});
            if (response !== undefined) responses.push(response);
          }
          await auditConnectorEvent("stc_safe_request", {
            method: req.method,
            path: "/mcp",
            batch: true,
            item_count: payload.length,
          });
          if (responses.length === 0) return emptyResponse(res, 204);
          jsonResponse(res, 200, responses);
          return;
        }

        const response = await handleRpcMessage(payload || {});
        await auditConnectorEvent("stc_safe_request", {
          method: req.method,
          path: "/mcp",
          batch: false,
          rpc_method: payload?.method || null,
        });
        if (response === undefined) return emptyResponse(res, 204);
        jsonResponse(res, 200, response);
      });
    } catch (error) {
      await auditConnectorEvent("server_error", {
        method: req.method,
        path: "/mcp",
        error_message: error.message || "Internal server error",
      });
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
      output_mode: "structured",
      fetch_cap_chars: STC_SAFE_FETCH_CAP_CHARS,
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

  if (!searchResult.structuredContent) {
    throw new Error("search must return structuredContent");
  }

  if (!Array.isArray(parsedSearch.results)) {
    throw new Error("search must return a top-level results array");
  }

  if (JSON.stringify(searchResult.structuredContent) !== JSON.stringify(parsedSearch)) {
    throw new Error("search structuredContent must mirror content JSON");
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

  if (!fetchResult.structuredContent) {
    throw new Error("fetch must return structuredContent");
  }

  for (const key of ["id", "title", "text", "url", "metadata"]) {
    if (!(key in parsedFetch)) {
      throw new Error(`fetch missing key: ${key}`);
    }
  }

  for (const key of ["source", "kind", "connectorShapeVersion", "truncated", "original_chars", "cap_chars"]) {
    if (!(key in parsedFetch.metadata)) {
      throw new Error(`fetch metadata missing key: ${key}`);
    }
  }

  if (JSON.stringify(fetchResult.structuredContent) !== JSON.stringify(parsedFetch)) {
    throw new Error("fetch structuredContent must mirror content JSON");
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
