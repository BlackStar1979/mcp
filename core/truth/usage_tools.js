import { z } from "zod";

import { registerSafeTool } from "../responses.js";
import { audit } from "../audit.js";
import { READ_ONLY_LOCAL, TOOL_USAGE_SNAPSHOT_OUTPUT, readLocal } from "./shared.js";

async function runToolUsageSnapshot() {
  let perfLog = "";
  let logAvailable = true;
  try {
    perfLog = await readLocal(".mcp_perf.log");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      logAvailable = false;
      perfLog = "";
    } else {
      throw error;
    }
  }

  const lines = perfLog.split(/\r?\n/).filter(Boolean);

  const toolEntries = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry) => entry && entry.type === "tool" && typeof entry.name === "string");

  const counts = new Map();
  const webTools = new Set(["http_get", "pypi_info", "check_pypi_package", "check_npm_package", "fetch_github_file"]);
  const truthTools = new Set(["project_truth_audit", "code_runtime_map", "deploy_decision_guard", "change_workflow_simulator", "tool_usage_snapshot"]);
  const processTools = new Set(["run_process", "process_runner_status"]);
  const registryTools = new Set([
    "tool_registry_status",
    "tool_registry_list",
    "tool_registry_get_tool",
    "tool_registry_validate_tool",
    "tool_registry_policy",
    "tool_registry_preflight",
    "tool_registry_plan",
    "tool_registry_execute",
  ]);

  let truthCount = 0;
  let processCount = 0;
  let registryCount = 0;
  let webCount = 0;
  let otherCount = 0;

  for (const entry of toolEntries) {
    counts.set(entry.name, (counts.get(entry.name) || 0) + 1);

    if (truthTools.has(entry.name)) truthCount += 1;
    else if (processTools.has(entry.name)) processCount += 1;
    else if (registryTools.has(entry.name)) registryCount += 1;
    else if (webTools.has(entry.name)) webCount += 1;
    else otherCount += 1;
  }

  const sortedCounts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));

  const webToolCounts = sortedCounts.filter((item) => webTools.has(item.name));
  const firstTs = toolEntries.length ? String(toolEntries[0].ts || null) : null;
  const lastTs = toolEntries.length ? String(toolEntries[toolEntries.length - 1].ts || null) : null;

  const notes = [];
  if (!logAvailable) {
    notes.push("perf log is not present in this environment; returning an empty observed-usage snapshot");
  }
  if (truthCount > 0) {
    notes.push("truth tools dominate recent observed MCP decision support usage");
  }
  if (webToolCounts.length > 0) {
    notes.push("web/research usage is currently bounded to single-file fetches, registry package metadata, and single allowlisted GET requests");
  }
  if (!sortedCounts.some((item) => item.name === "download_docs")) {
    notes.push("no evidence of demand for a broader docs-downloading tool appears in current MCP tool invocation logs");
  }

  const result = {
    status: "ok",
    snapshot_version: "v1",
    source_log: ".mcp_perf.log",
    total_tool_invocations: toolEntries.length,
    unique_tool_count: sortedCounts.length,
    time_window: {
      first_ts: firstTs,
      last_ts: lastTs,
    },
    top_tools: sortedCounts.slice(0, 10),
    family_counts: {
      truth_tools: truthCount,
      process_tools: processCount,
      registry_tools: registryCount,
      web_tools: webCount,
      other_tools: otherCount,
    },
    web_tool_counts: webToolCounts,
    notes,
  };

  await audit("tool_usage_snapshot", {
    source: "truth_tools_v1",
    event: "tool_usage_snapshot",
    total_tool_invocations: result.total_tool_invocations,
    unique_tool_count: result.unique_tool_count,
    web_tool_count: result.family_counts.web_tools,
  });

  return result;
}

export function registerTruthUsageTools(server) {
  registerSafeTool(
    server,
    "tool_usage_snapshot",
    {
      title: "Tool usage snapshot",
      description: "Summarize observed MCP tool usage from the local perf log to support bounded tool-planning decisions.",
      inputSchema: z.object({}).strict(),
      outputSchema: TOOL_USAGE_SNAPSHOT_OUTPUT,
      annotations: READ_ONLY_LOCAL,
    },
    async () => runToolUsageSnapshot()
  );
}
