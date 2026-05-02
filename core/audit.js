import fs from "fs/promises";
import { LOG_FILE } from "./config.js";

export async function audit(action, details = {}) {
  const entry = { ts: new Date().toISOString(), action, ...details };
  await fs.appendFile(LOG_FILE, JSON.stringify(entry)+"\n","utf8");
}
