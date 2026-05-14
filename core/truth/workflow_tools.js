import { z } from "zod";

import { registerSafeTool } from "../responses.js";
import { audit } from "../audit.js";
import {
  CHANGE_WORKFLOW_SIMULATOR_OUTPUT,
  DEPLOY_DECISION_GUARD_OUTPUT,
  READ_ONLY_LOCAL,
  normalizePathValue,
} from "./shared.js";

function inferDeployDecision({ changed_paths = [], descriptor_change = false, schema_change = false, tool_surface_change = false } = {}) {
  const normalizedPaths = changed_paths.map(normalizePathValue).filter(Boolean);

  const touchesDocs = normalizedPaths.some((p) => p.startsWith("docs/"));
  const touchesTests = normalizedPaths.some((p) => p.startsWith("tests/"));
  const touchesRuntime =
    normalizedPaths.some((p) => p === "server.js" || p === "server_tools.js" || p.startsWith("core/"));
  const touchesControlPlane =
    normalizedPaths.some((p) => p === "deploy.ps1" || p === "rollback.ps1" || p === "perf.ps1");

  const effectiveRuntime = touchesRuntime || touchesControlPlane;
  const effectiveClientRefresh = tool_surface_change || descriptor_change || schema_change;

  let classification = "repo_only";
  if (effectiveRuntime && effectiveClientRefresh) classification = "runtime_with_client_refresh";
  else if (effectiveRuntime) classification = "runtime";
  else if (touchesTests && !touchesDocs) classification = "test_only";
  else if (touchesTests && touchesDocs) classification = "repo_only";

  const requiresManifest = effectiveRuntime;
  const requiresPrepareExecute = effectiveRuntime;
  const requiresRestartMcp = effectiveRuntime;
  const requiresClientRefresh = effectiveRuntime && effectiveClientRefresh;

  const reasons = [];
  if (touchesRuntime) reasons.push("active runtime files changed");
  if (touchesControlPlane) reasons.push("control-plane script changed");
  if (touchesTests) reasons.push("test files changed");
  if (touchesDocs) reasons.push("documentation files changed");
  if (descriptor_change) reasons.push("descriptor metadata changed");
  if (schema_change) reasons.push("schema contract changed");
  if (tool_surface_change) reasons.push("tool surface changed");
  if (!reasons.length) reasons.push("no recognized path class; defaulting to repo_only");

  const workflow = effectiveRuntime
    ? [
        "prepare change in .mcp_warzone",
        "validate staged files",
        "create manifest in .mcp_deploy",
        "deploy.ps1 -Mode Prepare",
        "deploy.ps1 -Mode Execute",
        "restart MCP",
        ...(requiresClientRefresh ? ["refresh client connector"] : []),
        "runtime verification",
        "rollback if verification fails",
      ]
    : [
        "edit tracked repo files",
        "run repo validation",
        "update canonical docs if needed",
        "commit",
        "push",
      ];

  return {
    status: "ok",
    guard_version: "v1",
    classification,
    changed_paths: normalizedPaths,
    requires_manifest: requiresManifest,
    requires_prepare_execute: requiresPrepareExecute,
    requires_restart_mcp: requiresRestartMcp,
    requires_client_refresh: requiresClientRefresh,
    workflow,
    reasons,
  };
}

function simulateWorkflow(args = {}) {
  const decision = inferDeployDecision(args);

  const validationSteps = decision.requires_prepare_execute
    ? [
        "prepare change in .mcp_warzone",
        "verify staged files exist",
        "run local validation for staged files",
        "verify manifest path and staged targets match",
      ]
    : [
        "edit tracked repo files directly",
        "run local repo validation",
        "update canonical docs if system description changed",
      ];

  const deploymentSteps = decision.requires_prepare_execute
    ? [
        "create manifest in .mcp_deploy",
        "deploy.ps1 -Mode Prepare",
        "deploy.ps1 -Mode Execute",
      ]
    : ["no deploy pipeline required"];

  const postSteps = decision.requires_prepare_execute
    ? [
        "restart MCP",
        ...(decision.requires_client_refresh ? ["refresh client connector"] : []),
        "invoke changed runtime tools directly",
        "rollback if runtime verification fails",
        "commit",
        "push",
      ]
    : [
        "commit",
        "push",
      ];

  const operatorActions = decision.requires_prepare_execute
    ? [
        "run Prepare",
        "run Execute",
        "restart MCP",
        ...(decision.requires_client_refresh ? ["refresh client connector"] : []),
      ]
    : [];

  const summaryByClass = {
    repo_only: "Repo-only change: validate locally, update docs if needed, then commit and push without deploy, restart, or client refresh.",
    test_only: "Test-only change: validate tests locally, then commit and push without deploy, restart, or client refresh.",
    runtime: "Runtime change: stage in .mcp_warzone, deploy through manifest and Prepare/Execute, restart MCP, then verify runtime directly.",
    runtime_with_client_refresh: "Runtime change with connector-visible impact: deploy through manifest and Prepare/Execute, restart MCP, refresh client connector, then verify runtime directly.",
  };

  return {
    status: "ok",
    simulator_version: "v1",
    classification: decision.classification,
    changed_paths: decision.changed_paths,
    summary: summaryByClass[decision.classification],
    operator_actions: operatorActions,
    validation_steps: validationSteps,
    deployment_steps: deploymentSteps,
    post_steps: postSteps,
    requires_manifest: decision.requires_manifest,
    requires_prepare_execute: decision.requires_prepare_execute,
    requires_restart_mcp: decision.requires_restart_mcp,
    requires_client_refresh: decision.requires_client_refresh,
    reasons: decision.reasons,
  };
}

export function registerTruthWorkflowTools(server) {
  registerSafeTool(
    server,
    "deploy_decision_guard",
    {
      title: "Deploy decision guard",
      description: "Classify a planned change as repo-only, test-only, runtime, or runtime with client refresh, and return the minimal safe workflow.",
      inputSchema: z.object({
        changed_paths: z.array(z.string()).min(1),
        descriptor_change: z.boolean().optional().default(false),
        schema_change: z.boolean().optional().default(false),
        tool_surface_change: z.boolean().optional().default(false),
      }).strict(),
      outputSchema: DEPLOY_DECISION_GUARD_OUTPUT,
      annotations: READ_ONLY_LOCAL,
    },
    async (args) => {
      const result = inferDeployDecision(args || {});
      await audit("deploy_decision_guard", {
        source: "truth_tools_v1",
        event: "deploy_decision_guard",
        classification: result.classification,
        requires_restart_mcp: result.requires_restart_mcp,
        requires_client_refresh: result.requires_client_refresh,
      });
      return result;
    }
  );

  registerSafeTool(
    server,
    "change_workflow_simulator",
    {
      title: "Change workflow simulator",
      description: "Simulate the minimal safe validation, deploy, restart, and client-refresh sequence for a planned change without executing it.",
      inputSchema: z.object({
        changed_paths: z.array(z.string()).min(1),
        descriptor_change: z.boolean().optional().default(false),
        schema_change: z.boolean().optional().default(false),
        tool_surface_change: z.boolean().optional().default(false),
      }).strict(),
      outputSchema: CHANGE_WORKFLOW_SIMULATOR_OUTPUT,
      annotations: READ_ONLY_LOCAL,
    },
    async (args) => {
      const result = simulateWorkflow(args || {});
      await audit("change_workflow_simulator", {
        source: "truth_tools_v1",
        event: "change_workflow_simulator",
        classification: result.classification,
        operator_action_count: result.operator_actions.length,
        requires_restart_mcp: result.requires_restart_mcp,
        requires_client_refresh: result.requires_client_refresh,
      });
      return result;
    }
  );
}
