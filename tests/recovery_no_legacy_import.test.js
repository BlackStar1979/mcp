import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const serverTools = await fs.readFile("server_tools.js", "utf8");
const recoveryRollback = await fs.readFile("core/recovery_rollback.js", "utf8");

test("server_tools startup recovery does not import legacy code_tools.js", () => {
  assert.doesNotMatch(
    serverTools,
    /from\s+["']\.\/core\/code_tools\.js["']/,
    "server_tools.js must not import rollback recovery from legacy core/code_tools.js"
  );

  assert.match(
    serverTools,
    /from\s+["']\.\/core\/recovery_rollback\.js["']/,
    "server_tools.js must import rollback recovery from core/recovery_rollback.js"
  );
});

test("neutral recovery rollback module has no legacy or registry dispatch imports", () => {
  assert.doesNotMatch(recoveryRollback, /code_tools\.js/);
  assert.doesNotMatch(recoveryRollback, /registry\/dispatch\.js/);
  assert.doesNotMatch(recoveryRollback, /policy\/engine\.js/);
});
