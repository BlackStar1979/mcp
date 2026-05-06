import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { buildWorkRoots, PRIMARY_WORK_ROOT_ALIAS } from "../core/config.js";
import { safePath, toRel, assertWritablePath, resolveWorkspacePath, describeWorkspaceFullPath } from "../core/paths.js";
import { evaluatePolicyRisk, enforcePolicyDecision } from "../core/policy/engine.js";

const multiRoots = buildWorkRoots({
  extraRootsEnv: 'portfolio=C:\\Portfolio;thesis=C:\\Users\\mczyz\\Documents\\Praca licencjacka',
});

test("safePath stays inside the primary C:\\Work workspace root", () => {
  assert.equal(toRel(safePath(".")), ".");
  assert.equal(toRel(safePath("mcp/server_tools.js")), "mcp/server_tools.js");
  assert.throws(() => safePath("../outside.txt"), /Access denied/);
});

test("secondary roots use explicit @alias addressing", () => {
  assert.equal(
    safePath("@portfolio", { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS }),
    path.resolve("C:\\Portfolio")
  );
  assert.equal(
    safePath("@thesis/chapters", { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS }),
    path.resolve("C:\\Users\\mczyz\\Documents\\Praca licencjacka\\chapters")
  );
  assert.equal(
    toRel(path.resolve("C:\\Portfolio\\notes\\plan.md"), { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS }),
    "@portfolio/notes/plan.md"
  );
  assert.throws(
    () => safePath("@missing/file.txt", { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS }),
    /Unknown workspace root alias/
  );
});

test("workspace path resolution keeps bare paths on primary root and aliases on secondary roots", () => {
  const primary = resolveWorkspacePath("romionsim/docs", { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS });
  assert.equal(primary.rootAlias, "work");
  assert.equal(primary.rootRelativePath, "romionsim/docs");
  assert.equal(primary.displayPath, "romionsim/docs");

  const secondary = resolveWorkspacePath("@portfolio/assets", { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS });
  assert.equal(secondary.rootAlias, "portfolio");
  assert.equal(secondary.rootRelativePath, "assets");
  assert.equal(secondary.displayPath, "@portfolio/assets");

  const described = describeWorkspaceFullPath(path.resolve("C:\\Portfolio\\assets\\logo.svg"), { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS });
  assert.equal(described.displayPath, "@portfolio/assets/logo.svg");
  assert.equal(described.isPrimary, false);
});

test("write guard blocks runtime core and protected entrypoints under mcp/ but allows secondary-root files", () => {
  assert.throws(() => assertWritablePath("mcp/core/config.js"), /Blocked path: mcp\/core/);
  assert.throws(() => assertWritablePath("mcp/server_tools.js"), /Protected file: mcp\/server_tools\.js/);
  assert.equal(assertWritablePath("mcp/.mcp_warzone/tmp.txt"), "mcp/.mcp_warzone/tmp.txt");
  assert.equal(
    assertWritablePath("@portfolio/notes/todo.txt", { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS }),
    "@portfolio/notes/todo.txt"
  );
});

test("policy denies high-risk core patch without dry-run", () => {
  const policy = evaluatePolicyRisk({
    operation: "code_apply_patch",
    target: "mcp/core/config.js",
    delta_bytes: 100,
    intent: "change_behavior",
    has_dry_run: false,
  });

  assert.equal(policy.decision, "deny");
  assert.throws(() => enforcePolicyDecision(policy, { confirm: true }), /policy_denied/);
});

test("policy requires confirmation for high-risk patch with dry-run binding", () => {
  const policy = evaluatePolicyRisk({
    operation: "code_apply_patch",
    target: "mcp/core/config.js",
    delta_bytes: 100,
    intent: "change_behavior",
    has_dry_run: true,
  });

  assert.equal(policy.decision, "require_confirmation");
  assert.throws(() => enforcePolicyDecision(policy, { confirm: false }), /policy_confirmation_required/);
  assert.doesNotThrow(() => enforcePolicyDecision(policy, { confirm: true }));
});
