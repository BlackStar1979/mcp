import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const BASE = path.resolve("C:\\Work");
const REGISTRY_PATH = path.join(BASE, "_mcp_next/registry/tool_registry.json");
const SCHEMA_PATH = path.join(BASE, "_mcp_next/registry/tool_registry.schema.json");

function assert(cond, msg){
  if(!cond) throw new Error(msg);
}

function isPlainObject(value){
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafeRelativePath(value){
  if(typeof value !== "string" || value.length < 1) return false;
  if(/^[A-Za-z]:/.test(value)) return false;
  if(value.startsWith("/") || value.startsWith("\\\\")) return false;
  const normalized = value.replaceAll("\\", "/");
  return !normalized.split("/").includes("..");
}

function assertNoExtraKeys(obj, allowed, where){
  for(const key of Object.keys(obj)){
    assert(allowed.includes(key), `${where}: unexpected key ${key}`);
  }
}

function assertRequired(obj, required, where){
  for(const key of required){
    assert(Object.prototype.hasOwnProperty.call(obj, key), `${where}: missing ${key}`);
  }
}

function assertBool(value, where){
  assert(typeof value === "boolean", `${where}: expected boolean`);
}

function assertIntRange(value, min, max, where){
  assert(Number.isInteger(value), `${where}: expected integer`);
  assert(value >= min && value <= max, `${where}: out of range ${min}..${max}`);
}

function assertPath(value, prefix, where){
  assert(isSafeRelativePath(value), `${where}: unsafe relative path`);
  assert(value.replaceAll("\\", "/").startsWith(prefix), `${where}: outside ${prefix}`);
}

export async function loadRegistry(registryPath = REGISTRY_PATH){
  const raw = await fs.readFile(registryPath, "utf8");
  return JSON.parse(raw);
}

export async function loadSchema(schemaPath = SCHEMA_PATH){
  const raw = await fs.readFile(schemaPath, "utf8");
  return JSON.parse(raw);
}

export function validateRegistry(reg){
  assert(isPlainObject(reg), "registry: expected object");
  assertNoExtraKeys(reg, ["version", "registry_id", "tools"], "registry");
  assertRequired(reg, ["version", "registry_id", "tools"], "registry");
  assert(/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(reg.version), "registry.version invalid");
  assert(/^[a-z0-9][a-z0-9_.-]*$/.test(reg.registry_id), "registry.registry_id invalid");
  assert(Array.isArray(reg.tools) && reg.tools.length > 0, "registry.tools empty");

  const names = new Set();

  for(const t of reg.tools){
    const where = `tool[${t?.tool || "?"}]`;
    assert(isPlainObject(t), `${where}: expected object`);
    assertNoExtraKeys(t, [
      "tool", "enabled", "description", "runtime", "dsl_schema", "output_schema", "rag",
      "sandbox", "limits", "policy", "observability", "rollback"
    ], where);
    assertRequired(t, [
      "tool", "enabled", "description", "runtime", "dsl_schema", "output_schema", "rag",
      "sandbox", "limits", "policy", "observability", "rollback"
    ], where);

    assert(/^[a-z0-9][a-z0-9_.-]{1,127}$/.test(t.tool), `${where}: invalid tool name`);
    assert(!names.has(t.tool), `${where}: duplicate tool`);
    names.add(t.tool);
    assertBool(t.enabled, `${where}.enabled`);
    assert(typeof t.description === "string" && t.description.length > 0 && t.description.length <= 512, `${where}.description invalid`);

    assertRequired(t.runtime, ["provider", "base_model", "adapter", "adapter_required"], `${where}.runtime`);
    assert(["vllm", "local", "external"].includes(t.runtime.provider), `${where}.runtime.provider invalid`);
    assert(typeof t.runtime.base_model === "string" && t.runtime.base_model.length > 0, `${where}.runtime.base_model missing`);
    assertBool(t.runtime.adapter_required, `${where}.runtime.adapter_required`);
    if(t.runtime.adapter_required) assert(typeof t.runtime.adapter === "string" && t.runtime.adapter.length > 0, `${where}.runtime.adapter required`);

    assert(isSafeRelativePath(t.dsl_schema), `${where}.dsl_schema unsafe`);
    assert(isSafeRelativePath(t.output_schema), `${where}.output_schema unsafe`);

    assertPath(t.rag.index_path, ".mcp_tool_memory/", `${where}.rag.index_path`);
    assertBool(t.rag.writable, `${where}.rag.writable`);
    assertIntRange(t.rag.top_k, 0, 50, `${where}.rag.top_k`);
    assertIntRange(t.rag.max_context_chars, 0, 200000, `${where}.rag.max_context_chars`);

    assertPath(t.sandbox.path, ".mcp_sandbox/", `${where}.sandbox.path`);
    assertBool(t.sandbox.read_write, `${where}.sandbox.read_write`);
    assertBool(t.sandbox.project_readonly, `${where}.sandbox.project_readonly`);
    assert(t.sandbox.project_readonly === true, `${where}.sandbox.project_readonly must be true`);
    assertIntRange(t.sandbox.ttl_seconds, 60, 86400, `${where}.sandbox.ttl_seconds`);
    assertIntRange(t.sandbox.quota_mb, 10, 10240, `${where}.sandbox.quota_mb`);

    assertIntRange(t.limits.max_internal_steps, 1, 5, `${where}.limits.max_internal_steps`);
    assertIntRange(t.limits.max_questions_to_dyrygent, 0, 2, `${where}.limits.max_questions_to_dyrygent`);
    assertIntRange(t.limits.budget_tokens, 1000, 200000, `${where}.limits.budget_tokens`);
    assertIntRange(t.limits.timeout_ms, 1000, 1800000, `${where}.limits.timeout_ms`);

    assertBool(t.policy.allow_network, `${where}.policy.allow_network`);
    assertBool(t.policy.allow_project_write, `${where}.policy.allow_project_write`);
    assertBool(t.policy.requires_dry_run, `${where}.policy.requires_dry_run`);
    assertBool(t.policy.requires_validation, `${where}.policy.requires_validation`);
    assertBool(t.policy.requires_audit, `${where}.policy.requires_audit`);
    assert(Array.isArray(t.policy.allowed_operations), `${where}.policy.allowed_operations must be array`);
    if(t.policy.allow_project_write){
      assert(t.policy.requires_dry_run === true, `${where}: project write requires dry_run`);
      assert(t.policy.requires_validation === true, `${where}: project write requires validation`);
      assert(t.rollback.strategy !== "none", `${where}: project write requires rollback strategy`);
    }
    assert(t.policy.requires_audit === true, `${where}: audit required`);

    assert(["minimal", "standard", "full"].includes(t.observability.trace_level), `${where}.observability.trace_level invalid`);
    assertPath(t.observability.ledger_path, ".mcp_audit/", `${where}.observability.ledger_path`);

    assert(["none", "backup", "patch_inverse", "snapshot"].includes(t.rollback.strategy), `${where}.rollback.strategy invalid`);
    assertBool(t.rollback.checkpoint_required, `${where}.rollback.checkpoint_required`);
  }

  return true;
}

export async function validateAndExit(){
  await loadSchema();
  const reg = await loadRegistry();
  validateRegistry(reg);
  console.log("TOOL REGISTRY VALID");
}

const thisFile = fileURLToPath(import.meta.url);
if(process.argv[1] && path.resolve(process.argv[1]) === thisFile){
  validateAndExit().catch(err => {
    console.error("TOOL REGISTRY INVALID");
    console.error(err?.message || String(err));
    process.exit(1);
  });
}
