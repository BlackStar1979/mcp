import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { buildDependencyGraph, impactGraph, safePath } from "../core/code/shared_runtime.js";

async function writeFile(relPath, content) {
  const full = safePath(relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf8");
  return full;
}

test("code graph resolves local CommonJS dependency expressions", async () => {
  const root = "mcp/.mcp_sandbox/code-graph-cjs-fixture";
  await fs.rm(safePath(root), { recursive: true, force: true });
  try {
    await writeFile(`${root}/entry.cjs`, `const helper = require("./helper");\nmodule.exports = helper.value;\n`);
    await writeFile(`${root}/helper.js`, `exports.value = 42;\n`);

    const graph = await buildDependencyGraph(root, true, 20);
    assert.equal(graph.truncated, false);
    assert.ok(graph.nodes.some((node) => node.path === `${root}/entry.cjs`));
    assert.ok(graph.nodes.some((node) => node.path === `${root}/helper.js`));
    assert.ok(graph.edges.some((edge) => edge.from === `${root}/entry.cjs` && edge.to === `${root}/helper.js` && edge.source === "./helper"));

    const impact = impactGraph(graph, `${root}/entry.cjs`, "dependencies", 5);
    assert.equal(impact.found, true);
    assert.equal(impact.dependencies_count, 1);
    assert.equal(impact.dependencies[0].path, `${root}/helper.js`);
  } finally {
    await fs.rm(safePath(root), { recursive: true, force: true });
  }
});

test("code graph ignores commented and stringified require text", async () => {
  const root = "mcp/.mcp_sandbox/code-graph-cjs-false-positive";
  await fs.rm(safePath(root), { recursive: true, force: true });
  try {
    await writeFile(
      `${root}/entry.cjs`,
      `// require("./ghost")\nconst sample = "require(\\"./phantom\\")";\nmodule.exports = sample;\n`
    );

    const graph = await buildDependencyGraph(root, true, 20);
    assert.equal(graph.nodes_count, 1);
    assert.equal(graph.edges_count, 0);
    assert.equal(graph.unresolved_count, 0);
  } finally {
    await fs.rm(safePath(root), { recursive: true, force: true });
  }
});
