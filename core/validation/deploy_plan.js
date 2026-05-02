import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { runPromotionGate } from "./promotion_gate.js";

const BASE = path.resolve("C:\\Work");
const NEXT = path.join(BASE, "_mcp_next");
const PROD = path.join(BASE, "mcp");
const DEPLOY_AUDIT = path.join(BASE, ".mcp_audit", "deployments.jsonl");

const manifest = JSON.parse(await fs.readFile(path.join(NEXT, "validation", "runtime_manifest.json"), "utf8"));
const FILES = manifest.files;

function deploymentId() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = crypto.randomBytes(4).toString("hex");
  return `${stamp}_${suffix}`;
}

async function sha256(filePath) {
  const data = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function fileRecord(rel) {
  const from = path.join(NEXT, rel);
  const to = path.join(PROD, rel);
  const sourceStat = await fs.stat(from);
  let target = null;
  try {
    const targetStat = await fs.stat(to);
    target = { exists: true, bytes: targetStat.size, sha256: await sha256(to) };
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
    target = { exists: false };
  }

  return {
    path: rel.replaceAll("\\", "/"),
    source: { bytes: sourceStat.size, sha256: await sha256(from) },
    target,
  };
}

async function appendDeployAudit(record) {
  await fs.mkdir(path.dirname(DEPLOY_AUDIT), { recursive: true });
  await fs.appendFile(DEPLOY_AUDIT, JSON.stringify({ timestamp: new Date().toISOString(), ...record }) + "\n", "utf8");
}

export async function createDeployPlan() {
  const gate = await runPromotionGate();
  const id = deploymentId();
  const files = [];

  for (const rel of FILES) files.push(await fileRecord(rel));

  const plan = {
    status: gate.status === "ready_for_promotion" ? "ready_to_deploy" : "blocked",
    deployment_id: id,
    created_at: new Date().toISOString(),
    source_root: "C:/Work/_mcp_next",
    target_root: "C:/Work/mcp",
    gate_status: gate.status,
    files,
    backup_root: `C:/Work/.mcp_deploy_backups/${id}`,
    instructions: [
      "Run promotion gate before deployment.",
      "Backup every target file before overwrite.",
      "Copy files preserving relative paths.",
      "Run production syntax check after copy.",
      "Restart MCP only after all checks pass."
    ]
  };

  await appendDeployAudit({ event: "deploy_plan_created", deployment_id: id, status: plan.status, file_count: files.length });
  return { gate, plan };
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname.replace(/^\/(.:\/)/, "$1")) {
  createDeployPlan().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.plan.status !== "ready_to_deploy") process.exit(1);
  }).catch((err) => {
    console.error(JSON.stringify({ status: "error", error: err?.message || String(err) }, null, 2));
    process.exit(1);
  });
}
