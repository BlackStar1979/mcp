import { registerTruthAuditTools } from "./truth/audit_tools.js";
import { registerTruthWorkflowTools } from "./truth/workflow_tools.js";
import { registerTruthUsageTools } from "./truth/usage_tools.js";

// Package facade: truth tool family entrypoint for server bootstrap.
export function registerTruthTools(server) {
  registerTruthAuditTools(server);
  registerTruthWorkflowTools(server);
  registerTruthUsageTools(server);
}
