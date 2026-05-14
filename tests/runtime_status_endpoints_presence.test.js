import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("server_tools exposes healthz and statusz endpoints", () => {
  const src = fs.readFileSync("server_tools.js", "utf8");
  assert.match(src, /app\.get\("\/healthz"/);
  assert.match(src, /app\.get\("\/statusz"/);
});

test("server.js exposes healthz and statusz endpoints", () => {
  const src = fs.readFileSync("server.js", "utf8");
  assert.match(src, /app\.get\("\/healthz"/);
  assert.match(src, /app\.get\("\/statusz"/);
});
