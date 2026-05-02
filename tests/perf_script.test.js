import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const perfScript = fs.readFileSync("perf.ps1", "utf8");

test("perf script manages MCP perf flag", () => {
  assert.match(perfScript, /\.mcp_perf_on/);
  assert.match(perfScript, /Enable/);
  assert.match(perfScript, /Disable/);
});

test("perf script reads MCP perf log", () => {
  assert.match(perfScript, /\.mcp_perf\.log/);
  assert.match(perfScript, /Report/);
  assert.match(perfScript, /top_slow/);
});

test("perf script writes audit events", () => {
  assert.match(perfScript, /perf_enable/);
  assert.match(perfScript, /perf_disable/);
  assert.match(perfScript, /perf_error/);
});
