import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const rollbackScript = fs.readFileSync("rollback.ps1", "utf8");

test("rollback handles files created by deployment", () => {
  assert.match(rollbackScript, /target_sha256_before/);
  assert.match(rollbackScript, /delete_new_file/);
  assert.match(rollbackScript, /already_absent/);
});

test("rollback restores files that existed before deployment", () => {
  assert.match(rollbackScript, /action = "restore"/);
  assert.match(rollbackScript, /Copy-Item -Path \$backupFull/);
});
