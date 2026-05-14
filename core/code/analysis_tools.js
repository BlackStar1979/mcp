import { z } from "zod";

import { registerSafeTool } from "../responses.js";
import { audit } from "../audit.js";
import {
  CODE_AUDIT_OUTPUT,
  CODE_DEPENDENCIES_OUTPUT,
  CODE_IMPACT_OUTPUT,
  READ_ONLY,
  auditGraph,
  buildDependencyGraph,
  impactGraph,
} from "./shared_runtime.js";

export function registerCodeAnalysisTools(server) {
  registerSafeTool(server, "code_dependencies", {
    title: "Build code dependency graph",
    description: "Build bounded import dependency graph for JS/TS/Python files without executing user code.",
    inputSchema: z.object({ path: z.string(), recursive: z.boolean().default(true), max_files: z.number().int().min(1).max(5000).default(500) }),
    outputSchema: CODE_DEPENDENCIES_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ path: requestedPath, recursive, max_files }) => {
    const graph = await buildDependencyGraph(requestedPath, recursive, max_files);
    await audit("code_dependencies", {
      path: graph.path,
      recursive: graph.recursive,
      max_files: graph.max_files,
      nodes: graph.nodes_count,
      edges: graph.edges_count,
      unresolved: graph.unresolved_count,
      truncated: graph.truncated,
    });
    return graph;
  });

  registerSafeTool(server, "code_audit", {
    title: "Audit code dependency graph",
    description: "Summarize dependency graph structure: fan-in/fan-out and unresolved local imports.",
    inputSchema: z.object({ path: z.string(), recursive: z.boolean().default(true), max_files: z.number().int().min(1).max(5000).default(500), top_n: z.number().int().min(1).max(100).default(20) }),
    outputSchema: CODE_AUDIT_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ path: requestedPath, recursive, max_files, top_n }) => {
    const graph = await buildDependencyGraph(requestedPath, recursive, max_files);
    await audit("code_audit", {
      path: graph.path,
      recursive: graph.recursive,
      max_files: graph.max_files,
      nodes: graph.nodes_count,
      edges: graph.edges_count,
      unresolved: graph.unresolved_count,
    });
    return { path: graph.path, recursive: graph.recursive, max_files: graph.max_files, ...auditGraph(graph, top_n) };
  });

  registerSafeTool(server, "code_impact", {
    title: "Analyze code dependency impact",
    description: "Trace dependents and dependencies for one file inside a bounded JS/TS/Python import graph.",
    inputSchema: z.object({ path: z.string(), target: z.string(), recursive: z.boolean().default(true), max_files: z.number().int().min(1).max(5000).default(500), max_depth: z.number().int().min(1).max(20).default(5), direction: z.enum(["both", "dependents", "dependencies"]).default("both") }),
    outputSchema: CODE_IMPACT_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ path: requestedPath, target, recursive, max_files, max_depth, direction }) => {
    const graph = await buildDependencyGraph(requestedPath, recursive, max_files);
    const result = { scope: graph.path, direction, max_depth, graph: { nodes: graph.nodes_count, edges: graph.edges_count, truncated: graph.truncated }, ...impactGraph(graph, target, direction, max_depth) };
    await audit("code_impact", {
      scope: graph.path,
      target,
      direction,
      max_depth,
      affected_count: result.affected_count,
      dependencies_count: result.dependencies_count,
    });
    return result;
  });
}

