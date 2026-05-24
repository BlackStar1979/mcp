import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("server.js", "utf8");

test("server.js MCP endpoint exposes Accept header in CORS allow-list", () => {
  assert.match(
    src,
    /Content-Type, Accept, Mcp-Session-Id, mcp-session-id/
  );
});

test("server.js MCP endpoint uses streamable HTTP transport", () => {
  assert.match(src, /new StreamableHTTPServerTransport\(/);
});

test("server.js handles malformed JSON bodies with bounded parse error response", () => {
  assert.match(src, /entity\.parse\.failed/);
  assert.match(src, /code:\s*-32700/);
  assert.match(src, /message:\s*"Parse error"/);
});

test("server.js keeps bounded JSON-RPC method-not-allowed handling on /mcp", () => {
  assert.match(src, /function methodNotAllowed\(res\)/);
  assert.match(src, /res\.status\(405\)\.json\(/);
  assert.match(src, /message:\s*"Method not allowed\."/);
  assert.match(src, /app\.get\("\/mcp",[\s\S]*?methodNotAllowed\(res\)/);
  assert.match(src, /app\.delete\("\/mcp",[\s\S]*?methodNotAllowed\(res\)/);
});
