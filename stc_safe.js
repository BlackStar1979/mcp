import {
  CONNECTOR_SHAPE_VERSION,
  STC_SAFE_HOST,
  STC_SAFE_PORT,
  STC_SAFE_PUBLIC_BASE_URL,
  STC_SAFE_AUDIT_VERSION,
  STC_SAFE_SERVER_NAME,
  STC_SAFE_SERVER_VERSION,
  assertConnectorShape,
  createConnectorSafeRuntime,
} from "./core/stc_safe_runtime.js";
import { audit } from "./core/audit.js";

if (process.argv.includes("--self-test")) {
  assertConnectorShape();
  console.log(`self-test ok (${CONNECTOR_SHAPE_VERSION})`);
  process.exit(0);
}

const runtime = createConnectorSafeRuntime();
const server = runtime.createServer();

server.on("error", (error) => {
  void audit("server_error", {
    audit_version: STC_SAFE_AUDIT_VERSION,
    server: STC_SAFE_SERVER_NAME,
    server_version: STC_SAFE_SERVER_VERSION,
    connectorShapeVersion: CONNECTOR_SHAPE_VERSION,
    error_message: error.message || String(error),
  }).catch(() => {});
  console.error("CONNECTOR-SAFE MCP FAILED:", error.message);
  process.exit(1);
});

server.listen(STC_SAFE_PORT, STC_SAFE_HOST, () => {
  void audit("server_start", {
    audit_version: STC_SAFE_AUDIT_VERSION,
    server: STC_SAFE_SERVER_NAME,
    server_version: STC_SAFE_SERVER_VERSION,
    connectorShapeVersion: CONNECTOR_SHAPE_VERSION,
    host: STC_SAFE_HOST,
    port: STC_SAFE_PORT,
    public_base_url: STC_SAFE_PUBLIC_BASE_URL,
  }).catch(() => {});
  console.log(`${STC_SAFE_SERVER_NAME} v${STC_SAFE_SERVER_VERSION}`);
  console.log(`Connector shape: ${CONNECTOR_SHAPE_VERSION}`);
  console.log(`Local: http://${STC_SAFE_HOST}:${STC_SAFE_PORT}/mcp`);
  console.log(`Public: ${STC_SAFE_PUBLIC_BASE_URL}/mcp`);
});
