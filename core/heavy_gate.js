import { logPerf } from "./perf.js";

const MAX_ACTIVE = 1;
let active = 0;
const waiting = [];

function nowMs() { return Number(process.hrtime.bigint()) / 1e6; }
function pump() {
  if (active >= MAX_ACTIVE) return;
  const item = waiting.shift();
  if (!item) return;
  active += 1;
  item.start();
}

export function heavyStatus() {
  return { active, waiting: waiting.length, max_active: MAX_ACTIVE };
}

export async function withHeavySlot(name, details, fn) {
  const queuedAt = nowMs();
  return new Promise((resolve, reject) => {
    const start = async () => {
      const wait_ms = nowMs() - queuedAt;
      await logPerf({ type: "heavy_start", name, wait_ms, active, waiting: waiting.length, details });
      try { resolve(await fn()); }
      catch (e) { reject(e); }
      finally {
        active -= 1;
        await logPerf({ type: "heavy_done", name, active, waiting: waiting.length });
        pump();
      }
    };
    waiting.push({ start });
    logPerf({ type: "heavy_enqueued", name, active, waiting: waiting.length, details }).finally(pump);
  });
}
