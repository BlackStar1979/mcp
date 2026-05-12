import {
  CONNECTOR_SHAPE_VERSION,
  STC_SAFE_HOST,
  STC_SAFE_PORT,
  STC_SAFE_PUBLIC_BASE_URL,
  STC_SAFE_SERVER_NAME,
  STC_SAFE_SERVER_VERSION,
  assertConnectorShape,
  createConnectorSafeRuntime,
} from "./core/stc_safe_runtime.js";

if (process.argv.includes("--self-test")) {
  assertConnectorShape();
  console.log(`self-test ok (${CONNECTOR_SHAPE_VERSION})`);
  process.exit(0);
}

const runtime = createConnectorSafeRuntime();
const server = runtime.createServer();

server.on("error", (error) => {
  console.error("CONNECTOR-SAFE MCP FAILED:", error.message);
  process.exit(1);
});

server.listen(STC_SAFE_PORT, STC_SAFE_HOST, () => {
  console.log(`${STC_SAFE_SERVER_NAME} v${STC_SAFE_SERVER_VERSION}`);
  console.log(`Connector shape: ${CONNECTOR_SHAPE_VERSION}`);
  console.log(`Local: http://${STC_SAFE_HOST}:${STC_SAFE_PORT}/mcp`);
  console.log(`Public: ${STC_SAFE_PUBLIC_BASE_URL}/mcp`);
});
