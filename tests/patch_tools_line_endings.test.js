import test from "node:test";
import assert from "node:assert/strict";

import { applyTextPatch, countPatchAnchorMatches } from "../core/filesystem/patch_tools.js";

test("edit_file_patch anchors ignore line-ending style", () => {
  const source = "alpha\r\nbeta\r\ngamma\r\n";
  const anchorLf = "alpha\nbeta";
  const patched = applyTextPatch(source, {
    mode: "replace",
    anchor: anchorLf,
    content: "ALPHA\nBETA",
  });

  assert.equal(countPatchAnchorMatches(source, anchorLf), 1);
  assert.equal(patched, "ALPHA\r\nBETA\r\ngamma\r\n");
});

test("edit_file_patch supports old Macintosh CR anchors", () => {
  const source = "one\rtwo\rthree\r";
  const anchorLf = "one\ntwo";
  const patched = applyTextPatch(source, {
    mode: "after",
    anchor: anchorLf,
    content: "\ninserted",
  });

  assert.equal(patched, "one\rtwo\rinserted\rthree\r");
});

test("edit_file_patch still rejects ambiguous normalized anchors", () => {
  const source = "a\r\nb\r\na\nb\n";
  assert.throws(
    () => countPatchAnchorMatches(source, "a\nb"),
    /line_end_normalized=2/
  );
});
