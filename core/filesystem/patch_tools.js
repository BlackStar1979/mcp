import { z } from "zod";
import fs from "fs/promises";

import { registerSafeTool } from "../responses.js";
import { safePath, toRel, assertWritablePath } from "../paths.js";
import { audit } from "../audit.js";
import { evaluatePolicyRisk, enforcePolicyDecision } from "../policy/engine.js";
import { createBackupIfExists } from "../fs_ops.js";
import { MAX_WRITE_BYTES } from "../config.js";

const STATE_CHANGING = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

const EDIT_FILE_PATCH_OUTPUT = z.object({
  status: z.enum(["dry_run", "patched"]),
  path: z.string(),
  mode: z.enum(["before", "after", "replace"]),
  anchor_matches: z.number().int().positive(),
  bytes_before: z.number().int().nonnegative(),
  bytes_after: z.number().int().nonnegative(),
  delta_bytes: z.number().int(),
  dry_run: z.boolean(),
  backup: z.string().nullable(),
}).strict();

function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while (true) {
    const found = text.indexOf(needle, index);
    if (found === -1) return count;
    count += 1;
    index = found + needle.length;
  }
}

function assertSingleOccurrence(text, needle, label) {
  const count = countOccurrences(text, needle);
  if (count !== 1) throw new Error(label + " must match exactly once; matched " + count + ".");
  return count;
}

function applyTextPatch(source, { mode, anchor, content }) {
  assertSingleOccurrence(source, anchor, "anchor");
  if (mode === "before") return source.replace(anchor, content + anchor);
  if (mode === "after") return source.replace(anchor, anchor + content);
  if (mode === "replace") return source.replace(anchor, content);
  throw new Error("Unsupported patch mode: " + mode);
}

export function registerFsPatchTools(server) {
  registerSafeTool(server, "edit_file_patch", {
    title: "Patch text file by anchor",
    description: "Safely edit a UTF-8 text file inside configured workspace roots using an exact single anchor. Creates a backup; supports dry-run.",
    inputSchema: z.object({
      path: z.string(),
      anchor: z.string().min(1),
      content: z.string(),
      mode: z.enum(["before", "after", "replace"]).default("replace"),
      dry_run: z.boolean().default(true),
      allow_protected: z.boolean().default(false),
      require_markers: z.array(z.string()).default([]),
    }),
    outputSchema: EDIT_FILE_PATCH_OUTPUT,
    annotations: STATE_CHANGING,
  }, async ({ path: requestedPath, anchor, content, mode, dry_run, allow_protected, require_markers }) => {
    assertWritablePath(requestedPath, { allowProtected: allow_protected });
    const policy = evaluatePolicyRisk({
      operation: "code_apply_patch",
      target: requestedPath,
      delta_bytes: content.length,
      intent: "change_behavior",
      has_dry_run: dry_run,
    });
    enforcePolicyDecision(policy, { confirm: !dry_run });

    const filePath = safePath(requestedPath);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error("Not a file.");

    const original = await fs.readFile(filePath, "utf8");
    const matches = countOccurrences(original, anchor);
    if (matches !== 1) throw new Error("Patch blocked: anchor must match exactly once; matched " + matches + ".");

    const patched = applyTextPatch(original, { mode, anchor, content });
    for (const marker of require_markers || []) {
      if (!patched.includes(marker)) throw new Error("Patch blocked: required marker missing after patch: " + marker);
    }

    const bytesBefore = Buffer.byteLength(original, "utf8");
    const bytesAfter = Buffer.byteLength(patched, "utf8");
    if (bytesAfter > MAX_WRITE_BYTES) throw new Error("Patch blocked: patched file is larger than " + MAX_WRITE_BYTES + " bytes.");

    const payload = {
      status: dry_run ? "dry_run" : "patched",
      path: toRel(filePath),
      mode,
      anchor_matches: matches,
      bytes_before: bytesBefore,
      bytes_after: bytesAfter,
      delta_bytes: bytesAfter - bytesBefore,
      dry_run,
      backup: null,
    };

    if (dry_run) {
      await audit("edit_file_patch_dry_run", payload);
      return payload;
    }

    const backup = await createBackupIfExists(filePath);
    await fs.writeFile(filePath, patched, "utf8");
    payload.backup = backup;
    await audit("edit_file_patch", payload);
    return payload;
  });
}
