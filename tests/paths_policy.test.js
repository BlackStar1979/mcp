import test from "node:test";
import assert from "node:assert/strict";

import { safePath, toRel, assertWritablePath } from "../core/paths.js";
import { evaluatePolicyRisk, enforcePolicyDecision } from "../core/policy/engine.js";

test("safePath stays inside C:\\Work workspace root", () => {
  assert.equal(toRel(safePath(".")), ".");
  assert.equal(toRel(safePath("mcp/server_tools.js")), "mcp/server_tools.js");
  assert.throws(() => safePath("../outside.txt"), /Access denied/);
});

test("write guard blocks runtime core and protected entrypoints under mcp/", () => {
  assert.throws(() => assertWritablePath("mcp/core/config.js"), /Blocked path: mcp\/core/);
  assert.throws(() => assertWritablePath("mcp/server_tools.js"), /Protected file: mcp\/server_tools\.js/);
  assert.equal(assertWritablePath("mcp/.mcp_warzone/tmp.txt"), "mcp/.mcp_warzone/tmp.txt");
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
