import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { validateRegistry } from "./validate_registry.js";

const BASE = path.resolve("C:\\Work");
const REGISTRY_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.join(REGISTRY_ROOT, "tool_registry.json");

let cache = null;

function safeJoinRegistryRoot(relativePath) {
  const normalized = String(relativePath || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || normalized.split("/").includes("..")) {
    throw new Error("unsafe registry relative path: " + relativePath);
  }
  const resolved = path.resolve(REGISTRY_ROOT, normalized);
  if (resolved !== REGISTRY_ROOT && !resolved.startsWith(REGISTRY_ROOT + path.sep)) {
    throw new Error("registry path escape: " + relativePath);
  }
  return resolved;
}

export async function loadRegistry({ force = false } = {}) {
  if (cache && !force) return cache;
  const raw = await fs.readFile(REGISTRY_PATH, "utf8");
  const registry = JSON.parse(raw);
  validateRegistry(registry);
  cache = registry;
  return registry;
}

export async function listTools() {
  const registry = await loadRegistry();
  return registry.tools.map((tool) => ({
    tool: tool.tool,
    enabled: tool.enabled,
    description: tool.description,
    provider: tool.runtime.provider,
    base_model: tool.runtime.base_model,
    adapter: tool.runtime.adapter,
    dsl_schema: tool.dsl_schema,
    output_schema: tool.output_schema,
    max_internal_steps: tool.limits.max_internal_steps,
    max_questions_to_dyrygent: tool.limits.max_questions_to_dyrygent,
    budget_tokens: tool.limits.budget_tokens,
  }));
}

export async function getToolConfig(toolName) {
  const registry = await loadRegistry();
  const tool = registry.tools.find((item) => item.tool === toolName && item.enabled === true);
  if (!tool) throw new Error("tool_not_found_or_disabled: " + toolName);
  return tool;
}

export async function resolveToolRuntime(toolName) {
  const tool = await getToolConfig(toolName);
  const dslSchemaPath = safeJoinRegistryRoot(tool.dsl_schema);
  const outputSchemaPath = safeJoinRegistryRoot(tool.output_schema);

  await fs.access(dslSchemaPath);
  await fs.access(outputSchemaPath);

  return {
    tool: tool.tool,
    runtime: tool.runtime,
    rag: tool.rag,
    sandbox: tool.sandbox,
    limits: tool.limits,
    policy: tool.policy,
    observability: tool.observability,
    rollback: tool.rollback,
    dsl_schema_path: path.relative(BASE, dslSchemaPath).replaceAll("\\", "/"),
    output_schema_path: path.relative(BASE, outputSchemaPath).replaceAll("\\", "/"),
  };
}

export async function registryStatus() {
  const registry = await loadRegistry({ force: true });
  return {
    status: "ok",
    version: registry.version,
    registry_id: registry.registry_id,
    tool_count: registry.tools.length,
    enabled_tool_count: registry.tools.filter((tool) => tool.enabled).length,
    tools: await listTools(),
  };
}
