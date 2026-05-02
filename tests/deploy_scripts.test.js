import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const deployScript = fs.readFileSync("deploy.ps1", "utf8");
const rollbackScript = fs.readFileSync("rollback.ps1", "utf8");

test("deploy script contains validation checks", () => {
  assert.match(deployScript, /Invoke-ValidationChecks/);
  assert.match(deployScript, /node --check/);
  assert.match(deployScript, /npm test/);
});

test("deploy script supports Execute mode", () => {
  assert.match(deployScript, /Execute/);
});

test("rollback script contains dry-run capability", () => {
  assert.match(rollbackScript, /WhatIfOnly/);
});

test("rollback script validates executed record", () => {
  assert.match(rollbackScript, /executed.json/);
});
