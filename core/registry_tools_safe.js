import { z } from "zod";

import { registerSafeTool } from "./responses.js";
import { audit } from "./audit.js";
import { loadRegistry, registryStatus } from "./registry/registry.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const TOOL_NAME_SCHEMA = z.string().min(1).max(80).regex(/^[A-Za-z0-9_.-]+$/);
const OPERATION_SCHEMA = z.string().min(1).max(80).regex(/^[A-Za-z0-9_.-]+$/);

const REGISTRY_TOOL_SUMMARY_OUTPUT = z.object({
  tool: z.string(),
  enabled: z.boolean(),
  description: z.string(),
  provider: z.string(),
  base_model: z.string(),
  adapter: z.string(),
  dsl_schema: z.string(),
  output_schema: z.string(),
  max_internal_steps: z.number(),
  max_questions_to_dyrygent: z.number(),
  budget_tokens: z.number(),
}).strict();

const REGISTRY_STATUS_TOOL_OUTPUT = z.object({
  status: z.string(),
  connector_safe: z.boolean(),
  dispatch_enabled: z.boolean(),
  registry: z.object({
    status: z.string(),
    version: z.string(),
    registry_id: z.string(),
    tool_count: z.number(),
    enabled_tool_count: z.number(),
    tools: z.array(REGISTRY_TOOL_SUMMARY_OUTPUT),
  }).strict(),
}).strict();

const REGISTRY_LIST_TOOL_OUTPUT = z.object({
  status: z.string(),
  connector_safe: z.boolean(),
  dispatch_enabled: z.boolean(),
  version: z.string(),
  registry_id: z.string(),
  tool_count: z.number(),
  enabled_tool_count: z.number(),
  tools: z.array(REGISTRY_TOOL_SUMMARY_OUTPUT),
}).strict();

function registrySummary(status) {
  return {
    status: "ok",
    connector_safe: true,
    dispatch_enabled: false,
    registry: status,
  };
}

function findTool(status, toolName) {
  return status.tools.find((item) => item.tool === toolName) || null;
}

function findFullTool(registry, toolName) {
  return registry.tools.find((item) => item.tool === toolName) || null;
}

function validateToolDecision(status, toolName) {
  const found = findTool(status, toolName);

  if (!found) {
    return {
      status: "not_found",
      connector_safe: true,
      dispatch_enabled: false,
      registry_id: status.registry_id,
      tool: toolName,
      found: false,
      enabled: false,
      allowed: false,
      reason: "tool_not_found",
    };
  }

  if (!found.enabled) {
    return {
      status: "ok",
      connector_safe: true,
      dispatch_enabled: false,
      registry_id: status.registry_id,
      tool: toolName,
      found: true,
      enabled: false,
      allowed: false,
      reason: "tool_disabled",
      metadata: found,
    };
  }

  return {
    status: "ok",
    connector_safe: true,
    dispatch_enabled: false,
    registry_id: status.registry_id,
    tool: toolName,
    found: true,
    enabled: true,
    allowed: true,
    reason: null,
    metadata: found,
  };
}

function policyDetail(registry, toolName) {
  const found = findFullTool(registry, toolName);

  if (!found) {
    return {
      status: "not_found",
      connector_safe: true,
      dispatch_enabled: false,
      registry_id: registry.registry_id,
      tool: toolName,
      found: false,
      enabled: false,
      allowed: false,
      reason: "tool_not_found",
    };
  }

  const enabled = found.enabled === true;
  return {
    status: "ok",
    connector_safe: true,
    dispatch_enabled: false,
    registry_id: registry.registry_id,
    version: registry.version,
    tool: found.tool,
    found: true,
    enabled,
    allowed: enabled,
    reason: enabled ? null : "tool_disabled",
    runtime: found.runtime,
    rag: found.rag,
    sandbox: found.sandbox,
    limits: found.limits,
    policy: found.policy,
    observability: found.observability,
    rollback: found.rollback,
    schemas: {
      dsl_schema: found.dsl_schema,
      output_schema: found.output_schema,
    },
  };
}

function preflightDecision(registry, toolName, operation) {
  const found = findFullTool(registry, toolName);

  if (!found) {
    return {
      status: "not_found",
      connector_safe: true,
      dispatch_enabled: false,
      registry_id: registry.registry_id,
      tool: toolName,
      operation,
      found: false,
      enabled: false,
      allowed: false,
      reason: "tool_not_found",
    };
  }

  if (found.enabled !== true) {
    return {
      status: "ok",
      connector_safe: true,
      dispatch_enabled: false,
      registry_id: registry.registry_id,
      tool: toolName,
      operation,
      found: true,
      enabled: false,
      allowed: false,
      reason: "tool_disabled",
    };
  }

  const allowedOperations = found.policy?.allowed_operations || [];
  const operationAllowed = allowedOperations.includes(operation);

  if (!operationAllowed) {
    return {
      status: "ok",
      connector_safe: true,
      dispatch_enabled: false,
      registry_id: registry.registry_id,
      tool: toolName,
      operation,
      found: true,
      enabled: true,
      allowed: false,
      reason: "operation_not_allowed",
      allowed_operations: allowedOperations,
    };
  }

  return {
    status: "ok",
    connector_safe: true,
    dispatch_enabled: false,
    registry_id: registry.registry_id,
    tool: toolName,
    operation,
    found: true,
    enabled: true,
    allowed: true,
    reason: null,
    requires_dry_run: found.policy.requires_dry_run,
    requires_validation: found.policy.requires_validation,
    requires_audit: found.policy.requires_audit,
    allow_network: found.policy.allow_network,
    allow_project_write: found.policy.allow_project_write,
    limits: found.limits,
    sandbox: found.sandbox,
    observability: found.observability,
  };
}

function planDecision(registry, toolName, operation) {
  const preflight = preflightDecision(registry, toolName, operation);

  if (preflight.allowed !== true) {
    return {
      ...preflight,
      status: preflight.status === "not_found" ? "not_found" : "blocked",
      plan_ready: false,
      execution_enabled: false,
      steps: [],
    };
  }

  return {
    status: "plan_ready",
    connector_safe: true,
    dispatch_enabled: false,
    execution_enabled: false,
    registry_id: registry.registry_id,
    tool: toolName,
    operation,
    found: true,
    enabled: true,
    allowed: true,
    reason: null,
    requires_dry_run: preflight.requires_dry_run,
    requires_validation: preflight.requires_validation,
    requires_audit: preflight.requires_audit,
    limits: preflight.limits,
    steps: [
      { order: 1, action: "preflight", status: "complete" },
      { order: 2, action: "load_policy", status: "planned" },
      { order: 3, action: "validate_operation", status: "planned" },
      { order: 4, action: "prepare_readonly_execution", status: "planned" },
      { order: 5, action: "return_plan_only", status: "planned" }
    ],
  };
}

export function registerRegistryTools(server) {
  registerSafeTool(server, "tool_registry_status", {
    title: "Tool registry status",
    outputSchema: REGISTRY_STATUS_TOOL_OUTPUT,
    description: "Return validated read-only registry metadata. Does not dispatch tools or mutate files.",
    inputSchema: z.object({}).strict(),
    annotations: READ_ONLY,
  }, async () => {
    const status = await registryStatus();
    await audit("tool_registry_status", {
      source: "registry_tools_safe",
      event: "tool_registry_status",
      registry_id: status.registry_id,
      tool_count: status.tool_count,
      enabled_tool_count: status.enabled_tool_count,
    });

    return registrySummary(status);
  });

  registerSafeTool(server, "tool_registry_list", {
    title: "Tool registry list",
    description: "List registered tools and registry policy metadata without dispatching tools or mutating files.",
    inputSchema: z.object({}).strict(),
    outputSchema: REGISTRY_LIST_TOOL_OUTPUT,
    annotations: READ_ONLY,
  }, async () => {
    const status = await registryStatus();
    await audit("tool_registry_list", {
      source: "registry_tools_safe",
      event: "tool_registry_list",
      registry_id: status.registry_id,
      tool_count: status.tool_count,
      enabled_tool_count: status.enabled_tool_count,
    });

    return {
      status: "ok",
      connector_safe: true,
      dispatch_enabled: false,
      version: status.version,
      registry_id: status.registry_id,
      tool_count: status.tool_count,
      enabled_tool_count: status.enabled_tool_count,
      tools: status.tools,
    };
  });

  registerSafeTool(server, "tool_registry_get_tool", {
    title: "Get registered tool metadata",
    description: "Return read-only metadata for one registered tool. Does not dispatch or execute the tool.",
    inputSchema: z.object({
      tool: TOOL_NAME_SCHEMA,
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ tool }) => {
    const status = await registryStatus();
    const found = findTool(status, tool);

    await audit("tool_registry_get_tool", {
      source: "registry_tools_safe",
      event: "tool_registry_get_tool",
      registry_id: status.registry_id,
      tool,
      found: Boolean(found),
    });

    if (!found) {
      return {
        status: "not_found",
        connector_safe: true,
        dispatch_enabled: false,
        registry_id: status.registry_id,
        tool,
      };
    }

    return {
      status: "ok",
      connector_safe: true,
      dispatch_enabled: false,
      version: status.version,
      registry_id: status.registry_id,
      tool: found,
    };
  });

  registerSafeTool(server, "tool_registry_validate_tool", {
    title: "Validate registered tool availability",
    description: "Validate whether one registered tool is known, enabled, and allowed for read-only registry access. Does not dispatch or execute the tool.",
    inputSchema: z.object({
      tool: TOOL_NAME_SCHEMA,
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ tool }) => {
    const status = await registryStatus();
    const decision = validateToolDecision(status, tool);

    await audit("tool_registry_validate_tool", {
      source: "registry_tools_safe",
      event: "tool_registry_validate_tool",
      registry_id: status.registry_id,
      tool,
      found: decision.found,
      enabled: decision.enabled,
      allowed: decision.allowed,
      reason: decision.reason,
    });

    return decision;
  });

  registerSafeTool(server, "tool_registry_policy", {
    title: "Registered tool policy detail",
    description: "Return read-only runtime, policy, sandbox, limits, observability, and rollback metadata for one registered tool. Does not dispatch or execute the tool.",
    inputSchema: z.object({
      tool: TOOL_NAME_SCHEMA,
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ tool }) => {
    const registry = await loadRegistry({ force: true });
    const detail = policyDetail(registry, tool);

    await audit("tool_registry_policy", {
      source: "registry_tools_safe",
      event: "tool_registry_policy",
      registry_id: registry.registry_id,
      tool,
      found: detail.found,
      enabled: detail.enabled,
      allowed: detail.allowed,
      reason: detail.reason,
    });

    return detail;
  });

  registerSafeTool(server, "tool_registry_preflight", {
    title: "Registry operation preflight",
    description: "Validate whether one registry operation is allowed by tool policy. Does not dispatch or execute the tool.",
    inputSchema: z.object({
      tool: TOOL_NAME_SCHEMA,
      operation: OPERATION_SCHEMA,
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ tool, operation }) => {
    const registry = await loadRegistry({ force: true });
    const decision = preflightDecision(registry, tool, operation);

    await audit("tool_registry_preflight", {
      source: "registry_tools_safe",
      event: "tool_registry_preflight",
      registry_id: registry.registry_id,
      tool,
      operation,
      found: decision.found,
      enabled: decision.enabled,
      allowed: decision.allowed,
      reason: decision.reason,
    });

    return decision;
  });

  registerSafeTool(server, "tool_registry_plan", {
    title: "Registry operation plan",
    description: "Return a deterministic plan for an allowed registry operation. Does not dispatch or execute the tool.",
    inputSchema: z.object({
      tool: TOOL_NAME_SCHEMA,
      operation: OPERATION_SCHEMA,
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ tool, operation }) => {
    const registry = await loadRegistry({ force: true });
    const plan = planDecision(registry, tool, operation);

    await audit("tool_registry_plan", {
      source: "registry_tools_safe",
      event: "tool_registry_plan",
      registry_id: registry.registry_id,
      tool,
      operation,
      allowed: plan.allowed,
      plan_ready: plan.plan_ready,
      reason: plan.reason,
    });

    return plan;
  });
}
