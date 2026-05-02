import { z } from "zod";

import { registerSafeTool } from "./responses.js";
import { audit } from "./audit.js";
import { registryStatus } from "./registry/registry.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

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

const TOOL_NAME_SCHEMA = z.string().min(1).max(80).regex(/^[A-Za-z0-9_.-]+$/);

export function registerRegistryTools(server) {
  registerSafeTool(server, "tool_registry_status", {
    title: "Tool registry status",
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
}
