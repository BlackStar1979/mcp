import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("server_tools MCP endpoint exposes Accept header in CORS allow-list", () => {
  const src = fs.readFileSync("server_tools.js", "utf8");
  assert.match(
    src,
    /Content-Type, Accept, Authorization, Mcp-Session-Id, mcp-session-id, Cf-Access-Jwt-Assertion/
  );
});

test("server_tools MCP endpoint uses streamable HTTP transport", () => {
  const src = fs.readFileSync("server_tools.js", "utf8");
  assert.match(src, /new StreamableHTTPServerTransport\(/);
});
