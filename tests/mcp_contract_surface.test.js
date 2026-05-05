import assert from "node:assert/strict";
import test from "node:test";

import { registerIndexTools } from "../core/tools_index.js";
import { registerFsTools } from "../core/tools_fs.js";
import { registerScienceTools } from "../core/science_tools.js";
import { registerCodeTools } from "../core/code_tools_safe.js";
import { registerRegistryTools } from "../core/registry_tools_safe.js";
import { registerWebTools } from "../core/web_tools.js";
import { registerTruthTools } from "../core/truth_tools.js";

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
});

test("read-only descriptor semantics are internally consistent", () => {
  const tools = collectRegisteredTools();

  for (const { name, config } of tools) {
    if (config.annotations.readOnlyHint === true) {
      assert.equal(config.annotations.destructiveHint, false, `${name}: read-only tool cannot be destructive`);
    }
  }
});

test("outputSchema coverage is tracked without blocking current partial conformance", () => {
  const tools = collectRegisteredTools();
  const withoutOutputSchema = tools
    .filter(({ config }) => !config.outputSchema)
    .map(({ name }) => name)
    .sort();

  assert.ok(withoutOutputSchema.length > 0, "current audit expects partial outputSchema coverage; update this test when full coverage lands");
  assert.ok(withoutOutputSchema.length < tools.length, "at least some tools should expose outputSchema");
});
