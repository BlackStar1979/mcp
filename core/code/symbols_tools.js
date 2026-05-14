import { z } from "zod";

import { registerSafeTool } from "../responses.js";
import { audit } from "../audit.js";
import {
  CODE_SYMBOLS_OUTPUT,
  MAX_CODE_FILE_BYTES,
  MAX_SYMBOLS,
  READ_ONLY,
  extractSymbols,
  fs,
  linesOf,
  safePath,
  toRel,
} from "./shared_runtime.js";

export function registerCodeSymbolsTools(server) {
  registerSafeTool(server, "code_symbols", {
    title: "Extract code symbols",
    description: "Extract bounded structural symbols from JS/TS/Python files without executing user code.",
    inputSchema: z.object({ path: z.string() }),
    outputSchema: CODE_SYMBOLS_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ path: requestedPath }) => {
    const full = safePath(requestedPath);
    const stat = await fs.stat(full);
    if (!stat.isFile()) throw new Error("Not a file.");
    if (stat.size > MAX_CODE_FILE_BYTES) throw new Error(`File too large for code_symbols: ${stat.size} bytes.`);
    const rel = toRel(full);
    const text = await fs.readFile(full, "utf8");
    const { language, symbols } = extractSymbols(rel, text);
    await audit("code_symbols", {
      path: rel,
      language,
      bytes: stat.size,
      symbol_count: symbols.length,
    });
    return { path: rel, language, bytes: stat.size, total_lines: linesOf(text).length, symbol_count: symbols.length, truncated: symbols.length >= MAX_SYMBOLS, symbols };
  });
}

