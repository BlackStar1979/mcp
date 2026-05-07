import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { PORT, JSON_BODY_LIMIT } from "./core/config.js";
import { requireAuth } from "./core/auth.js";
import { registerIndexTools } from "./core/tools_index.js";
import { registerFsTools } from "./core/tools_fs.js";
import { registerScienceTools } from "./core/science_tools.js";
import { registerCodeTools } from "./core/code_tools_safe.js";
import { registerRegistryTools } from "./core/registry_tools_safe.js";
import { registerWebTools } from "./core/web_tools.js";
import { registerTruthTools } from "./core/truth_tools.js";
import { registerProcessTools } from "./core/process_tools_safe.js";
import { timeTool, timeRequest, perfStatus } from "./core/perf.js";
import { runRecovery } from "./core/orchestration/recovery.js";
import { rollbackPatchForRecovery } from "./core/recovery_rollback.js";

function createServer() {
  const server = new McpServer({
    name: "modular-tools",
    version: "1.7.0",
  });

  const originalRegister = server.registerTool.bind(server);

  server.registerTool = (name, config, handler) => {
    return originalRegister(name, config, async (args) => {
      return timeTool(name, args, () => handler(args));
    });
  };

  registerIndexTools(server);
  registerFsTools(server);
  registerScienceTools(server);
  registerCodeTools(server);
  registerRegistryTools(server);
  registerWebTools(server);
  registerTruthTools(server);
  registerProcessTools(server);

  return server;
}

const app = express();

app.use(express.json({ limit: JSON_BODY_LIMIT }));

app.get("/", (req, res) => {
  res.status(200).send("MCP server is running. Use POST /mcp.");
});

function methodNotAllowed(res) {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed.",
    },
    id: null,
  });
}

app.get("/mcp", (req, res) => {
  methodNotAllowed(res);
});

app.delete("/mcp", (req, res) => {
  methodNotAllowed(res);
});

app.options("/mcp", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, Mcp-Session-Id, mcp-session-id"
  );
  res.status(204).end();
});

app.post("/mcp", async (req, res) => {
  const server = createServer();

  try {
    await timeRequest({ method: req.method, url: req.url }, async () => {
      await requireAuth(req, res, async () => {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);

        res.on("close", async () => {
          try {
            await transport.close();
            await server.close();
          } catch {}
        });
      });
    });
  } catch (err) {
    console.error("MCP request failed:", err);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: req.body?.id ?? null,
      });
    }
  }
});

async function start() {
  const recovery = await runRecovery({
    rollbackPatch: rollbackPatchForRecovery,
  });

  if (recovery.status !== "recovery_ok") {
    throw new Error(`startup recovery incomplete: ${recovery.status}`);
  }

  app.listen(PORT, "127.0.0.1", async () => {
    const status = await perfStatus();

    console.log("MODULAR MCP running v1.7.0");
    console.log(`URL: http://127.0.0.1:${PORT}/mcp`);
    console.log("PERF:", status);
    console.log("RECOVERY:", {
      status: recovery.status,
      recovered_count: recovery.recovered_count,
    });
  });
}

start().catch((err) => {
  console.error("MCP STARTUP FAILED:", err?.message || String(err));
  process.exit(1);
});
