import assert from "node:assert/strict";
import test from "node:test";

import { registerIndexTools } from "../core/tools_index.js";
import { registerFsTools } from "../core/tools_fs.js";
import { registerScienceTools } from "../core/science_tools.js";
import { registerCodeTools } from "../core/code_tools_safe.js";
import { registerRegistryTools } from "../core/registry_tools_safe.js";
import { registerWebTools } from "../core/web_tools.js";
import { registerTruthTools } from "../core/truth_tools.js";
import { registerProcessTools } from "../core/process_tools_safe.js";
import { registerRemoteSiteTools } from "../core/remote_site_tools.js";

function collectRegisteredTools() {
  const tools = [];
  const seen = new Set();
  const server = {
    registerTool(name, config, handler) {
      assert.equal(typeof name, "string", "tool name must be a string");
      assert.ok(name.trim(), "tool name must not be empty");
      assert.equal(typeof handler, "function", `${name}: handler must be a function`);
      assert.ok(!seen.has(name), `duplicate tool registration: ${name}`);
      seen.add(name);
      tools.push({ name, config, handler });
    },
  };

  registerIndexTools(server);
  registerFsTools(server);
  registerScienceTools(server);
  registerCodeTools(server);
  registerRegistryTools(server);
  registerWebTools(server);
  registerTruthTools(server);
  registerProcessTools(server);
  registerRemoteSiteTools(server);

  return tools;
}

function assertBooleanAnnotation(config, name, key) {
  assert.ok(config.annotations, `${name}: missing annotations`);
  assert.equal(typeof config.annotations[key], "boolean", `${name}: annotations.${key} must be boolean`);
}

test("all server_tools exposed tools have minimum MCP descriptors", () => {
  const tools = collectRegisteredTools();
  assert.ok(tools.length >= 20, `expected broad tool surface, got ${tools.length}`);

  for (const { name, config } of tools) {
    assert.ok(config && typeof config === "object", `${name}: config must be object`);
    assert.equal(typeof config.title, "string", `${name}: title must be a string`);
    assert.ok(config.title.trim(), `${name}: title must not be empty`);
    assert.equal(typeof config.description, "string", `${name}: description must be a string`);
    assert.ok(config.description.trim(), `${name}: description must not be empty`);
    assert.ok(config.inputSchema, `${name}: missing inputSchema`);

    assertBooleanAnnotation(config, name, "readOnlyHint");
    assertBooleanAnnotation(config, name, "destructiveHint");
    assertBooleanAnnotation(config, name, "openWorldHint");
  }
});

test("contract surface includes web tools registered by server_tools", () => {
  const names = collectRegisteredTools().map(({ name }) => name).sort();

  assert.ok(names.includes("http_get"), "contract surface must include active web tool: http_get");
  assert.ok(names.includes("pypi_info"), "contract surface must include active web tool: pypi_info");
  assert.ok(names.includes("check_pypi_package"), "contract surface must include active web tool: check_pypi_package");
  assert.ok(names.includes("check_npm_package"), "contract surface must include active web tool: check_npm_package");
  assert.ok(names.includes("fetch_github_file"), "contract surface must include active web tool: fetch_github_file");
});

test("contract surface includes project truth audit tool", () => {
  const names = collectRegisteredTools().map(({ name }) => name).sort();

  assert.ok(names.includes("project_truth_audit"), "contract surface must include project_truth_audit");
  assert.ok(names.includes("code_runtime_map"), "contract surface must include code_runtime_map");
  assert.ok(names.includes("deploy_decision_guard"), "contract surface must include deploy_decision_guard");
  assert.ok(names.includes("change_workflow_simulator"), "contract surface must include change_workflow_simulator");
  assert.ok(names.includes("tool_usage_snapshot"), "contract surface must include tool_usage_snapshot");
});

test("contract surface includes process tools", () => {
  const names = collectRegisteredTools().map(({ name }) => name).sort();

  assert.ok(names.includes("run_process"), "contract surface must include run_process");
  assert.ok(names.includes("process_runner_status"), "contract surface must include process_runner_status");
});

test("index and science descriptors expose outputSchema", () => {
  const byName = new Map(collectRegisteredTools().map((tool) => [tool.name, tool]));

  for (const name of [
    "index_status",
    "build_index",
    "search_index",
    "search_index_context",
    "collect_context",
    "collect_romionsim_context",
    "inventory_tree",
    "fits_info",
    "hdf5_info",
    "table_profile",
  ]) {
    assert.ok(byName.has(name), `expected tool to be registered: ${name}`);
    assert.equal(typeof byName.get(name).config.outputSchema, "object", `${name}: missing outputSchema`);
  }
});

test("code descriptors expose outputSchema", () => {
  const byName = new Map(collectRegisteredTools().map((tool) => [tool.name, tool]));

  for (const name of [
    "code_symbols",
    "code_dependencies",
    "code_audit",
    "code_impact",
  ]) {
    assert.ok(byName.has(name), `expected tool to be registered: ${name}`);
    assert.equal(typeof byName.get(name).config.outputSchema, "object", `${name}: missing outputSchema`);
  }
});

test("filesystem read/info descriptors expose outputSchema", () => {
  const byName = new Map(collectRegisteredTools().map((tool) => [tool.name, tool]));

  for (const name of [
    "get_info",
    "list_directory",
    "read_file",
    "read_file_lines",
    "read_file_chunk",
  ]) {
    assert.ok(byName.has(name), `expected tool to be registered: ${name}`);
    assert.equal(typeof byName.get(name).config.outputSchema, "object", `${name}: missing outputSchema`);
  }
});

test("filesystem mutation descriptors expose outputSchema", () => {
  const byName = new Map(collectRegisteredTools().map((tool) => [tool.name, tool]));

  for (const name of [
    "write_file",
    "append_file",
    "copy_path",
    "move_path",
    "delete_path",
    "restore_path",
    "edit_file_patch",
  ]) {
    assert.ok(byName.has(name), `expected tool to be registered: ${name}`);
    assert.equal(typeof byName.get(name).config.outputSchema, "object", `${name}: missing outputSchema`);
  }
});

test("contract surface includes remote site tools", () => {
  const names = collectRegisteredTools().map(({ name }) => name).sort();

  assert.ok(names.includes("list_remote_site_files"), "contract surface must include list_remote_site_files");
  assert.ok(names.includes("remote_site_runtime_status"), "contract surface must include remote_site_runtime_status");
  assert.ok(names.includes("preview_remote_site_retention"), "contract surface must include preview_remote_site_retention");
});

test("remote site descriptors expose outputSchema", () => {
  const byName = new Map(collectRegisteredTools().map((tool) => [tool.name, tool]));

  for (const name of [
    "list_remote_site_files",
    "read_remote_site_file",
    "write_remote_site_file",
    "edit_remote_site_file",
    "move_remote_site_file",
    "delete_remote_site_file",
    "restore_remote_site_file",
    "remote_site_runtime_status",
    "preview_remote_site_retention",
  ]) {
    assert.ok(byName.has(name), `expected tool to be registered: ${name}`);
    assert.equal(typeof byName.get(name).config.outputSchema, "object", `${name}: missing outputSchema`);
  }
});

test("read-only descriptor semantics are internally consistent", () => {
  const tools = collectRegisteredTools();

  for (const { name, config } of tools) {
    if (config.annotations.readOnlyHint === true) {
      assert.equal(config.annotations.destructiveHint, false, `${name}: read-only tool cannot be destructive`);
    }
  }
});

test("all active tools now expose outputSchema", () => {
  const tools = collectRegisteredTools();
  const withoutOutputSchema = tools
    .filter(({ config }) => !config.outputSchema)
    .map(({ name }) => name)
    .sort();

  assert.deepEqual(withoutOutputSchema, [], "all active tools should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("index_status"), false, "index_status should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("build_index"), false, "build_index should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("search_index"), false, "search_index should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("search_index_context"), false, "search_index_context should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("collect_context"), false, "collect_context should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("collect_romionsim_context"), false, "collect_romionsim_context should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("inventory_tree"), false, "inventory_tree should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("fits_info"), false, "fits_info should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("hdf5_info"), false, "hdf5_info should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("table_profile"), false, "table_profile should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("code_symbols"), false, "code_symbols should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("code_dependencies"), false, "code_dependencies should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("code_audit"), false, "code_audit should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("code_impact"), false, "code_impact should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("get_info"), false, "get_info should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("list_directory"), false, "list_directory should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("write_file"), false, "write_file should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("append_file"), false, "append_file should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("copy_path"), false, "copy_path should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("move_path"), false, "move_path should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("delete_path"), false, "delete_path should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("restore_path"), false, "restore_path should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("edit_file_patch"), false, "edit_file_patch should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("list_remote_site_files"), false, "list_remote_site_files should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("read_remote_site_file"), false, "read_remote_site_file should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("write_remote_site_file"), false, "write_remote_site_file should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("edit_remote_site_file"), false, "edit_remote_site_file should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("move_remote_site_file"), false, "move_remote_site_file should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("delete_remote_site_file"), false, "delete_remote_site_file should now expose outputSchema");
  assert.equal(withoutOutputSchema.includes("restore_remote_site_file"), false, "restore_remote_site_file should now expose outputSchema");
});




