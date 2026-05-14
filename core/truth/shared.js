import fs from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { RUNTIME_DIR } from "../config.js";

export const READ_ONLY_LOCAL = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const PROJECT_TRUTH_AUDIT_OUTPUT = z.object({
  status: z.string(),
  audit_version: z.string(),
  repo_root: z.string(),
  runtime_truth: z.object({
    server_profiles: z.array(z.string()),
    active_groups: z.array(z.string()),
  }).strict(),
  docs_truth: z.object({
    current_state_matches_runtime: z.boolean(),
    runtime_contracts_matches_runtime: z.boolean(),
    docs_catalog_tracks_canonical_runtime_docs: z.boolean(),
  }).strict(),
  test_truth: z.object({
    contract_surface_covers_web_tools: z.boolean(),
    contract_surface_covers_process_tools: z.boolean(),
    contract_surface_covers_remote_site_tools: z.boolean(),
    registry_execute_reads_runtime_source: z.boolean(),
    registry_outputschema_covers_execute: z.boolean(),
  }).strict(),
  deploy_truth: z.object({
    deploy_prepare_execute_present: z.boolean(),
    rollback_script_present: z.boolean(),
  }).strict(),
  drifts: z.array(z.object({
    area: z.string(),
    issue: z.string(),
    severity: z.enum(["info", "warn"]),
  }).strict()),
}).strict();

export const CODE_RUNTIME_MAP_OUTPUT = z.object({
  status: z.string(),
  map_version: z.string(),
  repo_root: z.string(),
  entrypoints: z.array(z.object({
    file: z.string(),
    role: z.string(),
    port: z.number().optional(),
  }).strict()),
  server_tools_runtime: z.object({
    active_modules: z.array(z.object({
      file: z.string(),
      register: z.string(),
      category: z.string(),
    }).strict()),
    active_groups: z.array(z.string()),
  }).strict(),
  protected_boundaries: z.object({
    protected_files: z.array(z.string()),
    blocked_top_level_dirs: z.array(z.string()),
    skipped_scan_dirs: z.array(z.string()),
  }).strict(),
  legacy_and_staging: z.object({
    legacy_files: z.array(z.string()),
    staging_dirs: z.array(z.string()),
  }).strict(),
  test_runtime_links: z.array(z.object({
    test_file: z.string(),
    covers: z.array(z.string()),
    kind: z.string(),
  }).strict()),
}).strict();

export const DEPLOY_DECISION_GUARD_OUTPUT = z.object({
  status: z.string(),
  guard_version: z.string(),
  classification: z.enum(["repo_only", "test_only", "runtime", "runtime_with_client_refresh"]),
  changed_paths: z.array(z.string()),
  requires_manifest: z.boolean(),
  requires_prepare_execute: z.boolean(),
  requires_restart_mcp: z.boolean(),
  requires_client_refresh: z.boolean(),
  workflow: z.array(z.string()),
  reasons: z.array(z.string()),
}).strict();

export const CHANGE_WORKFLOW_SIMULATOR_OUTPUT = z.object({
  status: z.string(),
  simulator_version: z.string(),
  classification: z.enum(["repo_only", "test_only", "runtime", "runtime_with_client_refresh"]),
  changed_paths: z.array(z.string()),
  summary: z.string(),
  operator_actions: z.array(z.string()),
  validation_steps: z.array(z.string()),
  deployment_steps: z.array(z.string()),
  post_steps: z.array(z.string()),
  requires_manifest: z.boolean(),
  requires_prepare_execute: z.boolean(),
  requires_restart_mcp: z.boolean(),
  requires_client_refresh: z.boolean(),
  reasons: z.array(z.string()),
}).strict();

export const TOOL_USAGE_SNAPSHOT_OUTPUT = z.object({
  status: z.string(),
  snapshot_version: z.string(),
  source_log: z.string(),
  total_tool_invocations: z.number(),
  unique_tool_count: z.number(),
  time_window: z.object({
    first_ts: z.string().nullable(),
    last_ts: z.string().nullable(),
  }).strict(),
  top_tools: z.array(z.object({
    name: z.string(),
    count: z.number(),
  }).strict()),
  family_counts: z.object({
    truth_tools: z.number(),
    process_tools: z.number(),
    registry_tools: z.number(),
    web_tools: z.number(),
    other_tools: z.number(),
  }).strict(),
  web_tool_counts: z.array(z.object({
    name: z.string(),
    count: z.number(),
  }).strict()),
  notes: z.array(z.string()),
}).strict();

export const RUNTIME_GROUPS = [
  "index tools",
  "filesystem tools",
  "science tools",
  "connector-safe code tools",
  "connector-safe registry tools",
  "web tools",
  "truth tools",
  "process tools",
  "remote site tools",
];

export async function readLocal(relativePath) {
  const segments = String(relativePath || "")
    .split(/[\\/]+/)
    .filter(Boolean);
  return fs.readFile(path.join(RUNTIME_DIR, ...segments), "utf8");
}

export function hasBulletBlock(text, heading, bullets) {
  const headingIndex = text.indexOf(heading);
  if (headingIndex < 0) return false;
  const window = text.slice(headingIndex, headingIndex + 1200);
  return bullets.every((bullet) => window.includes(`- ${bullet}`));
}

export function drift(area, issue, severity = "warn") {
  return { area, issue, severity };
}

export function normalizePathValue(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
}

export { RUNTIME_DIR };
