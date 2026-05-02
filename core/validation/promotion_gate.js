import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";

const execFileAsync = promisify(execFile);
const BASE = path.resolve("C:\\Work");
const NEXT = path.join(BASE, "_mcp_next");

const CHECKS = [
  { name: "syntax: code_tools", command: "node", args: ["--check", path.join(NEXT, "code_tools.js")] },
  { name: "syntax: server_tools", command: "node", args: ["--check", path.join(NEXT, "server_tools.js")] },
  { name: "contract", command: "node", args: [path.join(NEXT, "contract_check.js"), NEXT] },
  { name: "registry", command: "node", args: [path.join(NEXT, "registry", "validate_registry.js")] },
  { name: "selfcheck", command: "node", args: [path.join(NEXT, "validation", "system_selfcheck.js")] },
];

const manifest = JSON.parse(await fs.readFile(path.join(NEXT, "validation", "runtime_manifest.json"), "utf8"));
const PROMOTION_FILES = manifest.files;

async function fileSha256(filePath) {
  const crypto = await import("crypto");
  const data = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function runCheck(check) {
  try {
    const { stdout, stderr } = await execFileAsync(check.command, check.args, { cwd: NEXT, windowsHide: true });
    return { name: check.name, status: "ok", stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    return {
      name: check.name,
      status: "fail",
      stdout: err.stdout?.trim() || "",
      stderr: err.stderr?.trim() || err.message,
      exit_code: err.code ?? 1,
    };
  }
}

export async function runPromotionGate() {
  const checks = [];
  for (const check of CHECKS) checks.push(await runCheck(check));

  const failed = checks.filter((check) => check.status !== "ok");
  const files = [];
  for (const rel of PROMOTION_FILES) {
    const full = path.join(NEXT, rel);
    const stat = await fs.stat(full);
    files.push({ path: rel.replaceAll("\\", "/"), bytes: stat.size, sha256: await fileSha256(full) });
  }

  return {
    status: failed.length ? "blocked" : "ready_for_promotion",
    checked_at: new Date().toISOString(),
    checks,
    files,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname.replace(/^\/(.:\/)/, "$1")) {
  runPromotionGate().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "ready_for_promotion") process.exit(1);
  }).catch((err) => {
    console.error(JSON.stringify({ status: "error", error: err?.message || String(err) }, null, 2));
    process.exit(1);
  });
}
