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

const REGISTRY_GET_TOOL_OUTPUT = z.object({
  status: z.string(),
  connector_safe: z.boolean(),
  dispatch_enabled: z.boolean(),
  version: z.string().optional(),
  registry_id: z.string(),
  tool: z.string(),
  found: z.boolean(),
  enabled: z.boolean().optional(),
  description: z.string().optional(),
  provider: z.string().optional(),
  base_model: z.string().optional(),
  adapter: z.string().optional(),
  dsl_schema: z.string().optional(),
  output_schema: z.string().optional(),
  max_internal_steps: z.number().optional(),
  max_questions_to_dyrygent: z.number().optional(),
  budget_tokens: z.number().optional(),
}).strict();

const REGISTRY_VALIDATE_TOOL_OUTPUT = z.object({
  status: z.string(),
  connector_safe: z.boolean(),
  dispatch_enabled: z.boolean(),
  registry_id: z.string(),
  tool: z.string(),
  found: z.boolean(),
  enabled: z.boolean(),
  allowed: z.boolean(),
  reason: z.string().nullable().optional(),
  metadata: REGISTRY_TOOL_SUMMARY_OUTPUT.optional(),
}).strict();

const REGISTRY_POLICY_TOOL_OUTPUT = z.object({
  status: z.string(),
  connector_safe: z.boolean(),
  dispatch_enabled: z.boolean(),
  registry_id: z.string(),
  version: z.string().optional(),
  tool: z.string(),
  found: z.boolean(),
  enabled: z.boolean(),
  allowed: z.boolean(),
  reason: z.string().nullable().optional(),
  runtime: z.object({
    provider: z.string(),
    base_model: z.string(),
    adapter: z.string(),
    adapter_required: z.boolean(),
  }).optional(),
  rag: z.object({
    index_path: z.string(),
    writable: z.boolean(),
    top_k: z.number(),
    max_context_chars: z.number(),
  }).optional(),
  sandbox: z.object({
    path: z.string(),
    read_write: z.boolean(),
    project_readonly: z.boolean(),
    ttl_seconds: z.number(),
    quota_mb: z.number(),
    clean_on_start: z.boolean(),
    clean_on_finish: z.boolean(),
  }).optional(),
  limits: z.object({
    max_internal_steps: z.number(),
    max_questions_to_dyrygent: z.number(),
    budget_tokens: z.number(),
    timeout_ms: z.number(),
  }).optional(),
  policy: z.object({
    allow_network: z.boolean(),
    allow_project_write: z.boolean(),
    requires_dry_run: z.boolean(),
    requires_validation: z.boolean(),
    requires_audit: z.boolean(),
    allowed_operations: z.array(z.string()),
  }).optional(),
  observability: z.object({
    trace_level: z.string(),
    ledger_path: z.string(),
    record_inputs: z.boolean(),
    record_plan: z.boolean(),
    record_steps: z.boolean(),
    record_outputs: z.boolean(),
    record_validation: z.boolean(),
  }).optional(),
  rollback: z.object({
    strategy: z.string(),
    checkpoint_required: z.boolean(),
  }).optional(),
  schemas: z.object({
    dsl_schema: z.string(),
    output_schema: z.string(),
  }).optional(),
}).strict();

const REGISTRY_PLAN_TOOL_OUTPUT = z.object({
  status: z.string(),
  connector_safe: z.boolean(),
  dispatch_enabled: z.boolean(),
  execution_enabled: z.boolean(),
  registry_id: z.string(),
  tool: z.string(),
  operation: z.string(),
  found: z.boolean(),
  enabled: z.boolean(),
  allowed: z.boolean(),
  plan_ready: z.boolean().optional(),
  reason: z.string().nullable().optional(),
  requires_dry_run: z.boolean().optional(),
  requires_validation: z.boolean().optional(),
  requires_audit: z.boolean().optional(),
  limits: z.object({
    max_internal_steps: z.number(),
    max_questions_to_dyrygent: z.number(),
    budget_tokens: z.number(),
    timeout_ms: z.number(),
  }).optional(),
  allowed_operations: z.array(z.string()).optional(),
  steps: z.array(z.object({
    order: z.number(),
    action: z.string(),
    status: z.string(),
  }).strict()),
}).strict();

const REGISTRY_PREFLIGHT_TOOL_OUTPUT = z.object({
  status: z.string(),
  connector_safe: z.boolean(),
  dispatch_enabled: z.boolean(),
  registry_id: z.string(),
  tool: z.string(),
  operation: z.string(),
  found: z.boolean(),
  enabled: z.boolean(),
  allowed: z.boolean(),
  reason: z.string().nullable().optional(),
  allowed_operations: z.array(z.string()).optional(),
  requires_dry_run: z.boolean().optional(),
  requires_validation: z.boolean().optional(),
  requires_audit: z.boolean().optional(),
  allow_network: z.boolean().optional(),
  allow_project_write: z.boolean().optional(),
  limits: z.object({
    max_internal_steps: z.number(),
    max_questions_to_dyrygent: z.number(),
    budget_tokens: z.number(),
    timeout_ms: z.number(),
  }).optional(),
  sandbox: z.object({
    path: z.string(),
    read_write: z.boolean(),
    project_readonly: z.boolean(),
    ttl_seconds: z.number(),
    quota_mb: z.number(),
    clean_on_start: z.boolean(),
    clean_on_finish: z.boolean(),
  }).optional(),
  observability: z.object({
    trace_level: z.string(),
    ledger_path: z.string(),
    record_inputs: z.boolean(),
    record_plan: z.boolean(),
    record_steps: z.boolean(),
    record_outputs: z.boolean(),
    record_validation: z.boolean(),
  }).optional(),
}).strict();

const REGISTRY_EXECUTE_TOOL_OUTPUT = z.object({
  status: z.string(),
  connector_safe: z.boolean(),
  dispatch_enabled: z.boolean(),
  execution_enabled: z.boolean(),
  simulated_execution: z.boolean(),
  registry_id: z.string(),
  tool: z.string(),
  operation: z.string(),
  found: z.boolean(),
  enabled: z.boolean(),
  allowed: z.boolean(),
  plan_ready: z.boolean(),
  reason: z.string().nullable().optional(),
  steps_count: z.number(),
  simulated_steps: z.array(z.object({
    order: z.number(),
    action: z.string(),
    status: z.string(),
    simulated: z.boolean(),
  }).strict()),
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
    plan_ready: true,
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

function executeDecision(registry, toolName, operation) {
  const plan = planDecision(registry, toolName, operation);

  if (plan.status !== "plan_ready") {
    return {
      status: plan.status,
      connector_safe: true,
      dispatch_enabled: false,
      execution_enabled: false,
      simulated_execution: true,
      registry_id: registry.registry_id,
      tool: toolName,
      operation,
      found: plan.found === true,
      enabled: plan.enabled === true,
      allowed: plan.allowed === true,
      plan_ready: false,
      reason: plan.reason || null,
      steps_count: 0,
      simulated_steps: [],
    };
  }

  const simulatedSteps = plan.steps.map((step) => ({
    order: step.order,
    action: step.action,
    status: step.status === "complete" ? "simulated_complete" : "simulated_planned",
    simulated: true,
  }));

  return {
    status: "simulated",
    connector_safe: true,
    dispatch_enabled: false,
    execution_enabled: false,
    simulated_execution: true,
    registry_id: registry.registry_id,
    tool: toolName,
    operation,
    found: true,
    enabled: true,
    allowed: true,
    plan_ready: true,
    reason: null,
    steps_count: simulatedSteps.length,
    simulated_steps: simulatedSteps,
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
    outputSchema: REGISTRY_GET_TOOL_OUTPUT,
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
        found: false,
      };
    }

    return {
      status: "ok",
      connector_safe: true,
      dispatch_enabled: false,
      version: status.version,
      registry_id: status.registry_id,
      tool: found.tool,
      found: true,
      enabled: found.enabled,
      description: found.description,
      provider: found.provider,
      base_model: found.base_model,
      adapter: found.adapter,
      dsl_schema: found.dsl_schema,
      output_schema: found.output_schema,
      max_internal_steps: found.max_internal_steps,
      max_questions_to_dyrygent: found.max_questions_to_dyrygent,
      budget_tokens: found.budget_tokens,
    };
  });

  registerSafeTool(server, "tool_registry_validate_tool", {
    title: "Validate registered tool availability",
    description: "Validate whether one registered tool is known, enabled, and allowed for read-only registry access. Does not dispatch or execute the tool.",
    inputSchema: z.object({
      tool: TOOL_NAME_SCHEMA,
    }).strict(),
    outputSchema: REGISTRY_VALIDATE_TOOL_OUTPUT,
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
    outputSchema: REGISTRY_POLICY_TOOL_OUTPUT,
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
    outputSchema: REGISTRY_PREFLIGHT_TOOL_OUTPUT,
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

    registerSafeTool(server, "tool_registry_execute", {
    title: "Registry operation execute (dry-run simulation)",
    description: "Simulate execution of a registry operation without dispatch or side effects.",
    inputSchema: z.object({
      tool: TOOL_NAME_SCHEMA,
      operation: OPERATION_SCHEMA,
    }).strict(),
    outputSchema: REGISTRY_EXECUTE_TOOL_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ tool, operation }) => {
    const registry = await loadRegistry({ force: true });
    const result = executeDecision(registry, tool, operation);

    await audit("tool_registry_execute", {
      source: "registry_tools_execute",
      event: "tool_registry_execute",
      registry_id: registry.registry_id,
      tool,
      operation,
      allowed: result.allowed,
      plan_ready: result.plan_ready,
      simulated_execution: true,
    });

    return result;
  });

registerSafeTool(server, "tool_registry_plan", {
    title: "Registry operation plan",
    description: "Return a deterministic plan for an allowed registry operation. Does not dispatch or execute the tool.",
    inputSchema: z.object({
      tool: TOOL_NAME_SCHEMA,
      operation: OPERATION_SCHEMA,
    }).strict(),
    outputSchema: REGISTRY_PLAN_TOOL_OUTPUT,
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
