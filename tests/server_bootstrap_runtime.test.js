import test from "node:test";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerIndexTools } from "../core/tools_index.js";
import { registerFsTools } from "../core/tools_fs.js";
import { registerScienceTools } from "../core/science_tools.js";
import { registerCodeTools } from "../core/code_tools_safe.js";
import { registerRegistryTools } from "../core/registry_tools_safe.js";
import { registerWebTools } from "../core/web_tools.js";
import { registerTruthTools } from "../core/truth_tools.js";
import { registerProcessTools } from "../core/process_tools_safe.js";
import { registerRemoteSiteTools } from "../core/remote_site_tools.js";

test("full MCP runtime tool registration bootstrap succeeds", () => {
  const server = new McpServer({
    name: "bootstrap-test",
    version: "1.0.0",
  });

  assert.doesNotThrow(() => {
    registerIndexTools(server);
    registerFsTools(server);
    registerScienceTools(server);
    registerCodeTools(server);
    registerRegistryTools(server);
    registerWebTools(server);
    registerTruthTools(server);
    registerProcessTools(server);
    registerRemoteSiteTools(server);
  });
});
