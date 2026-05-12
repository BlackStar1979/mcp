import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeRemoteRelativePath,
  assertAllowedFileExtension,
  joinRemoteUnderRoot,
} from "../core/remote_site_tools.js";

test("normalizeRemoteRelativePath accepts safe relative path", () => {
  assert.equal(normalizeRemoteRelativePath("assets/index.html"), "assets/index.html");
});

test("normalizeRemoteRelativePath rejects traversal", () => {
  assert.throws(() => normalizeRemoteRelativePath("../etc/passwd"), /path traversal/i);
});

test("normalizeRemoteRelativePath rejects absolute path", () => {
  assert.throws(() => normalizeRemoteRelativePath("/etc/passwd"), /absolute remote paths/i);
});

test("assertAllowedFileExtension accepts html", () => {
  assert.equal(assertAllowedFileExtension("index.html"), ".html");
});

test("assertAllowedFileExtension rejects php", () => {
  assert.throws(() => assertAllowedFileExtension("shell.php"), /not allowed/i);
});

test("joinRemoteUnderRoot resolves safe path under root", () => {
  assert.equal(
    joinRemoteUnderRoot("/home/ubuntu/apps/romion-site/html", "assets/app.js"),
    "/home/ubuntu/apps/romion-site/html/assets/app.js"
  );
});

test("joinRemoteUnderRoot blocks escape", () => {
  assert.throws(
    () => joinRemoteUnderRoot("/home/ubuntu/apps/romion-site/html", "../../secret.txt"),
    /path traversal|escapes root/i
  );
});
