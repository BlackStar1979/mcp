import { registerTruthAuditTools } from "./truth/audit_tools.js";
import { registerTruthWorkflowTools } from "./truth/workflow_tools.js";
import { registerTruthUsageTools } from "./truth/usage_tools.js";

export function registerTruthTools(server) {
  registerTruthAuditTools(server);
  registerTruthWorkflowTools(server);
  registerTruthUsageTools(server);
}
