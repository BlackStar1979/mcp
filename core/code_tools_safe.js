import { registerCodeSymbolsTools } from "./code/symbols_tools.js";
import { registerCodeAnalysisTools } from "./code/analysis_tools.js";

// Package facade: connector-safe code tool family entrypoint for server bootstrap.
export function registerCodeTools(server) {
  registerCodeSymbolsTools(server);
  registerCodeAnalysisTools(server);
}
