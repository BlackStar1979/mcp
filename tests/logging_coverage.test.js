import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function read(filePath) {
  return fs.readFile(filePath, "utf8");
}

test("server_tools keeps central perf wrappers for requests and tools", async () => {
  const source = await read("C:/Work/mcp/server_tools.js");
  assert.match(source, /timeTool\(name, args, \(\) => handler\(args\)\)/);
  assert.match(source, /await timeRequest\(\{ method: req\.method, url: req\.url \}/);
});

test("connector-safe runtime logs requests and tool calls", async () => {
  const source = await read("C:/Work/mcp/core/stc_safe_runtime.js");
  assert.match(source, /import \{ audit \} from "\.\/audit\.js";/);
  assert.match(source, /import \{ timeRequest, timeTool \} from "\.\/perf\.js";/);
  assert.match(source, /await auditConnectorEvent\("rpc_received"/);
  assert.match(source, /await auditConnectorEvent\("tool_call_start"/);
  assert.match(source, /await auditConnectorEvent\("tool_call_end"/);
  assert.match(source, /await auditConnectorEvent\("stc_safe_search"/);
  assert.match(source, /await auditConnectorEvent\("stc_safe_fetch"/);
  assert.match(source, /await auditConnectorEvent\("stc_safe_request"/);
  assert.match(source, /await timeRequest\(\{ method: req\.method, url: req\.url, runtime: "stc_safe" \}/);
});

test("index, science, and code tool groups contain audit logging", async () => {
  const indexSource = await read("C:/Work/mcp/core/tools_index.js");
  const scienceSource = await read("C:/Work/mcp/core/science_tools.js");
  const codeSource = await read("C:/Work/mcp/core/code_tools_safe.js");

  for (const pattern of [
    /await audit\("index_status"/,
    /await audit\("build_index"/,
    /await audit\("search_index"/,
    /await audit\("search_index_context"/,
    /await audit\("collect_context"/,
    /await audit\("collect_romionsim_context"/,
  ]) {
    assert.match(indexSource, pattern);
  }

  for (const pattern of [
    /await audit\("inventory_tree"/,
    /await audit\("fits_info"/,
    /await audit\("hdf5_info"/,
    /await audit\("table_profile"/,
  ]) {
    assert.match(scienceSource, pattern);
  }

  for (const pattern of [
    /await audit\("code_symbols"/,
    /await audit\("code_dependencies"/,
    /await audit\("code_audit"/,
    /await audit\("code_impact"/,
  ]) {
    assert.match(codeSource, pattern);
  }
});

test("auth modules leave audit traces on denied requests", async () => {
  const accessSource = await read("C:/Work/mcp/core/auth.js");
  const bearerSource = await read("C:/Work/mcp/core/auth_bearer.js");

  assert.match(accessSource, /audit\("auth_access_denied"/);
  assert.match(bearerSource, /audit\("auth_bearer_error"/);
  assert.match(bearerSource, /audit\("auth_bearer_denied"/);
});
