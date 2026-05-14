import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import {
  applyServerToolsCliConfig,
  assertSupportedRuntimeConfig,
  parseServerToolsCliArgs,
  resolveAuthModulePath,
  serverToolsUsage,
} from "./core/server_tools_bootstrap.js";

function exitUsage(error) {
  if (error?.message) {
    console.error(`ERROR: ${error.message}`);
    console.error("");
  }
  console.error(serverToolsUsage());
  process.exit(2);
}

let cliConfig;
try {
  const parsed = parseServerToolsCliArgs();
  cliConfig = applyServerToolsCliConfig(parsed);
  assertSupportedRuntimeConfig(cliConfig);
} catch (error) {
  if (error?.code === "CLI_USAGE") {
    exitUsage(error);
  }

  console.error("MCP STARTUP FAILED:", error?.message || String(error));
  process.exit(1);
}

const [
  { PORT, JSON_BODY_LIMIT, SERVER_AUTH_MODE },
  authModule,
  { timeTool, timeRequest, perfStatus },
  { runRecovery },
  { rollbackPatchForRecovery },
] = await Promise.all([
  import("./core/config.js"),
  import(resolveAuthModulePath(cliConfig.authMode)),
  import("./core/perf.js"),
  import("./core/orchestration/recovery.js"),
  import("./core/recovery_rollback.js"),
]);

const { requireAuth } = authModule;

const moduleLoaders = await Promise.all(
  cliConfig.enabledModules.map(async (moduleDef) => {
    const imported = await import(moduleDef.importPath);
    const register = imported[moduleDef.registerExport];
    if (typeof register !== "function") {
      throw new Error(
        `Module ${moduleDef.id} does not export expected function ${moduleDef.registerExport}`
      );
    }
    return {
      ...moduleDef,
      register,
    };
  })
);

function createServer(activeModuleLoaders = moduleLoaders) {
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

  for (const moduleLoader of activeModuleLoaders) {
    moduleLoader.register(server);
  }

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
    "Content-Type, Accept, Authorization, Mcp-Session-Id, mcp-session-id, Cf-Access-Jwt-Assertion"
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
    console.log(`AUTH MODE: ${SERVER_AUTH_MODE}`);
    console.log(`URL: http://127.0.0.1:${PORT}/mcp`);
    if (cliConfig.tokenFile) {
      console.log(`TOKEN FILE: ${cliConfig.tokenFile}`);
    }
    console.log("PERF:", status);
    console.log("RECOVERY:", {
      status: recovery.status,
      recovered_count: recovery.recovered_count,
    });
    console.log(
      "MODULES:",
      {
        enabled_ids: cliConfig.enabledModules.map((item) => item.id),
        disabled_ids: cliConfig.disabledModules.map((item) => item.id),
        enabled_labels: cliConfig.enabledModules.map((item) => item.label),
      }
    );
  });
}

start().catch((err) => {
  console.error("MCP STARTUP FAILED:", err?.message || String(err));
  process.exit(1);
});
