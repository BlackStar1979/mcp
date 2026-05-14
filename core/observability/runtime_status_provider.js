import fs from "node:fs/promises";
import path from "node:path";

function nowIso() {
  return new Date().toISOString();
}

async function canWritePath(filePath) {
  try {
    await fs.access(filePath);
    await fs.access(filePath, fs.constants.W_OK);
    return true;
  } catch (error) {
    if (error?.code !== "ENOENT") return false;
  }

  try {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.access(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeModuleState(modules = {}) {
  const enabled = Array.isArray(modules.enabled_ids) ? modules.enabled_ids : [];
  const disabled = Array.isArray(modules.disabled_ids) ? modules.disabled_ids : [];
  const degraded = Array.isArray(modules.degraded_ids) ? modules.degraded_ids : [];

  return {
    enabled_ids: enabled,
    disabled_ids: disabled,
    degraded_ids: degraded,
  };
}

function buildHealth({ warnings, modules }) {
  if (!Array.isArray(warnings) || !warnings.length) {
    return { level: "ok", warnings: [] };
  }

  const hasDegradedModule = Array.isArray(modules.degraded_ids) && modules.degraded_ids.length > 0;
  return {
    level: hasDegradedModule ? "degraded" : "warn",
    warnings,
  };
}

export async function buildRuntimeStatus({
  runtime,
  network,
  modules,
  paths,
  generatedAt = nowIso(),
} = {}) {
  const safeRuntime = {
    name: String(runtime?.name || "unknown"),
    version: String(runtime?.version || "unknown"),
    profile: String(runtime?.profile || "unknown"),
    auth_mode: runtime?.auth_mode ? String(runtime.auth_mode) : null,
  };

  const safeNetwork = {
    host: String(network?.host || "127.0.0.1"),
    port: Number(network?.port || 0),
    public_endpoint_hint: String(network?.public_endpoint_hint || ""),
  };

  const safeModules = normalizeModuleState(modules);

  const auditWritable = await canWritePath(String(paths?.audit_log_file || ""));
  const perfWritable = await canWritePath(String(paths?.perf_log_file || ""));

  const warnings = [];
  if (!auditWritable) warnings.push("audit_log_not_writable");
  if (!perfWritable) warnings.push("perf_log_not_writable");

  const health = buildHealth({ warnings, modules: safeModules });

  return {
    status: health.level === "degraded" ? "degraded" : "ok",
    generated_at: generatedAt,
    runtime: safeRuntime,
    process: {
      pid: process.pid,
      uptime_s: Math.floor(process.uptime()),
    },
    network: safeNetwork,
    modules: safeModules,
    observability: {
      audit_writable: auditWritable,
      perf_writable: perfWritable,
    },
    health,
  };
}
