import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { BASE_DIR, buildWorkRoots, PRIMARY_WORK_ROOT_ALIAS } from "../core/config.js";
import { safePath, toRel, assertWritablePath, resolveWorkspacePath, describeWorkspaceFullPath } from "../core/paths.js";
import { evaluatePolicyRisk, enforcePolicyDecision } from "../core/policy/engine.js";

const PORTFOLIO_ROOT = path.resolve(path.sep, "portfolio-root");
const THESIS_ROOT = path.resolve(path.sep, "thesis-root");

const multiRoots = buildWorkRoots({
  primaryPath: BASE_DIR,
  extraRootsEnv: `portfolio=${PORTFOLIO_ROOT};thesis=${THESIS_ROOT}`,
});

test("safePath stays inside the configured primary workspace root", () => {
  assert.equal(toRel(safePath(".", { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS }), { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS }), ".");
  assert.equal(toRel(safePath("mcp/server_tools.js", { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS }), { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS }), "mcp/server_tools.js");
  assert.throws(() => safePath("../outside.txt", { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS }), /Access denied/);
});

test("secondary roots use explicit @alias addressing", () => {
  assert.equal(
    safePath("@portfolio", { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS }),
    PORTFOLIO_ROOT
  );
  assert.equal(
    safePath("@thesis/chapters", { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS }),
    path.join(THESIS_ROOT, "chapters")
  );
  assert.equal(
    toRel(path.join(PORTFOLIO_ROOT, "notes", "plan.md"), { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS }),
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

  const described = describeWorkspaceFullPath(path.join(PORTFOLIO_ROOT, "assets", "logo.svg"), { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS });
  assert.equal(described.displayPath, "@portfolio/assets/logo.svg");
  assert.equal(described.isPrimary, false);
});

test("write guard blocks runtime core and protected entrypoints under mcp/ but allows secondary-root files", () => {
  assert.throws(() => assertWritablePath("mcp/core/config.js", { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS }), /Blocked path: mcp\/core/);
  assert.throws(() => assertWritablePath("mcp/server_tools.js", { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS }), /Protected file: mcp\/server_tools\.js/);
  assert.equal(assertWritablePath("mcp/.mcp_warzone/tmp.txt", { roots: multiRoots, primaryAlias: PRIMARY_WORK_ROOT_ALIAS }), "mcp/.mcp_warzone/tmp.txt");
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

